require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, fromGatewayStatus } = require('../utils/paymentState');

test('transiciones permitidas del flujo UC-02', () => {
  assert.equal(canTransition('pendiente', 'en_verificacion'), true);
  assert.equal(canTransition('en_verificacion', 'pagada'), true);
  assert.equal(canTransition('pendiente', 'rechazada'), true);
  assert.equal(canTransition('rechazada', 'pendiente'), true); // reintento
});

test('un pago "pagada" es terminal: no puede cambiar', () => {
  for (const to of ['pendiente', 'en_verificacion', 'rechazada', 'cancelada']) {
    assert.equal(canTransition('pagada', to), false);
  }
});

test('estado desconocido no permite transiciones', () => {
  assert.equal(canTransition('inexistente', 'pagada'), false);
});

test('mapeo del estado de la pasarela al estado interno', () => {
  assert.equal(fromGatewayStatus('succeeded'), 'pagada');
  assert.equal(fromGatewayStatus('failed'), 'rechazada');
  assert.equal(fromGatewayStatus('pending'), null);
});
