const ShiftConfig = require('../models/ShiftConfig');
const Reservation = require('../models/Reservation');
const { todayStr } = require('../utils/dates');

const EVERY_MS = 5 * 60 * 1000;
const QUIET_MS = 60 * 1000; // solo se corrige un turno sin actividad reciente (evita chocar con reservas en vuelo)

/**
 * Autorreparación de cupos: el descuento atómico del cupo y la creación de la reserva son dos escrituras
 * (la compensación cubre errores controlados, pero no una caída del proceso entre ambas). Este job compara
 *   cuposDisponibles  vs  cuposTotales - (reservas no canceladas)
 * y corrige la diferencia con una actualización condicionada al valor observado (CAS).
 */
const run = async (now = new Date()) => {
  const quiet = new Date(now.getTime() - QUIET_MS);
  const turnos = await ShiftConfig.find({ fecha: { $gte: todayStr(now) }, updatedAt: { $lt: quiet } }).lean();
  const corregidos = [];
  for (const t of turnos) {
    const ocupados = await Reservation.countDocuments({ fecha: t.fecha, turno: t.turno, estado: { $ne: 'cancelada' } });
    const esperado = Math.max(0, Math.min(t.cuposTotales, t.cuposTotales - ocupados));
    if (esperado !== t.cuposDisponibles) {
      const r = await ShiftConfig.updateOne(
        { _id: t._id, cuposDisponibles: t.cuposDisponibles, updatedAt: { $lt: quiet } },
        { $set: { cuposDisponibles: esperado } }
      );
      if (r.modifiedCount) corregidos.push({ fecha: t.fecha, turno: t.turno, antes: t.cuposDisponibles, despues: esperado });
    }
  }
  return corregidos;
};

const start = () => {
  const timer = setInterval(() => {
    run()
      .then((c) => { if (c.length) console.log('[JOBS] Cupos reconciliados:', c); })
      .catch((e) => console.error('[CUPOS:RECONCILIACION]', e.message));
  }, EVERY_MS);
  timer.unref();
  console.log('[JOBS] Reconciliación de cupos activa (cada 5 min)');
  return timer;
};

module.exports = { start, run };
