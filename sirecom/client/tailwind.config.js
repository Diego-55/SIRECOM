/** @type {import('tailwindcss').Config} */
// Tokens exactos del Sistema de Diseño (Figma, Primera Entrega) = paleta del informe, sección 2.3.1
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta del informe (sección 2.3.1)
        primary: { DEFAULT: '#1B365D', light: '#2A4A7D' }, // Azul SIRECOM: cabeceras, navegación, botones primarios
        accent: { DEFAULT: '#E5A823', dark: '#C98F12' },    // Dorado SIRECOM: llamadas a la acción, acentos
        background: '#F5F7FA',                               // Neutro 50: fondo base
        surface: '#FFFFFF',                                  // Cards
        neutral: { 900: '#1B1B1B', 600: '#5C6B7A', 200: '#D9DFE6', 50: '#F5F7FA' },
        success: { DEFAULT: '#2E7D46', dark: '#256638' },    // Reserva confirmada, pago exitoso
        error: '#C0392B',                                    // Cupo agotado, pago rechazado
        warning: { DEFAULT: '#D98E04', dark: '#8A5A00' },    // Pocos cupos, pago pendiente
        info: '#2E6BA8',                                     // Mensajes informativos
        muted: '#5C6B7A',                                    // Neutro 600: texto secundario
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,54,93,0.06), 0 4px 12px rgba(27,54,93,0.05)',
      },
      spacing: { 4.5: '1.125rem' },
    },
  },
  plugins: [],
};
