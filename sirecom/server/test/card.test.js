require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { luhn, marca, validarTarjeta, resultadoProcesador } = require('../utils/card');
const { payloadPago, qrDataUrl } = require('../utils/qr');

const ahora = new Date('2026-11-25T12:00:00');
const ok = { numero: '4242 4242 4242 4242', titular: 'Carlos Mendoza', exp: '12/28', cvv: '123' };

test('Luhn: acepta tarjetas válidas y rechaza inválidas', () => {
  assert.equal(luhn('4242424242424242'), true);
  assert.equal(luhn('5555 5555 5555 4444'), true);
  assert.equal(luhn('4242424242424241'), false);
  assert.equal(luhn('abcd'), false);
});

test('marca por prefijo', () => {
  assert.equal(marca('4242424242424242'), 'Visa');
  assert.equal(marca('5555555555554444'), 'Mastercard');
  assert.equal(marca('378282246310005'), 'American Express');
});

test('tarjeta válida: sin errores y solo devuelve marca y últimos 4', () => {
  const v = validarTarjeta(ok, ahora);
  assert.deepEqual(v.errores, []);
  assert.equal(v.ultimos4, '4242');
  assert.equal(v.marca, 'Visa');
  assert.equal(JSON.stringify(v).includes('4242424242424242'), false); // no se filtra el número
});

test('tarjeta vencida, CVV inválido y titular vacío se rechazan', () => {
  assert.match(validarTarjeta({ ...ok, exp: '10/26' }, ahora).errores.join(), /vencida/);
  assert.match(validarTarjeta({ ...ok, cvv: '12' }, ahora).errores.join(), /CVV/);
  assert.match(validarTarjeta({ ...ok, titular: '' }, ahora).errores.join(), /titular/);
  assert.match(validarTarjeta({ ...ok, exp: '1228' }, ahora).errores.join(), /MM\/AA/);
  assert.match(validarTarjeta({ ...ok, numero: '4242 4242 4242 4241' }, ahora).errores.join(), /número/);
});

test('el vencimiento en el mes actual todavía es válido', () => {
  assert.deepEqual(validarTarjeta({ ...ok, exp: '11/26' }, ahora).errores, []);
});

test('procesador: resultado determinista según el final de la tarjeta', () => {
  assert.equal(resultadoProcesador('4242424242424242').resultado, 'aprobado');
  assert.equal(resultadoProcesador('4000000000000002').resultado, 'rechazado');
  assert.equal(resultadoProcesador('4000000000009995').motivo, 'Fondos insuficientes');
  assert.equal(resultadoProcesador('4000000000000119').resultado, 'sin_respuesta');
});

test('QR: payload con referencia y monto, y la imagen es un PNG real', async () => {
  const p = { referencia: 'SIR-ABC-123', monto: 12, moneda: 'BOB' };
  assert.equal(payloadPago(p), 'SIRECOM|PAGO|SIR-ABC-123|12.00|BOB');
  const url = await qrDataUrl(payloadPago(p));
  assert.match(url, /^data:image\/png;base64,/);
  const png = Buffer.from(url.split(',')[1], 'base64');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});
