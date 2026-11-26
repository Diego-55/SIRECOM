// Prueba de la lógica de conciliación (RF-008) con modelos simulados en memoria: no requiere MongoDB.
// Verifica idempotencia, validación de monto, estados finales y efectos secundarios (reserva + notificación).
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');

const Payment = require('../models/Payment');
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { applyGatewayEvent } = require('../utils/paymentService');

let pago;
let reservaPago;
const notificaciones = [];

const clonar = (o) => JSON.parse(JSON.stringify(o));
const aplicar = (doc, update) => {
  Object.assign(doc, update.$set || {});
  for (const [k, v] of Object.entries(update.$addToSet || {})) if (!doc[k].includes(v)) doc[k].push(v);
};

test.beforeEach(() => {
  pago = { _id: 'p1', reserva: 'r1', usuario: 'u1', referencia: 'SIR-1', monto: 12, estado: 'pendiente', eventosProcesados: [], solicitadoEn: new Date() };
  reservaPago = 'pendiente';
  notificaciones.length = 0;

  Payment.findOne = async ({ referencia }) => (referencia === pago.referencia ? clonar(pago) : null);
  Payment.findOneAndUpdate = async (filtro, update) => {
    const okEstado = !filtro.estado || filtro.estado.$in.includes(pago.estado);
    const okEvento = !filtro.eventosProcesados || !pago.eventosProcesados.includes(filtro.eventosProcesados.$ne);
    if (!okEstado || !okEvento) return null;
    aplicar(pago, update);
    return clonar(pago);
  };
  Reservation.updateOne = async (_f, update) => { reservaPago = update.$set.estadoPago; };
  Reservation.findById = async () => ({ _id: 'r1', turno: 'almuerzo', fecha: '2026-11-24' });
  User.findById = async () => ({ _id: 'u1', nombre: 'Carlos', correo: 'carlos@uab.edu.bo' });
  Notification.create = async (doc) => { notificaciones.push(doc); return doc; };
});

test('succeeded: pago pagada, comprobante, reserva pagada y notificación encolada', async () => {
  const r = await applyGatewayEvent({ eventId: 'e1', referencia: 'SIR-1', status: 'succeeded', monto: 12 });
  assert.equal(r.result, 'applied');
  assert.equal(pago.estado, 'pagada');
  assert.match(pago.comprobante, /^CMP-\d{8}-[0-9A-F]{6}$/);
  assert.equal(reservaPago, 'pagada');
  assert.equal(notificaciones.length, 1);
  assert.equal(notificaciones[0].tipo, 'pago_confirmado');
});

test('idempotencia: el mismo evento repetido no se aplica dos veces', async () => {
  await applyGatewayEvent({ eventId: 'e1', referencia: 'SIR-1', status: 'succeeded', monto: 12 });
  const comprobante = pago.comprobante;
  const r = await applyGatewayEvent({ eventId: 'e1', referencia: 'SIR-1', status: 'succeeded', monto: 12 });
  assert.equal(r.result, 'duplicate');
  assert.equal(pago.comprobante, comprobante);
  assert.equal(notificaciones.length, 1);
});

test('un pago ya pagado ignora un evento distinto (estado final inmutable)', async () => {
  await applyGatewayEvent({ eventId: 'e1', referencia: 'SIR-1', status: 'succeeded', monto: 12 });
  const r = await applyGatewayEvent({ eventId: 'e2', referencia: 'SIR-1', status: 'failed', monto: 12, motivo: 'x' });
  assert.equal(r.result, 'ignored');
  assert.equal(pago.estado, 'pagada');
  assert.equal(reservaPago, 'pagada');
});

test('failed: pago rechazada con motivo; la reserva sigue pendiente de pago (UC-02 3a)', async () => {
  const r = await applyGatewayEvent({ eventId: 'e1', referencia: 'SIR-1', status: 'failed', monto: 12, motivo: 'Fondos insuficientes' });
  assert.equal(r.result, 'applied');
  assert.equal(pago.estado, 'rechazada');
  assert.equal(pago.motivoRechazo, 'Fondos insuficientes');
  assert.equal(reservaPago, 'pendiente');
  assert.equal(notificaciones[0].tipo, 'pago_rechazado');
  assert.equal(notificaciones[0].datos.motivo, 'Fondos insuficientes');
});

test('un pago en verificación se concilia con la confirmación tardía', async () => {
  pago.estado = 'en_verificacion';
  const r = await applyGatewayEvent({ eventId: 'reconcile-1', referencia: 'SIR-1', status: 'succeeded', monto: 12 });
  assert.equal(r.result, 'applied');
  assert.equal(pago.estado, 'pagada');
});

test('monto distinto al cobro -> 422 y el pago no cambia', async () => {
  await assert.rejects(() => applyGatewayEvent({ eventId: 'e1', referencia: 'SIR-1', status: 'succeeded', monto: 1 }), (e) => e.status === 422);
  assert.equal(pago.estado, 'pendiente');
});

test('referencia desconocida -> 404; status inválido -> 400', async () => {
  await assert.rejects(() => applyGatewayEvent({ eventId: 'e1', referencia: 'NO', status: 'succeeded', monto: 12 }), (e) => e.status === 404);
  await assert.rejects(() => applyGatewayEvent({ eventId: 'e1', referencia: 'SIR-1', status: 'raro', monto: 12 }), (e) => e.status === 400);
});

// ---- Caja: confirmación manual (efectivo / QR) ----
const { settleManually, reportQrPaid } = require('../utils/paymentService');

test('caja confirma un cobro en efectivo: pagada, confirmadoPor y reserva pagada', async () => {
  pago.metodo = 'efectivo';
  Payment.findById = async () => clonar(pago);
  const r = await settleManually({ id: 'p1', staff: { _id: 'staff1' }, aprobar: true });
  assert.equal(pago.estado, 'pagada');
  assert.equal(pago.confirmadoPor, 'staff1');
  assert.equal(reservaPago, 'pagada');
  assert.equal(r.estado, 'pagada');
});

test('caja no puede confirmar dos veces el mismo cobro', async () => {
  pago.metodo = 'efectivo';
  Payment.findById = async () => clonar(pago);
  await settleManually({ id: 'p1', staff: { _id: 's' }, aprobar: true });
  await assert.rejects(() => settleManually({ id: 'p1', staff: { _id: 's' }, aprobar: true }), (e) => e.status === 409);
});

test('los pagos con tarjeta no se validan manualmente', async () => {
  pago.metodo = 'tarjeta';
  Payment.findById = async () => clonar(pago);
  await assert.rejects(() => settleManually({ id: 'p1', staff: { _id: 's' }, aprobar: true }), (e) => e.status === 400);
  assert.equal(pago.estado, 'pendiente');
});

test('caja rechaza un QR informado: queda rechazada y la reserva pendiente', async () => {
  pago.metodo = 'qr';
  pago.estado = 'en_verificacion';
  Payment.findById = async () => clonar(pago);
  await settleManually({ id: 'p1', staff: { _id: 's' }, aprobar: false, motivo: 'No llegó el abono' });
  assert.equal(pago.estado, 'rechazada');
  assert.equal(pago.motivoRechazo, 'No llegó el abono');
  assert.equal(reservaPago, 'pendiente');
});

test('QR: el estudiante informa el pago y queda en verificación; otro usuario no puede', async () => {
  pago.metodo = 'qr';
  let setEstado;
  Payment.findOneAndUpdate = async (f, u) => { if (f.estado === pago.estado) { Object.assign(pago, u.$set); setEstado = pago.estado; return clonar(pago); } return null; };
  await assert.rejects(() => reportQrPaid({ referencia: 'SIR-1', userId: 'otro' }), (e) => e.status === 403);
  await reportQrPaid({ referencia: 'SIR-1', userId: 'u1' });
  assert.equal(setEstado, 'en_verificacion');
  assert.equal(reservaPago, 'en_verificacion');
  await assert.rejects(() => reportQrPaid({ referencia: 'SIR-1', userId: 'u1' }), (e) => e.status === 409);
});
