/**
 * Adaptador de la PASARELA DE PAGO EXTERNA (sistema externo del C4 nivel 1).
 *
 * Interfaz que debe cumplir cualquier pasarela real:
 *   requestCharge(payment, opts)  -> inicia el cobro (la pasarela responderá luego con un webhook firmado)
 *   queryStatus(payment)          -> consulta el estado del cobro (usada en la conciliación asíncrona)
 *
 * Aquí se incluye un SANDBOX (PAYMENT_MOCK_GATEWAY=true) que simula el comportamiento real:
 *   aprobado      -> envía el webhook "succeeded" firmado con HMAC-SHA256
 *   rechazado     -> envía el webhook "failed" con un motivo
 *   sin_respuesta -> NO envía webhook (simula caída/latencia); la conciliación del worker lo resuelve después
 */
const crypto = require('crypto');
const config = require('../config');
const Payment = require('../models/Payment');
const { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } = require('./webhookSignature');

const buildEvent = (payment, status, motivo) => ({
  eventId: `evt_${crypto.randomBytes(8).toString('hex')}`,
  referencia: payment.referencia,
  status,
  monto: payment.monto,
  ...(motivo ? { motivo } : {}),
});

/** Envía un webhook firmado al endpoint público de SIRECOM (HTTP real, como lo haría la pasarela) */
const dispatchWebhook = async (event) => {
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${config.payments.publicApiUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: sign(rawBody, timestamp),
    },
    body: rawBody,
  });
  if (!res.ok) throw new Error(`Webhook respondió ${res.status}`);
};

const requestCharge = async (payment, resultado) => {
  await Payment.updateOne({ _id: payment._id }, { $set: { solicitadoEn: new Date(), simulacion: resultado } });
  if (resultado === 'sin_respuesta') return;
  const event = buildEvent(
    payment,
    resultado === 'aprobado' ? 'succeeded' : 'failed',
    resultado === 'rechazado' ? 'Fondos insuficientes (simulación)' : undefined
  );
  const timer = setTimeout(() => {
    dispatchWebhook(event).catch((e) => console.error('[PASARELA:MOCK] No se pudo entregar el webhook:', e.message));
  }, config.payments.mockDelayMs);
  timer.unref();
};

/**
 * Consulta de estado (sandbox). Devuelve { status: 'succeeded' | 'failed' | 'unknown' }.
 * "sin_respuesta" simula una pasarela que se recupera: tras 2 consultas ya informa el cobro aprobado.
 */
const queryStatus = async (payment) => {
  if (payment.simulacion === 'aprobado') return { status: 'succeeded' };
  if (payment.simulacion === 'rechazado') return { status: 'failed', motivo: 'Fondos insuficientes (simulación)' };
  if (payment.simulacion === 'sin_respuesta' && payment.intentosConciliacion >= 2) return { status: 'succeeded' };
  return { status: 'unknown' };
};

module.exports = { requestCharge, queryStatus, buildEvent, dispatchWebhook };
