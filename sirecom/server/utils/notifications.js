const Notification = require('../models/Notification');
const config = require('../config');
const { TURNO_INFO } = require('./constants');

/** Retroceso exponencial: 30 s, 1 min, 2 min, 4 min... con tope de 15 min */
const backoffMs = (intento) => Math.min(30000 * 2 ** Math.max(0, intento - 1), 15 * 60 * 1000);

/** Arma el snapshot que se guarda en la cola a partir de usuario + reserva (+ extras) */
const snapshot = (user, reserva, extras = {}) => ({
  nombre: user.nombre,
  turnoNombre: TURNO_INFO[reserva.turno].nombre,
  horario: TURNO_INFO[reserva.turno].horario,
  fecha: reserva.fecha,
  ...extras,
});

/**
 * Encola una notificación en MongoDB (rápido y no bloqueante respecto al SMTP).
 * Nunca lanza: un problema de cola se registra, pero no rompe la operación de negocio.
 * Si se indica `claveUnica` y ya existe, no se duplica (idempotente).
 */
const enqueue = async (tipo, user, reserva, extras = {}, claveUnica) => {
  try {
    await Notification.create({
      tipo,
      usuario: user._id,
      para: user.correo,
      datos: snapshot(user, reserva, extras),
      maxIntentos: config.notifications.maxAttempts,
      claveUnica,
    });
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // ya estaba encolada
    console.error('[NOTIFY:ENQUEUE]', err.message);
    return false;
  }
};

module.exports = { enqueue, backoffMs, snapshot };
