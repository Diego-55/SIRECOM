/**
 * "Worker de Notificaciones y Recordatorios" (contenedor del C4 nivel 2).
 * Agrupa los trabajos en segundo plano. Puede ejecutarse:
 *   - dentro del proceso del API (WORKER_IN_PROCESS=true, por defecto), o
 *   - como proceso independiente:  npm run worker   (con WORKER_IN_PROCESS=false en el API)
 * Todos los trabajos usan operaciones atómicas en MongoDB, por lo que son seguros con varias instancias.
 */
const config = require('../config');
const reminders = require('./reminders');
const notifications = require('./notifications');
const paymentReconciliation = require('./paymentReconciliation');
const slotReconciliation = require('./slotReconciliation');

const startAll = () => {
  const timers = [notifications.start(), paymentReconciliation.start(), slotReconciliation.start()];
  if (config.enableReminders) timers.push(reminders.start());
  return timers;
};

module.exports = { startAll };
