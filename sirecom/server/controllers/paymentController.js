const Payment = require('../models/Payment');
const Reservation = require('../models/Reservation');
const HttpError = require('../utils/HttpError');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { assertObjectId } = require('../utils/validators');
const { METODOS_PAGO, ESTADOS_PAGO, TURNO_INFO } = require('../utils/constants');
const { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } = require('../utils/webhookSignature');
const { createPayment, applyGatewayEvent } = require('../utils/paymentService');
const gateway = require('../utils/paymentGateway');
const { validarTarjeta, resultadoProcesador } = require('../utils/card');
const { payloadPago, qrDataUrl } = require('../utils/qr');
const { reportQrPaid, settleManually } = require('../utils/paymentService');

const present = (p) => {
  const r = p.reserva && p.reserva._id ? p.reserva : null;
  return {
    id: String(p._id),
    reservaId: String(r ? r._id : p.reserva),
    reserva: r
      ? { fecha: r.fecha, turno: r.turno, nombreTurno: TURNO_INFO[r.turno].nombre, horario: TURNO_INFO[r.turno].horario, estado: r.estado }
      : undefined,
    usuario: p.usuario && p.usuario._id ? { id: String(p.usuario._id), nombre: p.usuario.nombre, correo: p.usuario.correo } : String(p.usuario),
    monto: p.monto,
    moneda: p.moneda,
    metodo: p.metodo,
    referencia: p.referencia,
    estado: p.estado,
    motivoRechazo: p.motivoRechazo || '',
    tarjeta: p.tarjeta && p.tarjeta.ultimos4 ? { marca: p.tarjeta.marca, ultimos4: p.tarjeta.ultimos4 } : null,
    comprobante: p.comprobante || '',
    pagadoEn: p.pagadoEn || null,
    cobroSolicitado: Boolean(p.solicitadoEn),
    reportadoEn: p.reportadoEn || null,
    creadoEn: p.createdAt,
  };
};

/** Para QR y efectivo mientras el cobro siga abierto se adjunta el QR real (imagen PNG) con la referencia */
const withQr = async (p) => {
  const base = present(p);
  if (['qr', 'efectivo'].includes(p.metodo) && ['pendiente', 'en_verificacion'].includes(p.estado)) {
    base.qr = await qrDataUrl(payloadPago(p));
    base.qrTexto = payloadPago(p);
  }
  return base;
};

// RF-007: iniciar el cobro de una reserva "pendiente de pago" (UC-02, pasos 1-2)
exports.create = asyncHandler(async (req, res) => {
  const { reservaId, metodo } = req.body;
  assertObjectId(reservaId);
  if (!METODOS_PAGO.includes(metodo)) throw new HttpError(400, `metodo debe ser uno de: ${METODOS_PAGO.join(', ')}`);

  const reserva = await Reservation.findById(reservaId);
  if (!reserva) throw new HttpError(404, 'Reserva no encontrada');
  if (String(reserva.usuario) !== String(req.user._id)) throw new HttpError(403, 'No puedes pagar la reserva de otro usuario');

  const pago = await createPayment({ user: req.user, reserva, metodo });
  res.status(201).json({
    message: 'Cobro registrado. Completa el pago en la pasarela.',
    data: await withQr(pago),
    checkout: { referencia: pago.referencia, monto: pago.monto, moneda: pago.moneda, cardProcessing: config.payments.mockGateway },
  });
});

// UC-02: pago con tarjeta. El número y el CVV se validan en memoria y NUNCA se guardan ni se registran.
exports.payCard = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!config.payments.mockGateway) throw new HttpError(503, 'El procesador de tarjetas no está configurado');
  const { numero, titular, exp, cvv } = req.body || {};
  const v = validarTarjeta({ numero, titular, exp, cvv });
  if (v.errores.length) throw new HttpError(422, v.errores[0], v.errores);

  const pago = await Payment.findOne({ referencia: req.params.referencia });
  if (!pago) throw new HttpError(404, 'Referencia de pago desconocida');
  if (String(pago.usuario) !== String(req.user._id)) throw new HttpError(403, 'Este cobro pertenece a otro usuario');
  if (pago.metodo !== 'tarjeta') throw new HttpError(400, 'Este cobro no es un pago con tarjeta');
  if (pago.estado !== 'pendiente' || pago.solicitadoEn) throw new HttpError(409, 'El cobro ya fue enviado al procesador');

  // Solo se conserva marca y últimos 4 dígitos
  await Payment.updateOne({ _id: pago._id }, { $set: { tarjeta: { marca: v.marca, ultimos4: v.ultimos4 } } });
  const { resultado } = resultadoProcesador(numero);
  await gateway.requestCharge(pago, resultado);
  res.status(202).json({ message: 'Procesando el pago con tu tarjeta...', referencia: pago.referencia, tarjeta: { marca: v.marca, ultimos4: v.ultimos4 } });
});

// QR: el estudiante informa que ya pagó; queda "en verificación" hasta que caja lo valide
exports.reportQr = asyncHandler(async (req, res) => {
  const pago = await reportQrPaid({ referencia: req.params.referencia, userId: req.user._id });
  res.status(202).json({ message: 'Pago informado. Caja lo verificará en breve.', data: present(pago) });
});

// Caja: confirmar (efectivo recibido / abono QR verificado) o rechazar un cobro manual
exports.confirm = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const pago = await settleManually({ id: req.params.id, staff: req.user, aprobar: true });
  res.json({ message: 'Pago confirmado', data: present(pago) });
});

exports.reject = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const motivo = String(req.body?.motivo || '').trim().slice(0, 200);
  const pago = await settleManually({ id: req.params.id, staff: req.user, aprobar: false, motivo });
  res.json({ message: 'Pago rechazado', data: present(pago) });
});

// Caja: buscar un cobro por su referencia (digitada o leída desde el QR)
exports.lookup = asyncHandler(async (req, res) => {
  const ref = String(req.params.referencia || '').trim().toUpperCase();
  const pago = await Payment.findOne({ referencia: ref }).populate('reserva', 'fecha turno estado').populate('usuario', 'nombre correo').lean();
  if (!pago) throw new HttpError(404, 'No existe un cobro con esa referencia');
  res.json({ data: present(pago) });
});

// RF-008: webhook de la pasarela (sin JWT; se autentica con la firma HMAC-SHA256 del cuerpo crudo)
exports.webhook = asyncHandler(async (req, res) => {
  const ok = verify(req.rawBody, req.get(TIMESTAMP_HEADER), req.get(SIGNATURE_HEADER));
  if (!ok) throw new HttpError(401, 'Firma del webhook inválida o expirada');

  const { eventId, referencia, status, monto, motivo } = req.body || {};
  if (!eventId || !referencia || !status || monto === undefined) {
    throw new HttpError(400, 'El evento debe incluir eventId, referencia, status y monto');
  }
  const out = await applyGatewayEvent({ eventId: String(eventId), referencia: String(referencia), status, monto, motivo });
  // 200 también para duplicados: la pasarela no debe reintentar eventos ya conciliados
  res.json({ received: true, ...out });
});

// Historial de pagos del estudiante y liquidación de reservas pendientes
exports.myPayments = asyncHandler(async (req, res) => {
  const filter = { usuario: req.user._id };
  if (req.query.estado) {
    if (!ESTADOS_PAGO.includes(req.query.estado)) throw new HttpError(400, `estado debe ser uno de: ${ESTADOS_PAGO.join(', ')}`);
    filter.estado = req.query.estado;
  }
  const rows = await Payment.find(filter).populate('reserva', 'fecha turno estado').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ total: rows.length, data: await Promise.all(rows.map(withQr)) });
});

// Estado de un pago (comprobante) — solo su dueño o el administrador
exports.getOne = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const pago = await Payment.findById(req.params.id).populate('reserva', 'fecha turno estado').lean();
  if (!pago) throw new HttpError(404, 'Pago no encontrado');
  if (String(pago.usuario) !== String(req.user._id) && req.user.rol === 'estudiante') throw new HttpError(403, 'No puedes ver el pago de otro usuario');
  res.json({ data: present(pago) });
});

// Administración: listado de pagos (control y auditoría)
exports.listAll = asyncHandler(async (req, res) => {
  const filter = {};
  // Caja: cobros que requieren validación del personal (efectivo pendiente o QR informado)
  if (req.query.porValidar === 'true') {
    filter.$or = [{ metodo: 'efectivo', estado: 'pendiente' }, { metodo: 'qr', estado: 'en_verificacion' }];
  }
  if (req.query.metodo) {
    if (!METODOS_PAGO.includes(req.query.metodo)) throw new HttpError(400, `metodo debe ser uno de: ${METODOS_PAGO.join(', ')}`);
    filter.metodo = req.query.metodo;
  }
  if (req.query.estado) {
    if (!ESTADOS_PAGO.includes(req.query.estado)) throw new HttpError(400, `estado debe ser uno de: ${ESTADOS_PAGO.join(', ')}`);
    filter.estado = req.query.estado;
  }
  const rows = await Payment.find(filter)
    .populate('reserva', 'fecha turno estado')
    .populate('usuario', 'nombre correo')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json({ total: rows.length, data: rows.map(present) });
});
