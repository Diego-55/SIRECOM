import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api/client.js';
import { Alert, Badge, EmptyState, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { ESTADOS_PAGO, METODOS_PAGO } from '../utils/format.js';

const bs = (n) => `Bs ${Number(n || 0).toFixed(2)}`;
// Acepta la referencia o el contenido completo del QR (SIRECOM|PAGO|<ref>|<monto>|<moneda>)
const extraerReferencia = (txt) => {
  const t = txt.trim();
  return t.includes('|') ? (t.split('|')[2] || '').toUpperCase() : t.toUpperCase();
};

function CobroCard({ p, onConfirmar, onRechazar, busy }) {
  const accionable = ['efectivo', 'qr'].includes(p.metodo) && ['pendiente', 'en_verificacion'].includes(p.estado);
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{p.usuario?.nombre || '—'}</p>
          <p className="text-xs text-muted">{p.usuario?.correo}</p>
        </div>
        <p className="text-lg font-extrabold">{bs(p.monto)}</p>
      </div>
      <p className="text-sm text-muted">
        {p.reserva ? `${p.reserva.nombreTurno} · ${p.reserva.fecha} · ${p.reserva.horario}` : '—'}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="bg-primary/10 text-primary">{METODOS_PAGO[p.metodo]}</Badge>
        <Badge className={ESTADOS_PAGO[p.estado].className}>{ESTADOS_PAGO[p.estado].label}</Badge>
        <span className="font-mono text-xs">{p.referencia}</span>
      </div>
      {p.comprobante && <p className="font-mono text-xs text-muted">Comprobante {p.comprobante}</p>}
      {accionable && (
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => onRechazar(p)}>Rechazar</button>
          <button type="button" className="btn-accent" disabled={busy} onClick={() => onConfirmar(p)}>
            {p.metodo === 'efectivo' ? 'Confirmar cobro en efectivo' : 'Confirmar abono QR'}
          </button>
        </div>
      )}
    </li>
  );
}

/** Caja: el personal valida los pagos en efectivo y por QR (RF-007 / RF-008) */
export default function Caja() {
  const toast = useToast();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [encontrado, setEncontrado] = useState(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/payments', { params: { porValidar: true } });
      setLista(data.data);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 10000);
    return () => clearInterval(id);
  }, [cargar]);

  const buscar = async (e) => {
    e.preventDefault();
    const ref = extraerReferencia(busqueda);
    if (!ref) return;
    try {
      const { data } = await api.get(`/payments/reference/${encodeURIComponent(ref)}`);
      setEncontrado(data.data);
    } catch (err) {
      setEncontrado(null);
      toast.error(getErrorMessage(err));
    }
  };

  const accion = async (p, tipo) => {
    let body;
    if (tipo === 'reject') {
      const motivo = window.prompt('Motivo del rechazo (opcional):', 'No se recibió el abono');
      if (motivo === null) return;
      body = { motivo };
    }
    setBusy(true);
    try {
      await api.post(`/payments/${p.id}/${tipo}`, body);
      toast.success(tipo === 'confirm' ? 'Pago confirmado. Se notificó al estudiante.' : 'Pago rechazado.');
      if (encontrado?.id === p.id) setEncontrado(null);
      setBusqueda('');
      await cargar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Caja</h1>
        <p className="text-sm text-muted">Valida los pagos en efectivo y por QR de los estudiantes.</p>
      </div>

      <section aria-labelledby="buscar-title" className="space-y-3">
        <h2 id="buscar-title" className="text-lg font-bold">Buscar cobro</h2>
        <form onSubmit={buscar} className="flex flex-wrap gap-2">
          <label htmlFor="ref" className="sr-only">Referencia del cobro</label>
          <input id="ref" className="input min-w-[260px] flex-1 font-mono" placeholder="Referencia (SIR-...) o contenido del QR" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <button type="submit" className="btn-accent">Buscar</button>
        </form>
        {encontrado && <ul><CobroCard p={encontrado} busy={busy} onConfirmar={(p) => accion(p, 'confirm')} onRechazar={(p) => accion(p, 'reject')} /></ul>}
      </section>

      <section aria-labelledby="val-title" className="space-y-3">
        <h2 id="val-title" className="text-lg font-bold">Por validar</h2>
        {error && <Alert onRetry={cargar}>{error}</Alert>}
        {!lista && !error && <Spinner />}
        {lista && lista.length === 0 && <EmptyState title="No hay cobros por validar">Los pagos en efectivo y por QR aparecerán aquí.</EmptyState>}
        {lista && lista.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {lista.map((p) => (
              <CobroCard key={p.id} p={p} busy={busy} onConfirmar={(x) => accion(x, 'confirm')} onRechazar={(x) => accion(x, 'reject')} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
