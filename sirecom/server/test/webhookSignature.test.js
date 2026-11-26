require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { sign, verify } = require('../utils/webhookSignature');

const body = JSON.stringify({ eventId: 'evt_1', referencia: 'SIR-1', status: 'succeeded', monto: 12 });
const ts = String(Math.floor(Date.now() / 1000));

test('firma válida se acepta', () => {
  assert.equal(verify(body, ts, sign(body, ts)), true);
});

test('cuerpo alterado se rechaza (integridad)', () => {
  const alterado = body.replace('12', '1');
  assert.equal(verify(alterado, ts, sign(body, ts)), false);
});

test('firma con otro secreto se rechaza (autenticidad)', () => {
  assert.equal(verify(body, ts, sign(body, ts, 'otro-secreto-distinto-123456')), false);
});

test('timestamp fuera de la ventana se rechaza (anti-repetición)', () => {
  const viejo = String(Math.floor(Date.now() / 1000) - 3600);
  assert.equal(verify(body, viejo, sign(body, viejo)), false);
});

test('firma ausente, vacía o malformada se rechaza sin lanzar', () => {
  assert.equal(verify(body, ts, undefined), false);
  assert.equal(verify(body, ts, ''), false);
  assert.equal(verify(body, ts, 'zz-no-es-hex'), false);
  assert.equal(verify(body, undefined, sign(body, ts)), false);
});
