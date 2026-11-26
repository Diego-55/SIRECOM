/**
 * Validación de tarjetas (sin librerías externas). El número y el CVV NUNCA se guardan ni se registran:
 * se validan en memoria, se envían al procesador y solo se conserva marca + últimos 4 dígitos.
 */
const limpiar = (n) => String(n || '').replace(/[\s-]/g, '');

/** Algoritmo de Luhn */
const luhn = (numero) => {
  const d = limpiar(numero);
  if (!/^\d{13,19}$/.test(d)) return false;
  let suma = 0;
  let alterno = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let n = Number(d[i]);
    if (alterno) { n *= 2; if (n > 9) n -= 9; }
    suma += n;
    alterno = !alterno;
  }
  return suma % 10 === 0;
};

const marca = (numero) => {
  const d = limpiar(numero);
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'American Express';
  return 'Tarjeta';
};

/** Valida los datos y devuelve { errores: [...], marca, ultimos4 } */
const validarTarjeta = ({ numero, titular, exp, cvv }, ahora = new Date()) => {
  const errores = [];
  const d = limpiar(numero);
  if (!luhn(d)) errores.push('El número de tarjeta no es válido');
  if (!titular || String(titular).trim().length < 3) errores.push('Ingresa el nombre del titular');

  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(exp || '').trim());
  if (!m) {
    errores.push('La fecha de vencimiento debe tener el formato MM/AA');
  } else {
    const mes = Number(m[1]);
    const anio = 2000 + Number(m[2]);
    const venceFin = new Date(anio, mes, 0, 23, 59, 59); // último día del mes de vencimiento
    if (mes < 1 || mes > 12) errores.push('Mes de vencimiento no válido');
    else if (venceFin < ahora) errores.push('La tarjeta está vencida');
  }

  const m4 = marca(d);
  const largoCvv = m4 === 'American Express' ? 4 : 3;
  if (!new RegExp(`^\\d{${largoCvv}}$`).test(String(cvv || ''))) errores.push(`El CVV debe tener ${largoCvv} dígitos`);

  return { errores, marca: m4, ultimos4: d.slice(-4) };
};

/**
 * Procesador de tarjetas interno (adaptador reemplazable por una pasarela real, p. ej. Stripe o un PSP local).
 * Comportamiento determinista según el final de la tarjeta, como hacen los procesadores en modo de integración:
 *   ...0002 -> rechazada (tarjeta declinada) · ...9995 -> rechazada (fondos insuficientes)
 *   ...0119 -> la pasarela no responde (se concilia después) · cualquier otra tarjeta válida -> aprobada
 */
const resultadoProcesador = (numero) => {
  const fin = limpiar(numero).slice(-4);
  if (fin === '0002') return { resultado: 'rechazado', motivo: 'Tarjeta rechazada por el emisor' };
  if (fin === '9995') return { resultado: 'rechazado', motivo: 'Fondos insuficientes' };
  if (fin === '0119') return { resultado: 'sin_respuesta' };
  return { resultado: 'aprobado' };
};

module.exports = { luhn, marca, validarTarjeta, resultadoProcesador, limpiar };
