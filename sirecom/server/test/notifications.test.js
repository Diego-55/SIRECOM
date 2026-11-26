require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { backoffMs } = require('../utils/notifications');
const { renderNotification } = require('../utils/mailer');

test('retroceso exponencial con tope de 15 minutos', () => {
  assert.equal(backoffMs(1), 30000);
  assert.equal(backoffMs(2), 60000);
  assert.equal(backoffMs(3), 120000);
  assert.equal(backoffMs(20), 15 * 60 * 1000);
});

test('cada tipo de notificación genera asunto y texto con el detalle del turno', () => {
  const datos = { nombre: 'Carlos', turnoNombre: 'Almuerzo del Día', horario: '12:00h - 14:00h', fecha: '2026-11-24', monto: 12, comprobante: 'CMP-1', motivo: 'Fondos insuficientes' };
  for (const tipo of ['confirmacion', 'cancelacion', 'recordatorio', 'pago_confirmado', 'pago_rechazado']) {
    const m = renderNotification(tipo, datos);
    assert.match(m.subject, /^SIRECOM: /);
    assert.match(m.text, /Almuerzo del Día/);
    assert.ok(m.html.includes('Carlos'));
  }
  assert.match(renderNotification('pago_confirmado', datos).text, /Bs 12\.00/);
  assert.match(renderNotification('pago_confirmado', datos).text, /CMP-1/);
});

test('tipo desconocido lanza error (la cola lo marcará para reintento/fallo)', () => {
  assert.throws(() => renderNotification('otro', {}), /desconocido/);
});
