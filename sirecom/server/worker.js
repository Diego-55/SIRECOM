/**
 * Punto de arranque del Worker como PROCESO INDEPENDIENTE (despliegue separado del API).
 * Uso:  npm run worker      (y en el API: WORKER_IN_PROCESS=false)
 */
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { startAll } = require('./jobs');

(async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error('[DB] No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  }
  startAll();
  console.log('[WORKER] Proceso independiente en ejecución');
  const shutdown = async (signal) => {
    console.log(`\n[WORKER] ${signal} recibido, cerrando...`);
    await mongoose.connection.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  // Mantiene el proceso vivo (los timers están "unref")
  setInterval(() => {}, 1 << 30);
})();
