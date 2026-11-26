import { useState } from 'react';
import { TURNO_INFO } from '../utils/format.js';
import MenuImage from './MenuImage.jsx';

const ORDEN = ['desayuno', 'almuerzo', 'cena'];

function Chevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function MenuItem({ turno, menu, open, onToggle }) {
  const info = TURNO_INFO[turno];
  const panelId = `menu-panel-${turno}`;

  return (
    <li className="card overflow-hidden">
      <h3>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="min-w-0">
            <span className="block text-base font-bold">{info.nombre}</span>
            <span className="block truncate text-sm text-muted">
              {menu ? menu.tituloPlato : 'Menú aún no publicado'} · {menu?.horario || info.horario}
            </span>
          </span>
          <Chevron open={open} />
        </button>
      </h3>

      {open && (
        <div id={panelId} role="region" aria-label={`Menú de ${info.nombre}`} className="grid gap-4 border-t border-primary/10 p-5 md:grid-cols-[1fr_220px]">
          {menu ? (
            <>
              <div className="space-y-2">
                <p className="text-lg font-extrabold leading-tight">{menu.tituloPlato}</p>
                <p className="text-sm text-muted">{menu.descripcion}</p>
                <div className="flex flex-wrap gap-4 pt-1 text-sm font-semibold">
                  <span>{menu.horario || info.horario}</span>
                  <span>{menu.calorias} kcal</span>
                </div>
              </div>
              <MenuImage menu={menu} className="h-36 w-full rounded-lg object-cover md:h-full" />
            </>
          ) : (
            <p className="text-sm text-muted">Cocina Central aún no publicó el menú de este turno.</p>
          )}
        </div>
      )}
    </li>
  );
}

/** Menú del día: un desplegable por turno (desayuno, almuerzo y cena) */
export default function DailyMenu({ menus }) {
  const [abierto, setAbierto] = useState(null);
  const porTurno = Object.fromEntries((menus || []).map((m) => [m.turno, m]));

  return (
    <section aria-labelledby="menu-titulo" className="space-y-3">
      <div>
        <h2 id="menu-titulo" className="text-xl font-bold">Menú de Hoy</h2>
        <p className="text-sm text-muted">Toca un turno para ver el detalle del plato.</p>
      </div>
      <ul className="space-y-3">
        {ORDEN.map((turno) => (
          <MenuItem key={turno} turno={turno} menu={porTurno[turno]} open={abierto === turno} onToggle={() => setAbierto(abierto === turno ? null : turno)} />
        ))}
      </ul>
    </section>
  );
}
