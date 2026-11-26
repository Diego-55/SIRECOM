const swaggerJsdoc = require('swagger-jsdoc');

/* ---------- Helpers para mantener la especificación legible ---------- */
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema, example) => ({ content: { 'application/json': { schema, ...(example ? { example } : {}) } } });
const errorRes = (description) => ({ description, ...json(ref('Error')) });
const R = {
  400: errorRes('Solicitud inválida (validación)'),
  401: errorRes('No autenticado o token inválido/expirado'),
  403: errorRes('Rol sin permisos para este recurso'),
  404: errorRes('Recurso no encontrado'),
  409: errorRes('Conflicto de negocio (cupos agotados, duplicado, fuera de horario)'),
  429: errorRes('Demasiadas solicitudes / intentos'),
};
const secured = [{ bearerAuth: [] }];
const q = (name, description, schema = { type: 'string' }, required = false) => ({ name, in: 'query', required, description, schema });
const idParam = { name: 'id', in: 'path', required: true, description: 'ObjectId de MongoDB', schema: { type: 'string', example: '66f1a2b3c4d5e6f708192a3b' } };
const body = (schema, example) => ({ required: true, ...json(schema, example) });

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'SIRECOM API',
    version: '1.0.0',
    description:
      'API REST de **SIRECOM - Sistema de Reservas de Comedores Universitarios** (Universidad Adventista de Bolivia).\n\n' +
      '**Autenticación:** login en dos pasos (credenciales + OTP por correo) que devuelve un JWT. ' +
      'Pulsa **Authorize** y pega el token (sin el prefijo `Bearer`).\n\n' +
      '**Roles (RBAC):** `estudiante`, `cocina_central`, `admin`.',
    contact: { name: 'Equipo SIRECOM - Arquitectura de Software' },
  },
  servers: [{ url: '/', description: 'Servidor actual' }],
  tags: [
    { name: 'Auth', description: 'Registro, login con OTP y sesión' },
    { name: 'Usuarios', description: 'Perfil del usuario' },
    { name: 'Menús', description: 'Menú diario y semanal' },
    { name: 'Turnos', description: 'Cupos en tiempo real y configuración' },
    { name: 'Reservas', description: 'Reserva, cancelación, historial y asistencia' },
    { name: 'Pagos', description: 'Pago de reservas, pasarela externa y webhook de conciliación (RF-007, RF-008)' },
    { name: 'Dashboard', description: 'Métricas para Cocina Central' },
    { name: 'Reportes', description: 'Exportación de reportes' },
    { name: 'Sistema', description: 'Salud del servicio' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          status: { type: 'integer', example: 400 },
          message: { type: 'string', example: 'Error de validación' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '66f1a2b3c4d5e6f708192a3b' },
          nombre: { type: 'string', example: 'Carlos Mendoza' },
          correo: { type: 'string', format: 'email', example: 'carlos.mendoza@uab.edu.bo' },
          rol: { type: 'string', enum: ['estudiante', 'cocina_central', 'admin'] },
          carrera: { type: 'string', example: 'Ingeniería Civil' },
          fotoUrl: { type: 'string', example: '' },
          verificado: { type: 'boolean' },
        },
      },
      OtpRequired: {
        type: 'object',
        properties: {
          otpRequired: { type: 'boolean', example: true },
          correo: { type: 'string' },
          expiresInMinutes: { type: 'integer', example: 5 },
          message: { type: 'string' },
        },
      },
      LoginSuccess: {
        type: 'object',
        properties: {
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          tokenType: { type: 'string', example: 'Bearer' },
          expiresIn: { type: 'string', example: '1d' },
          user: ref('User'),
        },
      },
      Menu: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          diaSemana: { type: 'string', enum: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] },
          fecha: { type: 'string', example: '2026-11-10' },
          turno: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] },
          tituloPlato: { type: 'string', example: 'Guiso de Lentejas con Arroz y Filete de Pollo' },
          descripcion: { type: 'string', example: 'Acompañado de ensalada mixta, sopa de verduras, postre y refresco natural.' },
          calorias: { type: 'number', example: 850 },
          horario: { type: 'string', example: '12:00h - 14:00h' },
          imagenUrl: { type: 'string' },
        },
      },
      MenuInput: {
        type: 'object',
        required: ['fecha', 'turno', 'tituloPlato', 'descripcion', 'calorias'],
        properties: {
          fecha: { type: 'string', example: '2026-11-10' },
          turno: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] },
          tituloPlato: { type: 'string' },
          descripcion: { type: 'string' },
          calorias: { type: 'number', example: 850 },
          horario: { type: 'string', example: '12:00h - 14:00h' },
          imagenUrl: { type: 'string' },
        },
      },
      Shift: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fecha: { type: 'string' },
          turno: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] },
          nombre: { type: 'string', example: 'Almuerzo del Día' },
          horario: { type: 'string', example: '12:00h - 14:00h' },
          cuposTotales: { type: 'integer', example: 500 },
          cuposDisponibles: { type: 'integer', example: 42 },
          cuposReservados: { type: 'integer', example: 458 },
          porcentajeDisponible: { type: 'number', example: 8.4 },
          estado: { type: 'string', enum: ['normal', 'critico', 'agotado'] },
          miReservaId: { type: 'string', nullable: true },
        },
      },
      Reservation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          usuario: { oneOf: [{ type: 'string' }, { type: 'object' }] },
          fecha: { type: 'string', example: '2026-11-10' },
          turno: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] },
          nombreTurno: { type: 'string' },
          horario: { type: 'string' },
          estado: { type: 'string', enum: ['activa', 'cancelada', 'asistio', 'ausente'] },
          estadoPago: { type: 'string', enum: ['pendiente', 'en_verificacion', 'pagada'] },
          monto: { type: 'number', example: 12 },
          canceladaEn: { type: 'string', format: 'date-time', nullable: true },
          creadaEn: { type: 'string', format: 'date-time' },
        },
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reservaId: { type: 'string' },
          monto: { type: 'number', example: 12 },
          moneda: { type: 'string', example: 'BOB' },
          metodo: { type: 'string', enum: ['qr', 'tarjeta', 'efectivo'] },
          referencia: { type: 'string', example: 'SIR-M3K9X2-1A2B3C4D' },
          estado: { type: 'string', enum: ['pendiente', 'en_verificacion', 'pagada', 'rechazada', 'cancelada'] },
          motivoRechazo: { type: 'string' },
          comprobante: { type: 'string', example: 'CMP-20261123-A1B2C3' },
          pagadoEn: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: { tags: ['Sistema'], summary: 'Estado del servicio', responses: { 200: { description: 'Servicio operativo', ...json({ type: 'object', properties: { status: { type: 'string', example: 'ok' }, uptime: { type: 'number' } } }) } } },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar estudiante con correo institucional (RF-001)',
        description: 'Crea la cuenta y envía un OTP al correo. Para activarla, completa el paso 2 de `POST /api/auth/login` con ese código. El rol siempre es `estudiante`.',
        requestBody: body(
          { type: 'object', required: ['nombre', 'correo', 'password'], properties: { nombre: { type: 'string' }, correo: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 8 }, carrera: { type: 'string' } } },
          { nombre: 'Carlos Mendoza', correo: 'carlos.mendoza@uab.edu.bo', password: 'Sirecom#2026', carrera: 'Ingeniería Civil' }
        ),
        responses: { 201: { description: 'Cuenta creada; OTP enviado', ...json(ref('OtpRequired')) }, 400: R[400], 409: R[409], 429: R[429] },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión con OTP (RF-002)',
        description: '**Paso 1:** envía `correo` + `password` → responde `otpRequired` y envía el código.\n**Paso 2:** reenvía `correo` + `password` + `otp` → devuelve el JWT.',
        requestBody: body(
          { type: 'object', required: ['correo', 'password'], properties: { correo: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' }, otp: { type: 'string', pattern: '^\\d{6}$', description: 'Código de 6 dígitos (solo en el paso 2)' } } },
          { correo: 'carlos.mendoza@uab.edu.bo', password: 'Sirecom#2026', otp: '123456' }
        ),
        responses: {
          200: { description: 'Paso 1: OTP enviado. Paso 2: sesión iniciada', ...json({ oneOf: [ref('OtpRequired'), ref('LoginSuccess')] }) },
          400: R[400], 401: R[401], 429: R[429],
        },
      },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Usuario de la sesión activa', security: secured, responses: { 200: { description: 'Usuario autenticado', ...json({ type: 'object', properties: { user: ref('User') } }) }, 401: R[401] } },
    },
    '/api/users/profile': {
      put: {
        tags: ['Usuarios'],
        summary: 'Editar perfil: nombre, carrera y fotografía (extensión de RF-002)',
        security: secured,
        requestBody: body({ type: 'object', properties: { nombre: { type: 'string' }, carrera: { type: 'string' }, fotoUrl: { type: 'string', description: 'URL http(s) o imagen en base64 (data URI)' } } }, { nombre: 'Carlos Mendoza', carrera: 'Ingeniería Civil' }),
        responses: { 200: { description: 'Perfil actualizado', ...json({ type: 'object', properties: { message: { type: 'string' }, user: ref('User') } }) }, 400: R[400], 401: R[401] },
      },
    },
    '/api/menus': {
      get: {
        tags: ['Menús'],
        summary: 'Consultar menús del día o de la semana (RF-005)',
        security: secured,
        parameters: [q('fecha', 'Día exacto (YYYY-MM-DD)'), q('semana', 'Cualquier fecha de la semana a consultar (lunes a viernes)'), q('turno', 'Filtra por turno', { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] })],
        responses: { 200: { description: 'Lista de menús', ...json({ type: 'object', properties: { total: { type: 'integer' }, data: { type: 'array', items: ref('Menu') } } }) }, 400: R[400], 401: R[401] },
      },
      post: {
        tags: ['Menús'],
        summary: 'Registrar menú (Cocina Central / Admin) (RF-005)',
        security: secured,
        requestBody: body(ref('MenuInput')),
        responses: { 201: { description: 'Menú creado', ...json({ type: 'object', properties: { message: { type: 'string' }, data: ref('Menu') } }) }, 400: R[400], 401: R[401], 403: R[403], 409: R[409] },
      },
    },
    '/api/menus/{id}': {
      put: {
        tags: ['Menús'],
        summary: 'Editar menú existente (Cocina Central / Admin) (RF-005)',
        security: secured,
        parameters: [idParam],
        requestBody: body({ type: 'object', properties: { tituloPlato: { type: 'string' }, descripcion: { type: 'string' }, calorias: { type: 'number' }, horario: { type: 'string' }, imagenUrl: { type: 'string' } } }),
        responses: { 200: { description: 'Menú actualizado', ...json({ type: 'object', properties: { message: { type: 'string' }, data: ref('Menu') } }) }, 400: R[400], 401: R[401], 403: R[403], 404: R[404], 409: R[409] },
      },
    },
    '/api/shifts': {
      get: {
        tags: ['Turnos'],
        summary: 'Cupos disponibles por turno en tiempo real (RF-004)',
        security: secured,
        parameters: [q('fecha', 'YYYY-MM-DD (por defecto, hoy)')],
        responses: { 200: { description: 'Turnos con contador de cupos', ...json({ type: 'object', properties: { fecha: { type: 'string' }, abierto: { type: 'boolean' }, turnos: { type: 'array', items: ref('Shift') } } }) }, 400: R[400], 401: R[401] },
      },
    },
    '/api/shifts/config': {
      put: {
        tags: ['Turnos'],
        summary: 'Configurar cupos máximos por turno y día (solo Admin) (RF-014)',
        security: secured,
        requestBody: body(
          { type: 'object', required: ['turno', 'cuposTotales'], properties: { turno: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] }, cuposTotales: { type: 'integer', minimum: 0, maximum: 5000 }, fecha: { type: 'string', description: 'Por defecto, hoy' }, aplicarSemana: { type: 'boolean', description: 'Aplica de lunes a viernes de la semana de `fecha`' } } },
          { turno: 'almuerzo', cuposTotales: 520, aplicarSemana: true }
        ),
        responses: { 200: { description: 'Configuración aplicada', ...json({ type: 'object', properties: { message: { type: 'string' }, data: { type: 'array', items: ref('Shift') } } }) }, 400: R[400], 401: R[401], 403: R[403], 409: R[409] },
      },
    },
    '/api/reservations': {
      post: {
        tags: ['Reservas'],
        summary: 'Reservar un cupo (estudiante) (RF-003, RF-004, RF-009)',
        description: 'Valida cupos > 0 y ausencia de duplicados, descuenta el cupo de forma atómica y envía la confirmación por correo.',
        security: secured,
        requestBody: body({ type: 'object', required: ['turno'], properties: { turno: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] }, fecha: { type: 'string', description: 'Por defecto, hoy' } } }, { turno: 'almuerzo' }),
        responses: { 201: { description: 'Reserva confirmada', ...json({ type: 'object', properties: { message: { type: 'string' }, data: ref('Reservation'), turno: ref('Shift') } }) }, 400: R[400], 401: R[401], 403: R[403], 409: R[409] },
      },
      get: {
        tags: ['Reservas'],
        summary: 'Listar reservas de un día (Cocina Central / Admin)',
        security: secured,
        parameters: [q('fecha', 'YYYY-MM-DD (por defecto, hoy)'), q('turno', 'Filtra por turno', { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'] }), q('estado', 'Filtra por estado', { type: 'string', enum: ['activa', 'cancelada', 'asistio', 'ausente'] })],
        responses: { 200: { description: 'Reservas del día', ...json({ type: 'object', properties: { fecha: { type: 'string' }, total: { type: 'integer' }, data: { type: 'array', items: ref('Reservation') } } }) }, 400: R[400], 401: R[401], 403: R[403] },
      },
    },
    '/api/reservations/my-history': {
      get: {
        tags: ['Reservas'],
        summary: 'Historial de reservas del estudiante (RF-011)',
        description: 'Con `estado=activa&orden=asc` devuelve las reservas vigentes.',
        security: secured,
        parameters: [q('estado', 'activa | cancelada | asistio | ausente', { type: 'string', enum: ['activa', 'cancelada', 'asistio', 'ausente'] }), q('desde', 'YYYY-MM-DD'), q('hasta', 'YYYY-MM-DD'), q('orden', 'asc | desc (por defecto desc)', { type: 'string', enum: ['asc', 'desc'] }), q('page', 'Página (1..n)', { type: 'integer', default: 1 }), q('limit', 'Tamaño de página (1..100)', { type: 'integer', default: 20 })],
        responses: { 200: { description: 'Historial paginado', ...json({ type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, pages: { type: 'integer' }, data: { type: 'array', items: ref('Reservation') } } }) }, 400: R[400], 401: R[401], 403: R[403] },
      },
    },
    '/api/reservations/{id}/cancel': {
      patch: {
        tags: ['Reservas'],
        summary: 'Cancelar una reserva activa antes del turno (RF-012)',
        description: 'Cambia el estado a `cancelada` y devuelve el cupo al contador. Notifica por correo.',
        security: secured,
        parameters: [idParam],
        responses: { 200: { description: 'Reserva cancelada', ...json({ type: 'object', properties: { message: { type: 'string' }, data: ref('Reservation') } }) }, 400: R[400], 401: R[401], 403: R[403], 404: R[404], 409: R[409] },
      },
    },
    '/api/reservations/{id}/attendance': {
      patch: {
        tags: ['Reservas'],
        summary: 'Registrar asistencia o ausencia (Cocina Central / Admin)',
        security: secured,
        parameters: [idParam],
        requestBody: body({ type: 'object', required: ['estado'], properties: { estado: { type: 'string', enum: ['asistio', 'ausente'] } } }, { estado: 'asistio' }),
        responses: { 200: { description: 'Asistencia registrada', ...json({ type: 'object', properties: { message: { type: 'string' }, data: ref('Reservation') } }) }, 400: R[400], 401: R[401], 403: R[403], 404: R[404], 409: R[409] },
      },
    },
    '/api/payments': {
      post: {
        tags: ['Pagos'],
        summary: 'Iniciar el cobro de una reserva (estudiante) (RF-007)',
        description: 'Registra el cobro (estado `pendiente`) y devuelve la referencia que se usa en la pasarela. Si el cobro anterior fue rechazado, genera un nuevo intento.',
        security: secured,
        requestBody: body({ type: 'object', required: ['reservaId', 'metodo'], properties: { reservaId: { type: 'string' }, metodo: { type: 'string', enum: ['qr', 'tarjeta', 'efectivo'] } } }, { reservaId: '66f1a2b3c4d5e6f708192a3b', metodo: 'qr' }),
        responses: { 201: { description: 'Cobro registrado', ...json({ type: 'object', properties: { message: { type: 'string' }, data: ref('Payment') } }) }, 400: R[400], 401: R[401], 403: R[403], 404: R[404], 409: R[409] },
      },
      get: {
        tags: ['Pagos'],
        summary: 'Listar pagos (Cocina Central / Admin)',
        security: secured,
        parameters: [q('estado', 'pendiente | en_verificacion | pagada | rechazada | cancelada'), q('metodo', 'qr | tarjeta | efectivo'), q('porValidar', 'true = cobros que requieren validación de caja')],
        responses: { 200: { description: 'Pagos', ...json({ type: 'object', properties: { total: { type: 'integer' }, data: { type: 'array', items: ref('Payment') } } }) }, 401: R[401], 403: R[403] },
      },
    },
    '/api/payments/my': {
      get: {
        tags: ['Pagos'],
        summary: 'Historial de pagos del estudiante',
        security: secured,
        parameters: [q('estado', 'Filtra por estado del pago')],
        responses: { 200: { description: 'Pagos del estudiante', ...json({ type: 'object', properties: { total: { type: 'integer' }, data: { type: 'array', items: ref('Payment') } } }) }, 401: R[401], 403: R[403] },
      },
    },
    '/api/payments/{referencia}/card': {
      post: {
        tags: ['Pagos'],
        summary: 'Pagar con tarjeta (estudiante)',
        description: 'Valida la tarjeta (Luhn, vencimiento, CVV) y la envía al procesador. El número y el CVV NO se almacenan; solo marca y últimos 4 dígitos. El resultado llega de forma asíncrona por el webhook firmado.',
        security: secured,
        parameters: [{ name: 'referencia', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: body({ type: 'object', required: ['numero', 'titular', 'exp', 'cvv'], properties: { numero: { type: 'string' }, titular: { type: 'string' }, exp: { type: 'string', example: '12/28' }, cvv: { type: 'string' } } }, { numero: '4242 4242 4242 4242', titular: 'CARLOS MENDOZA', exp: '12/28', cvv: '123' }),
        responses: { 202: { description: 'Cobro en proceso', ...json({ type: 'object' }) }, 401: R[401], 403: R[403], 404: R[404], 409: R[409], 422: errorRes('Datos de tarjeta no válidos') },
      },
    },
    '/api/payments/{referencia}/report-qr': {
      post: {
        tags: ['Pagos'],
        summary: 'Pago por QR: informar que ya pagó (estudiante)',
        description: 'El cobro pasa a `en_verificacion` hasta que Caja lo valide.',
        security: secured,
        parameters: [{ name: 'referencia', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 202: { description: 'Pago informado', ...json({ type: 'object' }) }, 401: R[401], 403: R[403], 404: R[404], 409: R[409] },
      },
    },
    '/api/payments/reference/{referencia}': {
      get: {
        tags: ['Pagos'],
        summary: 'Caja: buscar un cobro por referencia (Cocina Central / Admin)',
        security: secured,
        parameters: [{ name: 'referencia', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Cobro', ...json({ type: 'object', properties: { data: ref('Payment') } }) }, 401: R[401], 403: R[403], 404: R[404] },
      },
    },
    '/api/payments/{id}/confirm': {
      post: {
        tags: ['Pagos'],
        summary: 'Caja: confirmar cobro en efectivo o QR (Cocina Central / Admin)',
        security: secured,
        parameters: [idParam],
        responses: { 200: { description: 'Pago confirmado', ...json({ type: 'object', properties: { data: ref('Payment') } }) }, 400: R[400], 401: R[401], 403: R[403], 404: R[404], 409: R[409] },
      },
    },
    '/api/payments/{id}/reject': {
      post: {
        tags: ['Pagos'],
        summary: 'Caja: rechazar un cobro manual (Cocina Central / Admin)',
        security: secured,
        parameters: [idParam],
        requestBody: body({ type: 'object', properties: { motivo: { type: 'string' } } }, { motivo: 'No se recibió el abono' }),
        responses: { 200: { description: 'Pago rechazado', ...json({ type: 'object', properties: { data: ref('Payment') } }) }, 400: R[400], 401: R[401], 403: R[403], 404: R[404], 409: R[409] },
      },
    },
    '/api/payments/webhook': {
      post: {
        tags: ['Pagos'],
        summary: 'Webhook de la pasarela de pago (RF-008)',
        description: 'Sin JWT. Se autentica con los encabezados `X-Sirecom-Timestamp` y `X-Sirecom-Signature` (HMAC-SHA256 de `<timestamp>.<cuerpo crudo>`). Es idempotente por `eventId`.',
        requestBody: body({ type: 'object', required: ['eventId', 'referencia', 'status', 'monto'], properties: { eventId: { type: 'string' }, referencia: { type: 'string' }, status: { type: 'string', enum: ['succeeded', 'failed'] }, monto: { type: 'number' }, motivo: { type: 'string' } } }, { eventId: 'evt_123', referencia: 'SIR-M3K9X2-1A2B3C4D', status: 'succeeded', monto: 12 }),
        responses: { 200: { description: 'Evento recibido (applied | duplicate | ignored)', ...json({ type: 'object' }) }, 400: R[400], 401: R[401], 404: R[404], 422: errorRes('El monto no coincide con el cobro') },
      },
    },
    '/api/payments/{id}': {
      get: {
        tags: ['Pagos'],
        summary: 'Consultar un pago / comprobante',
        security: secured,
        parameters: [idParam],
        responses: { 200: { description: 'Pago', ...json({ type: 'object', properties: { data: ref('Payment') } }) }, 400: R[400], 401: R[401], 403: R[403], 404: R[404] },
      },
    },
    '/api/dashboard/metrics': {
      get: {
        tags: ['Dashboard'],
        summary: 'Métricas del dashboard de Cocina Central (RF-006)',
        description: 'Comensales proyectados, cupos reservados, tasa de asistencia, reservas semanales (lunes a viernes) y cronograma de menús.',
        security: secured,
        parameters: [q('fecha', 'YYYY-MM-DD (por defecto, hoy)'), q('turno', 'desayuno | almuerzo | cena | todos (por defecto, almuerzo)', { type: 'string', enum: ['desayuno', 'almuerzo', 'cena', 'todos'] })],
        responses: { 200: { description: 'Métricas calculadas', ...json({ type: 'object' }) }, 400: R[400], 401: R[401], 403: R[403] },
      },
    },
    '/api/reports/export': {
      get: {
        tags: ['Reportes'],
        summary: 'Exportar reporte de asistencia y reservas (RF-014)',
        security: secured,
        parameters: [q('desde', 'YYYY-MM-DD (por defecto, hasta - 6 días)'), q('hasta', 'YYYY-MM-DD (por defecto, hoy)'), q('formato', 'json | csv | xlsx | pdf (por defecto, json)', { type: 'string', enum: ['json', 'csv', 'xlsx', 'pdf'] })],
        responses: {
          200: {
            description: 'Reporte generado',
            content: {
              'application/json': { schema: { type: 'object' } },
              'text/csv': { schema: { type: 'string' } },
              'application/pdf': { schema: { type: 'string', format: 'binary' } },
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } },
            },
          },
          400: R[400], 401: R[401], 403: R[403],
        },
      },
    },
  },
};

module.exports = swaggerJsdoc({ definition, apis: [] });
