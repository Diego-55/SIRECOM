/**
 * Máquina de estados del pago (UC-02). Lógica pura, sin acceso a base de datos,
 * para poder probarla de forma aislada.
 *
 *   pendiente ──► en_verificacion ──► pagada
 *       │               │
 *       ├──► pagada     ├──► rechazada ──► pendiente (reintento del estudiante)
 *       ├──► rechazada  └──► cancelada
 *       └──► cancelada
 */
const TRANSITIONS = {
  pendiente: ['en_verificacion', 'pagada', 'rechazada', 'cancelada'],
  en_verificacion: ['pagada', 'rechazada', 'cancelada'],
  rechazada: ['pendiente', 'cancelada'],
  pagada: [],
  cancelada: [],
};

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

/** Estados en los que aún se espera el resultado de la pasarela */
const ESPERANDO_RESULTADO = ['pendiente', 'en_verificacion'];

/** Traduce el estado informado por la pasarela al estado interno */
const fromGatewayStatus = (status) => {
  if (status === 'succeeded') return 'pagada';
  if (status === 'failed') return 'rechazada';
  return null;
};

module.exports = { TRANSITIONS, canTransition, ESPERANDO_RESULTADO, fromGatewayStatus };
