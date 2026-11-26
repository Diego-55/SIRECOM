const mongoose = require('mongoose');
const config = require('./config');
const connectDB = require('./config/db');
const app = require('./app');
const { startAll } = require('./jobs');

const start = async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error('[DB] No se pudo conectar a MongoDB:', err.message);
    console.error('     Verifica MONGODB_URI en server/.env y que MongoDB esté en ejecución.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[API] SIRECOM escuchando en http://localhost:${config.port}`);
    console.log(`[API] Swagger UI: http://localhost:${config.port}/api-docs`);
  });
  // Worker en el mismo proceso (por defecto) o aparte con `npm run worker` + WORKER_IN_PROCESS=false
  if (config.workerInProcess) startAll();
  else console.log('[API] WORKER_IN_PROCESS=false: los trabajos en segundo plano corren en un proceso aparte (npm run worker)');

  const shutdown = (signal) => {
    console.log(`\n[API] ${signal} recibido, cerrando...`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start();
