const QRCode = require('qrcode');

/**
 * Contenido del QR de pago. Formato de texto plano fácil de leer con cualquier lector:
 *   SIRECOM|PAGO|<referencia>|<monto>|<moneda>
 * El personal de caja puede escanearlo (o digitar la referencia) para validar el cobro.
 */
const payloadPago = (payment) => `SIRECOM|PAGO|${payment.referencia}|${Number(payment.monto).toFixed(2)}|${payment.moneda || 'BOB'}`;

/** Devuelve el QR como imagen PNG en data URL (escaneable) */
const qrDataUrl = (texto) =>
  QRCode.toDataURL(texto, { errorCorrectionLevel: 'M', margin: 2, width: 320, color: { dark: '#1B365D', light: '#FFFFFF' } });

module.exports = { payloadPago, qrDataUrl };
