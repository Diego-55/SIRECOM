const config = require('../config');
const { reconcilePending } = require('../utils/paymentService');

let running = false;
const start = () => {
  const every = config.payments.reconcileEverySeconds * 1000;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    reconcilePending()
      .then((r) => { if (r.enVerificacion || r.consultados) console.log('[JOBS] Conciliación de pagos:', r); })
      .catch((e) => console.error('[PAGOS:CONCILIACION]', e.message))
      .finally(() => { running = false; });
  }, every);
  timer.unref();
  console.log(`[JOBS] Conciliación asíncrona de pagos activa (cada ${config.payments.reconcileEverySeconds} s)`);
  return timer;
};

module.exports = { start, run: reconcilePending };
