// Pruebas HTTP del perímetro del Gateway que NO requieren base de datos:
// el pipeline rechaza la solicitud antes de llegar a la lógica de negocio (escenario ID-02).
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../app');
const { sign } = require('../utils/webhookSignature');

let server;
let base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = (path, opts = {}) => fetch(base + path, opts);

test('health responde 200 y X-Response-Time', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-response-time'), /ms$/);
});

test('ruta protegida sin token -> 401 (antes de tocar la lógica de negocio)', async () => {
  for (const path of ['/api/reservations/my-history', '/api/shifts', '/api/payments/my', '/api/dashboard/metrics']) {
    assert.equal((await call(path)).status, 401, path);
  }
});

test('token inválido -> 401', async () => {
  const r = await call('/api/payments/my', { headers: { Authorization: 'Bearer token.falso.xyz' } });
  assert.equal(r.status, 401);
});

test('ruta inexistente -> 404', async () => {
  assert.equal((await call('/api/no-existe')).status, 404);
});

test('webhook sin firma -> 401', async () => {
  const r = await call('/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"eventId":"e"}' });
  assert.equal(r.status, 401);
});

test('webhook con firma inválida -> 401', async () => {
  const body = JSON.stringify({ eventId: 'e1', referencia: 'SIR-X', status: 'succeeded', monto: 12 });
  const ts = String(Math.floor(Date.now() / 1000));
  const r = await call('/api/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sirecom-timestamp': ts, 'x-sirecom-signature': 'a'.repeat(64) },
    body,
  });
  assert.equal(r.status, 401);
});

test('webhook con firma válida pero cuerpo incompleto -> 400 (validación previa a la base de datos)', async () => {
  const body = JSON.stringify({ eventId: 'e1' });
  const ts = String(Math.floor(Date.now() / 1000));
  const r = await call('/api/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sirecom-timestamp': ts, 'x-sirecom-signature': sign(body, ts) },
    body,
  });
  assert.equal(r.status, 400);
});

test('login: la ráfaga de fuerza bruta sobre /api/auth recibe 429 al superar el límite (60 / 15 min)', async () => {
  // Credenciales sin correo: se rechazan con 400 sin consultar la BD, pero cuentan para el limitador.
  let ultimo = 0;
  for (let i = 0; i < 65; i += 1) {
    const r = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ultimo = r.status;
    if (r.status === 429) break;
  }
  assert.equal(ultimo, 429);
});
