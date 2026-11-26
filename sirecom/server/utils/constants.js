const ROLES = ['estudiante', 'cocina_central', 'admin'];
const TURNOS = ['desayuno', 'almuerzo', 'cena'];
const ESTADOS_RESERVA = ['activa', 'cancelada', 'asistio', 'ausente'];
// Pagos (RF-007 / RF-008)
const ESTADOS_PAGO_RESERVA = ['pendiente', 'en_verificacion', 'pagada'];
const ESTADOS_PAGO = ['pendiente', 'en_verificacion', 'pagada', 'rechazada', 'cancelada'];
const METODOS_PAGO = ['qr', 'tarjeta', 'efectivo'];
const MONEDA = 'BOB';
const TIPOS_NOTIFICACION = ['confirmacion', 'cancelacion', 'recordatorio', 'pago_confirmado', 'pago_rechazado'];
const DIAS_HABILES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const TURNO_INFO = {
  desayuno: { nombre: 'Desayuno Universitario', inicio: '07:00', fin: '09:00', horario: '07:00h - 09:00h', cupos: 300, precio: 5 },
  almuerzo: { nombre: 'Almuerzo del Día', inicio: '12:00', fin: '14:00', horario: '12:00h - 14:00h', cupos: 500, precio: 12 },
  cena: { nombre: 'Cena Institucional', inicio: '18:00', fin: '20:00', horario: '18:00h - 20:00h', cupos: 400, precio: 10 },
};

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UMBRAL_CRITICO = 10; // % de cupos disponibles por debajo del cual el estado es crítico

module.exports = {
  ESTADOS_PAGO_RESERVA, ESTADOS_PAGO, METODOS_PAGO, MONEDA, TIPOS_NOTIFICACION,
  ROLES, TURNOS, ESTADOS_RESERVA, DIAS_HABILES, DIAS, TURNO_INFO, FECHA_REGEX, UMBRAL_CRITICO,
};
