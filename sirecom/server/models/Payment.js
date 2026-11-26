const mongoose = require('mongoose');
const { ESTADOS_PAGO, METODOS_PAGO, MONEDA } = require('../utils/constants');

/**
 * RF-007 / RF-008 / UC-02: pago de una reserva mediante pasarela externa.
 * - `referencia` identifica el cobro en la pasarela (se envía y regresa en el webhook).
 * - `eventosProcesados` hace idempotente la conciliación: un mismo evento nunca se aplica dos veces.
 */
const paymentSchema = new mongoose.Schema(
  {
    reserva: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    monto: { type: Number, required: true, min: 0 },
    moneda: { type: String, default: MONEDA },
    metodo: { type: String, enum: { values: METODOS_PAGO, message: 'Método de pago no válido' }, required: true },
    referencia: { type: String, required: true, unique: true },
    estado: { type: String, enum: ESTADOS_PAGO, default: 'pendiente', index: true },
    motivoRechazo: { type: String, default: '' },
    comprobante: { type: String, default: '' },
    pagadoEn: { type: Date },
    // Cobro solicitado a la pasarela (inicio del conteo de tiempo de espera)
    solicitadoEn: { type: Date },
    // Conciliación asíncrona (UC-02, flujo 3b)
    intentosConciliacion: { type: Number, default: 0 },
    ultimoIntento: { type: Date },
    eventosProcesados: { type: [String], default: [] },
    // Tarjeta: NUNCA se guarda el número ni el CVV; solo marca y últimos 4 dígitos para el comprobante
    tarjeta: { marca: { type: String }, ultimos4: { type: String } },
    // QR / efectivo: el personal de caja valida el cobro (RF-008, validación manual)
    reportadoEn: { type: Date },
    confirmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Resultado que informa el procesador de tarjetas (determinado por el número de tarjeta)
    simulacion: { type: String, enum: ['aprobado', 'rechazado', 'sin_respuesta'] },
  },
  { timestamps: true }
);

// Un único registro de pago por reserva (los reintentos reutilizan el documento)
paymentSchema.index({ reserva: 1 }, { unique: true });
// Búsquedas del worker de conciliación
paymentSchema.index({ estado: 1, solicitadoEn: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
