const nodemailer = require('nodemailer');
const config = require('../config');
const { TURNO_INFO } = require('./constants');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

const layout = (title, bodyHtml) => `
<div style="font-family:Inter,Arial,sans-serif;background:#F5F7FA;padding:24px">
  <div style="max-width:520px;margin:auto;background:#FFFFFF;border-radius:12px;overflow:hidden">
    <div style="background:#1B365D;color:#FFFFFF;padding:16px 24px;font-weight:700">SIRECOM</div>
    <div style="padding:24px;color:#1B365D">
      <h2 style="margin:0 0 12px">${title}</h2>
      ${bodyHtml}
      <p style="color:#5C6B7A;font-size:12px;margin-top:24px">Sistema de Reservas de Comedores Universitarios - Universidad Adventista de Bolivia</p>
    </div>
  </div>
</div>`;

/** Envía un correo. Sin SMTP configurado, lo imprime en consola (modo desarrollo). */
const send = async ({ to, subject, text, html }) => {
  if (!transporter) {
    console.log(`\n[MAIL:DEV] Para: ${to}\n[MAIL:DEV] Asunto: ${subject}\n[MAIL:DEV] ${text}\n`);
    return { simulated: true };
  }
  return transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
};

/** Envío "best effort": un fallo de correo nunca debe romper una reserva */
const safeSend = (payload) =>
  send(payload).catch((err) => console.error('[MAIL:ERROR]', err.message));

const sendOtpEmail = (user, code) =>
  safeSend({
    to: user.correo,
    subject: 'Tu código de verificación SIRECOM',
    text: `Hola ${user.nombre}, tu código de verificación es ${code}. Vence en ${config.otp.ttlMinutes} minutos.`,
    html: layout(
      'Código de verificación',
      `<p>Hola <b>${user.nombre}</b>, usa este código para continuar:</p>
       <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#1B365D;margin:16px 0">${code}</p>
       <p>Vence en ${config.otp.ttlMinutes} minutos. Si no fuiste tú, ignora este mensaje.</p>`
    ),
  });

const MESSAGES = {
  confirmacion: { subject: 'Reserva confirmada', lead: 'Tu reserva fue confirmada.' },
  cancelacion: { subject: 'Reserva cancelada', lead: 'Tu reserva fue cancelada y el cupo fue liberado.' },
  recordatorio: { subject: 'Recordatorio de tu reserva', lead: 'Tu turno comienza pronto.' },
  pago_confirmado: { subject: 'Pago confirmado', lead: 'Recibimos la confirmación de tu pago.' },
  pago_rechazado: { subject: 'Pago rechazado', lead: 'La pasarela rechazó tu pago. Tu reserva sigue pendiente de pago.' },
};

/**
 * Construye el correo de un tipo de notificación a partir de un "snapshot" de datos
 * (así el worker no depende de que la reserva o el usuario sigan iguales al enviar).
 * datos: { nombre, turnoNombre, horario, fecha, monto?, comprobante?, motivo? }
 */
const renderNotification = (tipo, datos) => {
  const msg = MESSAGES[tipo];
  if (!msg) throw new Error(`Tipo de notificación desconocido: ${tipo}`);
  const detalle = `${datos.turnoNombre} - ${datos.fecha} - ${datos.horario}`;
  const extras = [];
  if (datos.monto !== undefined && datos.monto !== null && tipo.startsWith('pago')) extras.push(`Monto: Bs ${Number(datos.monto).toFixed(2)}`);
  if (datos.comprobante) extras.push(`Comprobante: ${datos.comprobante}`);
  if (datos.motivo) extras.push(`Motivo: ${datos.motivo}`);
  const extraTxt = extras.length ? ` ${extras.join('. ')}.` : '';
  return {
    subject: `SIRECOM: ${msg.subject}`,
    text: `Hola ${datos.nombre}. ${msg.lead} Detalle: ${detalle}.${extraTxt}`,
    html: layout(msg.subject, `<p>Hola <b>${datos.nombre}</b>. ${msg.lead}</p>
      <p style="background:#F5F7FA;padding:12px;border-radius:8px"><b>${datos.turnoNombre}</b><br/>${datos.fecha}<br/>${datos.horario}${
        extras.length ? `<br/>${extras.join('<br/>')}` : ''
      }</p>`),
  };
};

module.exports = { send, safeSend, sendOtpEmail, renderNotification };
