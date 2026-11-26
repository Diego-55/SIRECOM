const Reservation = require('../models/Reservation');
const User = require('../models/User');
const { todayStr, nowMinutes, toMinutes } = require('../utils/dates');
const { TURNOS, TURNO_INFO } = require('../utils/constants');
const { enqueue } = require('../utils/notifications');

const MINUTES_BEFORE = 60;
const EVERY_MS = 5 * 60 * 1000;

/** RF-010: recordatorio por correo ~1 hora antes del inicio del turno */
const run = async () => {
  const ahora = nowMinutes();
  for (const turno of TURNOS) {
    const inicio = toMinutes(TURNO_INFO[turno].inicio);
    if (ahora < inicio - MINUTES_BEFORE || ahora >= inicio) continue;

    const pendientes = await Reservation.find({ fecha: todayStr(), turno, estado: 'activa', recordatorioEnviado: false })
      .select('_id')
      .lean();
    for (const p of pendientes) {
      const r = await Reservation.findById(p._id);
      if (!r || r.estado !== 'activa' || r.recordatorioEnviado) continue;
      const user = await User.findById(r.usuario);
      if (user) {
        // La clave única hace idempotente el encolado: con varias instancias solo se crea UN recordatorio por reserva.
        // Se encola ANTES de marcar la reserva: si algo falla en medio, el recordatorio no se pierde.
        await enqueue('recordatorio', user, r, {}, `recordatorio:${r._id}`);
      }
      await Reservation.updateOne({ _id: r._id, recordatorioEnviado: false }, { $set: { recordatorioEnviado: true } });
    }
  }
};

const start = () => {
  const timer = setInterval(() => run().catch((e) => console.error('[REMINDERS]', e.message)), EVERY_MS);
  timer.unref();
  console.log('[JOBS] Recordatorios por correo activos (cada 5 min)');
  return timer;
};

module.exports = { start, run };
