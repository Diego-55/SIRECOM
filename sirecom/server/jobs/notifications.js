const Notification = require('../models/Notification');
const { send, renderNotification } = require('../utils/mailer');
const { backoffMs } = require('../utils/notifications');
const config = require('../config');

const LOCK_MS = 60 * 1000;

/** Reclama de forma atómica la siguiente notificación lista (o una "enviando" cuyo bloqueo expiró: worker caído) */
const claimNext = (now = new Date()) =>
  Notification.findOneAndUpdate(
    {
      $or: [
        { estado: 'pendiente', proximoIntento: { $lte: now } },
        { estado: 'enviando', bloqueadoHasta: { $lt: now } },
      ],
    },
    { $set: { estado: 'enviando', bloqueadoHasta: new Date(now.getTime() + LOCK_MS) }, $inc: { intentos: 1 } },
    { sort: { proximoIntento: 1 }, new: true }
  );

const processOne = async (n) => {
  try {
    const { subject, text, html } = renderNotification(n.tipo, n.datos);
    await send({ to: n.para, subject, text, html });
    await Notification.updateOne({ _id: n._id }, { $set: { estado: 'enviada', enviadaEn: new Date(), ultimoError: '' }, $unset: { bloqueadoHasta: '' } });
    return 'enviada';
  } catch (err) {
    const agotada = n.intentos >= (n.maxIntentos || config.notifications.maxAttempts);
    await Notification.updateOne(
      { _id: n._id },
      {
        $set: {
          estado: agotada ? 'fallida' : 'pendiente',
          proximoIntento: new Date(Date.now() + backoffMs(n.intentos)),
          ultimoError: String(err.message).slice(0, 300),
        },
        $unset: { bloqueadoHasta: '' },
      }
    );
    console.error(`[NOTIFY] ${n.tipo} -> ${n.para} falló (intento ${n.intentos}): ${err.message}`);
    return agotada ? 'fallida' : 'reintento';
  }
};

/** Procesa hasta `limit` notificaciones por ciclo */
const run = async (limit = 25) => {
  const out = { enviada: 0, reintento: 0, fallida: 0 };
  for (let i = 0; i < limit; i += 1) {
    const n = await claimNext();
    if (!n) break;
    out[await processOne(n)] += 1;
  }
  return out;
};

let running = false;
const start = () => {
  const timer = setInterval(() => {
    if (running) return; // evita ciclos solapados
    running = true;
    run().catch((e) => console.error('[NOTIFY]', e.message)).finally(() => { running = false; });
  }, config.notifications.pollMs);
  timer.unref();
  console.log(`[JOBS] Cola de notificaciones activa (cada ${config.notifications.pollMs / 1000} s, reintentos con retroceso exponencial)`);
  return timer;
};

module.exports = { start, run, claimNext, processOne };
