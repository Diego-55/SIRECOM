import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import ShiftCard from '../components/ShiftCard.jsx';
import DailyMenu from '../components/DailyMenu.jsx';
import MenuImage from '../components/MenuImage.jsx';
import { Alert, Badge, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatFecha, todayISO, TURNO_INFO } from '../utils/format.js';

const REFRESH_MS = 30000; // actualización periódica de cupos (tiempo casi real)

export default function StudentHome() {
  const { user } = useAuth();
  const toast = useToast();
  const [fecha] = useState(todayISO());
  const [shifts, setShifts] = useState(null);
  const [menus, setMenus] = useState(undefined); // menús de hoy (los 3 turnos)
  const [error, setError] = useState('');
  const [reservando, setReservando] = useState(null);

  const cargarCupos = useCallback(async () => {
    const { data } = await api.get('/shifts', { params: { fecha } });
    setShifts(data);
  }, [fecha]);

  const cargarTodo = useCallback(async () => {
    setError('');
    try {
      const [, menuRes] = await Promise.all([
        cargarCupos(),
        api.get('/menus', { params: { fecha } }),
      ]);
      setMenus(menuRes.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [cargarCupos, fecha]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  useEffect(() => {
    const id = setInterval(() => { cargarCupos().catch(() => {}); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [cargarCupos]);

  const reservar = async (turno) => {
    setReservando(turno.turno);
    try {
      await api.post('/reservations', { turno: turno.turno, fecha });
      toast.success(`Reserva confirmada: ${TURNO_INFO[turno.turno].nombre}. Te enviamos la confirmación por correo.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setReservando(null);
      cargarCupos().catch(() => {});
    }
  };

  const menu = menus?.find((m) => m.turno === 'almuerzo') || null; // destacado
  const primerNombre = user?.nombre?.split(' ')[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold md:text-3xl">¡Hola, {primerNombre}!</h1>
        <p className="text-sm text-muted">{formatFecha(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {error && <Alert onRetry={cargarTodo}>{error}</Alert>}

      {/* Tarjeta destacada: Almuerzo de Hoy */}
      {menus === undefined && !error ? (
        <Spinner label="Cargando el menú del día..." />
      ) : menu ? (
        <section className="card grid overflow-hidden md:grid-cols-2" aria-label="Almuerzo de hoy">
          <div className="order-2 flex flex-col justify-center gap-3 p-6 md:order-1 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-white">ALMUERZO DE HOY</Badge>
              <span className="text-xs font-semibold text-success-dark">Balanceado y saludable</span>
            </div>
            <h2 className="text-2xl font-extrabold leading-tight md:text-3xl">{menu.tituloPlato}</h2>
            <p className="text-sm text-muted">{menu.descripcion}</p>
            <div className="mt-1 flex flex-wrap gap-4 text-sm font-semibold">
              <span>{menu.horario || TURNO_INFO.almuerzo.horario}</span>
              <span>{menu.calorias} kcal</span>
            </div>
          </div>
          <div className="order-1 h-48 bg-gradient-to-br from-primary to-primary-light md:order-2 md:h-auto md:min-h-[260px]">
            <MenuImage menu={menu} className="h-full w-full object-cover" />
          </div>
        </section>
      ) : (
        !error && <Alert type="info">Aún no se publicó el menú del almuerzo de hoy.</Alert>
      )}

      {/* Menú completo del día: desplegable por turno */}
      {menus !== undefined && <DailyMenu menus={menus} />}

      {/* Turnos */}
      <section aria-labelledby="turnos-titulo">
        <h2 id="turnos-titulo" className="text-xl font-bold">Reservas Disponibles para Hoy</h2>
        <p className="mb-4 text-sm text-muted">Selecciona un turno para asegurar tu acceso al comedor universitario.</p>
        {!shifts && !error && <Spinner label="Consultando cupos..." />}
        {shifts && !shifts.abierto && <Alert type="info">{shifts.message}</Alert>}
        {shifts?.abierto && (
          <div className="grid gap-4 md:grid-cols-3">
            {shifts.turnos.map((t) => (
              <ShiftCard key={t.turno} turno={t} onReserve={reservar} reserving={reservando === t.turno} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
