const crypto = require('crypto');
const Payment = require('../models/Payment');
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const config = require('../config');
const { MONEDA, TURNO_INFO } = require('./constants');
const { ESPERANDO_RESULTADO, fromGatewayStatus } = require('./paymentState');
const { enqueue } = require('./notifications');
const gateway = require('./paymentGateway');

const newReferencia = () => `SIR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const newComprobante = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `CMP-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

/**
 * RF-007: registra (o reutiliza) el cobro de una reserva activa y devuelve el pago "pendiente".
 * Los reintentos tras un rechazo reutilizan el mismo documento con una nueva referencia.
 */
const createPayment = async ({ user, reserva, metodo }) => {
  const monto = reserva.monto > 0 ? reserva.monto : TURNO_INFO[reserva.turno].precio;
  if (reserva.estado !== 'activa') throw new HttpError(409, 'Solo se pueden pagar reservas activas');
  if (reserva.estadoPago === 'pagada') throw new HttpError(409, 'La reserva ya está pagada');

  const existente = await Payment.findOne({ reserva: reserva._id });
  if (existente) {
    if (existente.estado === 'pagada') throw new HttpError(409, 'La reserva ya está pagada');
    if (ESPERANDO_RESULTADO.includes(existente.estado)) {
      if (existente.solicitadoEn) throw new HttpError(409, 'Ya hay un cobro en curso para esta reserva');
      // Cobro creado pero aún no enviado a la pasarela: se permite cambiar el método
      existente.metodo = metodo;
      await existente.save();
      return existente;
    }
    // rechazada / cancelada -> nuevo intento (transición atómica condicionada al estado previo)
    const reintento = await Payment.findOneAndUpdate(
      { _id: existente._id, estado: { $in: ['rechazada', 'cancelada'] } },
      {
        $set: {
          estado: 'pendiente', metodo, referencia: newReferencia(), motivoRechazo: '', intentosConciliacion: 0,
          monto,
        },
        $unset: { solicitadoEn: '', ultimoIntento: '', simulacion: '', reportadoEn: '', tarjeta: '', confirmadoPor: '' },
      },
      { new: true }
    );
    if (!reintento) throw new HttpError(409, 'El pago cambió de estado, vuelve a intentarlo');
    return reintento;
  }

  try {
    return await Payment.create({
      reserva: reserva._id,
      usuario: user._id,
      monto,
      moneda: MONEDA,
      metodo,
      referencia: newReferencia(),
    });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Ya existe un pago en curso para esta reserva');
    throw err;
  }
};

const notifyPayment = async (payment, tipo, extras = {}) => {
  const [user, reserva] = await Promise.all([User.findById(payment.usuario), Reservation.findById(payment.reserva)]);
  if (!user || !reserva) return;
  await enqueue(tipo, user, reserva, { monto: payment.monto, ...extras });
};

/**
 * RF-008: concilia el estado de pago de forma automática al recibir una confirmación de la pasarela
 * (webhook o consulta de conciliación). Es IDEMPOTENTE: el mismo eventId nunca se aplica dos veces,
 * y un pago en estado final no se vuelve a modificar. Devuelve { result: applied | duplicate | ignored }.
 */
const applyGatewayEvent = async ({ eventId, referencia, status, monto, motivo, confirmadoPor }) => {
  const target = fromGatewayStatus(status);
  if (!target) throw new HttpError(400, 'status debe ser "succeeded" o "failed"');

  const payment = await Payment.findOne({ referencia });
  if (!payment) throw new HttpError(404, 'Referencia de pago desconocida');
  if (Number(monto) !== payment.monto) throw new HttpError(422, 'El monto informado no coincide con el cobro');

  const set = { estado: target };
  if (target === 'pagada') {
    set.pagadoEn = new Date();
    set.comprobante = newComprobante();
    if (confirmadoPor) set.confirmadoPor = confirmadoPor;
  } else {
    set.motivoRechazo = String(motivo || 'Rechazado por la pasarela').slice(0, 200);
  }

  // Transición atómica: solo si aún se espera resultado y el evento no fue procesado
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, estado: { $in: ESPERANDO_RESULTADO }, eventosProcesados: { $ne: eventId } },
    { $set: set, $addToSet: { eventosProcesados: eventId } },
    { new: true }
  );

  if (!updated) {
    const duplicado = payment.eventosProcesados.includes(eventId);
    return { result: duplicado ? 'duplicate' : 'ignored', estado: payment.estado };
  }

  if (target === 'pagada') {
    await Reservation.updateOne({ _id: updated.reserva }, { $set: { estadoPago: 'pagada' } });
    await notifyPayment(updated, 'pago_confirmado', { comprobante: updated.comprobante });
  } else {
    // UC-02 3a: la reserva se mantiene "pendiente de pago" y se notifica el motivo
    await Reservation.updateOne({ _id: updated.reserva, estadoPago: { $ne: 'pagada' } }, { $set: { estadoPago: 'pendiente' } });
    await notifyPayment(updated, 'pago_rechazado', { motivo: updated.motivoRechazo });
  }
  return { result: 'applied', estado: updated.estado };
};

/** Cancelar una reserva cancela su cobro en curso (si no estaba pagado) */
const cancelForReservation = async (reservaId) => {
  await Payment.updateOne(
    { reserva: reservaId, estado: { $in: ['pendiente', 'en_verificacion', 'rechazada'] } },
    { $set: { estado: 'cancelada' } }
  );
};

/**
 * UC-02, flujo 3b — conciliación asíncrona (ejecutada por el worker):
 *  1) pagos "pendiente" cuyo cobro lleva más de N segundos sin respuesta -> "en_verificacion"
 *  2) pagos "en_verificacion" -> se consulta a la pasarela y se aplica el resultado (con reintentos acotados)
 */
const reconcilePending = async (now = new Date()) => {
  const { verifyAfterSeconds, reconcileEverySeconds, reconcileMaxAttempts } = config.payments;
  const resumen = { enVerificacion: 0, consultados: 0, resueltos: 0 };

  const vencidos = await Payment.find({
    metodo: 'tarjeta',
    estado: 'pendiente',
    solicitadoEn: { $lte: new Date(now.getTime() - verifyAfterSeconds * 1000) },
  }).select('_id reserva').lean();
  for (const p of vencidos) {
    const r = await Payment.updateOne({ _id: p._id, estado: 'pendiente' }, { $set: { estado: 'en_verificacion' } });
    if (r.modifiedCount) {
      resumen.enVerificacion += 1;
      await Reservation.updateOne({ _id: p.reserva, estadoPago: { $ne: 'pagada' } }, { $set: { estadoPago: 'en_verificacion' } });
    }
  }

  const aConciliar = await Payment.find({
    metodo: 'tarjeta',
    estado: 'en_verificacion',
    intentosConciliacion: { $lt: reconcileMaxAttempts },
    $or: [{ ultimoIntento: { $exists: false } }, { ultimoIntento: { $lte: new Date(now.getTime() - reconcileEverySeconds * 1000) } }],
  }).select('_id').lean();

  for (const { _id } of aConciliar) {
    // "Reclamo" atómico: solo una instancia del worker consulta cada pago en cada ciclo
    const p = await Payment.findOneAndUpdate(
      { _id, estado: 'en_verificacion', $or: [{ ultimoIntento: { $exists: false } }, { ultimoIntento: { $lte: new Date(now.getTime() - reconcileEverySeconds * 1000) } }] },
      { $set: { ultimoIntento: now }, $inc: { intentosConciliacion: 1 } },
      { new: true }
    );
    if (!p) continue;
    resumen.consultados += 1;
    const r = await gateway.queryStatus(p);
    if (r.status === 'succeeded' || r.status === 'failed') {
      await applyGatewayEvent({
        eventId: `reconcile-${p.referencia}-${p.intentosConciliacion}`,
        referencia: p.referencia,
        status: r.status,
        monto: p.monto,
        motivo: r.motivo,
      });
      resumen.resueltos += 1;
    }
  }
  return resumen;
};

/**
 * QR: el estudiante informa que ya pagó con su app bancaria. El cobro queda "en verificación"
 * hasta que el personal de caja lo valide contra el abono recibido.
 */
const reportQrPaid = async ({ referencia, userId }) => {
  const pago = await Payment.findOne({ referencia });
  if (!pago) throw new HttpError(404, 'Referencia de pago desconocida');
  if (String(pago.usuario) !== String(userId)) throw new HttpError(403, 'Este cobro pertenece a otro usuario');
  if (pago.metodo !== 'qr') throw new HttpError(400, 'Este cobro no es un pago por QR');
  const now = new Date();
  const upd = await Payment.findOneAndUpdate(
    { _id: pago._id, estado: 'pendiente' },
    { $set: { estado: 'en_verificacion', reportadoEn: now, solicitadoEn: now } },
    { new: true }
  );
  if (!upd) throw new HttpError(409, 'El cobro ya fue informado o cambió de estado');
  await Reservation.updateOne({ _id: upd.reserva, estadoPago: { $ne: 'pagada' } }, { $set: { estadoPago: 'en_verificacion' } });
  return upd;
};

/**
 * Caja: el personal confirma (efectivo recibido o abono QR verificado) o rechaza un cobro manual.
 * Reutiliza la conciliación idempotente: un cobro no puede confirmarse dos veces.
 */
const settleManually = async ({ id, staff, aprobar, motivo }) => {
  const pago = await Payment.findById(id);
  if (!pago) throw new HttpError(404, 'Pago no encontrado');
  if (!['efectivo', 'qr'].includes(pago.metodo)) throw new HttpError(400, 'Los pagos con tarjeta no se validan manualmente');
  const out = await applyGatewayEvent({
    eventId: `manual-${aprobar ? 'ok' : 'no'}-${pago.referencia}`,
    referencia: pago.referencia,
    status: aprobar ? 'succeeded' : 'failed',
    monto: pago.monto,
    motivo: aprobar ? undefined : motivo || 'El personal de caja no encontró el abono',
    confirmadoPor: staff._id,
  });
  if (out.result !== 'applied') throw new HttpError(409, `El pago ya estaba ${out.estado}`);
  return Payment.findById(pago._id);
};

module.exports = { createPayment, applyGatewayEvent, cancelForReservation, reconcilePending, reportQrPaid, settleManually, newReferencia };
