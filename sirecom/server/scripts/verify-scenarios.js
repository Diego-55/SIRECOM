/**
 * Verificación automática de los escenarios de calidad del informe (sección 4.2) contra el prototipo en ejecución.
 *
 *   Terminal 1:  npm run dev                 (con RATE_LIMIT_MAX alto para la ráfaga: RATE_LIMIT_MAX=100000)
 *   Terminal 2:  npm run verify:rnf          (o:  API_URL=http://localhost:5000 CONCURRENCIA=500 CUPOS=100 npm run verify:rnf)
 *
 * [ID-01] Rendimiento y escalabilidad: N solicitudes concurrentes de reserva sobre un turno con K cupos
 *         -> exactamente K reservas, N-K respuestas 409, cuposDisponibles = 0 (0 % de sobrecupo) y latencias (X-Response-Time).
 * [ID-02] Seguridad perimetral: sin token -> 401, rol estudiante en ruta de admin -> 403, ráfaga de login -> 429.
 * [ID-03] Disponibilidad ante fallos externos: la reserva responde 201 sin esperar al correo y la notificación queda en la cola.
 *
 * Crea usuarios y datos de prueba (correo loadtest-*) y los elimina al terminar.
 */
const mongoose = require('mongoose');
const config = require('../config');
const connectDB = require('../config/db');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const ShiftConfig = require('../models/ShiftConfig');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { signToken } = require('../utils/token');
const { todayStr, addDays, isWeekday } = require('../utils/dates');

const API = (process.env.API_URL || `http://127.0.0.1:${config.port}`).replace(/\/$/, '');
const N = Number(process.env.CONCURRENCIA) || 500; // RNF-006: picos de hasta 500 solicitudes concurrentes
const K = Number(process.env.CUPOS) || 100; // cupos del turno de prueba
const TURNO = 'almuerzo';
const dominio = config.allowedEmailDomains[0];

const percentil = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const resultados = [];
const check = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok });
  console.log(`${ok ? '  ✔' : '  ✘'} ${nombre}${detalle ? `  (${detalle})` : ''}`);
};

const proximoDiaHabil = () => {
  let d = addDays(todayStr(), 1);
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
};

(async () => {
  await connectDB();
  const fecha = proximoDiaHabil();
  const prefijo = `loadtest-${Date.now()}`;
  const ids = [];

  try {
    const health = await fetch(`${API}/api/health`).catch(() => null);
    if (!health || !health.ok) throw new Error(`El API no responde en ${API}. Inicia el servidor con "npm run dev".`);

    // ---------- Preparación ----------
    const usuarios = await User.insertMany(
      Array.from({ length: N }, (_, i) => ({
        nombre: `Usuario Carga ${i}`, correo: `${prefijo}-${i}@${dominio}`, passwordHash: 'x', rol: 'estudiante', verificado: true,
      }))
    );
    ids.push(...usuarios.map((u) => u._id));
    const tokens = usuarios.map((u) => signToken(u));
    await ShiftConfig.updateOne(
      { fecha, turno: TURNO },
      { $set: { horaInicio: '12:00', horaFin: '14:00', cuposTotales: K, cuposDisponibles: K } },
      { upsert: true }
    );

    // ---------- [ID-01] ----------
    console.log(`\n[ID-01] Rendimiento y escalabilidad: ${N} solicitudes concurrentes, ${K} cupos (${fecha}, ${TURNO})`);
    const t0 = Date.now();
    const respuestas = await Promise.all(
      tokens.map(async (token) => {
        const inicio = performance.now();
        const res = await fetch(`${API}/api/reservations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ turno: TURNO, fecha }),
        });
        const total = performance.now() - inicio;
        const servidor = parseFloat(res.headers.get('x-response-time')) || 0;
        await res.arrayBuffer();
        return { status: res.status, total, servidor };
      })
    );
    const ok = respuestas.filter((r) => r.status === 201).length;
    const conflicto = respuestas.filter((r) => r.status === 409).length;
    const limitadas = respuestas.filter((r) => r.status === 429).length;
    const otros = N - ok - conflicto - limitadas;
    const shift = await ShiftConfig.findOne({ fecha, turno: TURNO }).lean();
    const enBD = await Reservation.countDocuments({ fecha, turno: TURNO, usuario: { $in: ids }, estado: 'activa' });
    const srv = respuestas.map((r) => r.servidor);
    const tot = respuestas.map((r) => r.total);
    console.log(`  Duración total: ${Date.now() - t0} ms · 201: ${ok} · 409: ${conflicto} · 429: ${limitadas} · otros: ${otros}`);
    console.log(`  Tiempo de servidor (X-Response-Time): p50=${percentil(srv, 50).toFixed(1)} ms · p95=${percentil(srv, 95).toFixed(1)} ms · máx=${Math.max(...srv).toFixed(1)} ms`);
    console.log(`  Tiempo extremo a extremo (cliente):   p50=${percentil(tot, 50).toFixed(1)} ms · p95=${percentil(tot, 95).toFixed(1)} ms · máx=${Math.max(...tot).toFixed(1)} ms`);
    if (limitadas) console.log('  ⚠ Hubo 429: sube RATE_LIMIT_MAX del servidor para medir solo el rendimiento de reservas.');
    check(`0 % de sobrecupo: reservas confirmadas = cupos (${ok} = ${K})`, ok === K);
    check(`Base de datos coherente: ${enBD} reservas activas, cuposDisponibles = ${shift.cuposDisponibles}`, enBD === K && shift.cuposDisponibles === 0);
    check('Los demás reciben 409 (sin cupos), ningún error 5xx', conflicto === N - K && otros === 0);
    check(`Latencia del servidor p95 < 200 ms (RNF-001)`, percentil(srv, 95) < 200, `p95 ${percentil(srv, 95).toFixed(1)} ms`);

    // ---------- [ID-02] ----------
    console.log('\n[ID-02] Seguridad perimetral');
    const sinToken = await fetch(`${API}/api/shifts`);
    check('Sin token -> 401', sinToken.status === 401);
    const adminRoute = await fetch(`${API}/api/shifts/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[0]}` },
      body: JSON.stringify({ turno: TURNO, cuposTotales: 10 }),
    });
    check('Rol estudiante en PUT /api/shifts/config -> 403', adminRoute.status === 403);
    const menuRoute = await fetch(`${API}/api/menus`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[0]}` }, body: '{}',
    });
    check('Rol estudiante en POST /api/menus -> 403', menuRoute.status === 403);
    const hook = await fetch(`${API}/api/payments/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 'x', referencia: 'x', status: 'succeeded', monto: 1 }),
    });
    check('Webhook de pagos sin firma HMAC -> 401', hook.status === 401);
    let r429 = false;
    for (let i = 0; i < 70 && !r429; i += 1) {
      const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      r429 = r.status === 429;
    }
    check('Ráfaga de intentos de login -> 429 (rate limit)', r429);

    // ---------- [ID-03] ----------
    console.log('\n[ID-03] Aislamiento de fallos externos (cola persistente de notificaciones)');
    const reservaConf = await Reservation.findOne({ usuario: { $in: ids }, fecha, turno: TURNO, estado: 'activa' }).lean();
    if (reservaConf) {
      await new Promise((r) => setTimeout(r, 500));
      const n = await Notification.findOne({ usuario: reservaConf.usuario, tipo: 'confirmacion' }).lean();
      check('La reserva respondió 201 y la confirmación quedó en la cola (no se envió dentro de la petición)', Boolean(n), n ? `estado: ${n.estado}` : '');
    } else {
      check('Se encontró una reserva confirmada del usuario de prueba', false);
    }
  } catch (err) {
    console.error('\nError:', err.message);
    resultados.push({ nombre: 'ejecución', ok: false });
  } finally {
    // ---------- Limpieza ----------
    if (ids.length) {
      const reservas = await Reservation.find({ usuario: { $in: ids } }).select('_id').lean();
      await Promise.all([
        Reservation.deleteMany({ usuario: { $in: ids } }),
        Payment.deleteMany({ reserva: { $in: reservas.map((r) => r._id) } }),
        Notification.deleteMany({ usuario: { $in: ids } }),
        User.deleteMany({ _id: { $in: ids } }),
      ]);
    }
    await mongoose.connection.close();
    const fallidos = resultados.filter((r) => !r.ok).length;
    console.log(`\n${fallidos === 0 ? 'TODOS LOS ESCENARIOS VERIFICADOS' : `${fallidos} verificación(es) fallida(s)`}\n`);
    process.exit(fallidos === 0 ? 0 : 1);
  }
})();
