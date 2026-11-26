import { useState } from 'react';
import { imagenPorDefecto } from '../utils/format.js';

/** Imagen del plato: usa la del menú y, si falta o no carga, una ilustración por defecto del turno */
export default function MenuImage({ menu, className = '' }) {
  const fallback = imagenPorDefecto(menu.turno, menu.fecha);
  const [src, setSrc] = useState(menu.imagenUrl || fallback);
  return (
    <img
      src={src}
      alt={`Plato: ${menu.tituloPlato}`}
      className={className}
      loading="lazy"
      onError={() => { if (src !== fallback) setSrc(fallback); }}
    />
  );
}
