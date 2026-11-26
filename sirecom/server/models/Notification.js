const mongoose = require('mongoose');
const { TIPOS_NOTIFICACION } = require('../utils/constants');

/**
 * Bandeja de salida persistente (patrón Outbox) para notificaciones por correo.
 * La API solo ENCOLA (operación rápida en MongoDB); el worker las ENVÍA con reintentos
 * y retroceso exponencial. Si el SMTP cae o el proceso se reinicia, nada se pierde.
 */
const notificationSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: TIPOS_NOTIFICACION, required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    para: { type: String, required: true },
    datos: { type: mongoose.Schema.Types.Mixed, default: {} },
    estado: { type: String, enum: ['pendiente', 'enviando', 'enviada', 'fallida'], default: 'pendiente' },
    intentos: { type: Number, default: 0 },
    maxIntentos: { type: Number, default: 5 },
    proximoIntento: { type: Date, default: Date.now },
    bloqueadoHasta: { type: Date },
    ultimoError: { type: String, default: '' },
    enviadaEn: { type: Date },
    // Evita duplicados (p. ej. un solo recordatorio por reserva aunque haya varias instancias)
    claveUnica: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ estado: 1, proximoIntento: 1 });
notificationSchema.index({ claveUnica: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
