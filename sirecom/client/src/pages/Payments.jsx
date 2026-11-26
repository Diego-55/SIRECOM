import { useCallback, useEffect, useRef, useState } from 'react';
import api, { getErrorMessage } from '../api/client.js';
import { Alert, Badge, EmptyState, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { ESTADOS_PAGO, METODOS_PAGO, formatFecha } from '../utils/format.js';

const bs = (n) => `Bs ${Number(n || 0).toFixed(2)}`;

const METODOS = [
  { key: 'qr', titulo: 'QR', desc: 'Escanea con la app de tu banco' },
  { key: 'tarjeta', titulo: 'Tarjeta', desc: 'Débito o crédito' },
  { key: 'efectivo', titulo: 'Efectivo', desc: 'Paga en caja del comedor' },
];

const luhn = (n) => {
  const d = n.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(d)) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let x = Number(d[i]);
    if (alt) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
    alt = !alt;
  }
  return sum % 10 === 0;
};
const fmtNumero = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const fmtExp = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function QrPanel({ pago, onClose, onInformar, busy }) {
  const esQr = pago.metodo === 'qr';
  return (
    <div className="space-y-4">
      <div className="mx-auto w-fit rounded-xl border border-primary/15 bg-white p-3">
        {pago.qr ? <img src={pago.qr} alt={`Código QR del cobro ${pago.referencia}`} width="240" height="240" /> : <Spinner />}
      </div>
      <div className="text-center">
        <p className="text-2xl font-extrabold">{bs(pago.monto)}</p>
        <p className="font-mono text-xs text-muted">Referencia: {pago.referencia}</p>
      </div>
      {esQr ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Abre la app de tu banco y elige <b>Pagar con QR</b>.</li>
          <li>Escanea este código y confirma el monto de {bs(pago.monto)}.</li>
          <li>Vuelve aquí y pulsa <b>Ya realicé el pago</b>. Caja lo verificará y recibirás tu comprobante.</li>
        </ol>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Dirígete a la <b>caja del comedor</b>.</li>
          <li>Muestra este código QR o dicta tu referencia.</li>
          <li>Paga {bs(pago.monto)} en efectivo. Caja confirmará tu pago y recibirás tu comprobante.</li>
        </ol>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{esQr ? 'Pagar después' : 'Entendido'}</button>
        {esQr && <button type="button" className="btn-accent" onClick={onInformar} disabled={busy}>{busy ? 'Enviando...' : 'Ya realicé el pago'}</button>}
      </div>
    </div>
  );
}

function CardForm({ monto, onSubmit, onCancel, busy }) {
  const [f, setF] = useState({ numero: '', titular: '', exp: '', cvv: '' });
  const [err, setErr] = useState('');
  const set = (k, fmt = (v) => v) => (e) => setF((s) => ({ ...s, [k]: fmt(e.target.value) }));

  const enviar = (e) => {
    e.preventDefault();
    if (!luhn(f.numero)) return setErr('El número de tarjeta no es válido');
    if (f.titular.trim().length < 3) return setErr('Ingresa el nombre del titular');
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(f.exp)) return setErr('El vencimiento debe tener el formato MM/AA');
    if (!/^\d{3,4}$/.test(f.cvv)) return setErr('El CVV debe tener 3 o 4 dígitos');
    setErr('');
    return onSubmit(f);
  };

  return (
    <form onSubmit={enviar} className="space-y-3" autoComplete="off" noValidate>
      <div>
        <label htmlFor="cc-numero" className="label">Número de tarjeta</label>
        <input id="cc-numero" className="input font-mono" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={f.numero} onChange={set('numero', fmtNumero)} />
      </div>
      <div>
        <label htmlFor="cc-titular" className="label">Titular</label>
        <input id="cc-titular" className="input uppercase" autoComplete="cc-name" placeholder="NOMBRE COMO EN LA TARJETA" value={f.titular} onChange={set('titular')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cc-exp" className="label">Vencimiento</label>
          <input id="cc-exp" className="input font-mono" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={f.exp} onChange={set('exp', fmtExp)} />
        </div>
        <div>
          <label htmlFor="cc-cvv" className="label">CVV</label>
          <input id="cc-cvv" className="input font-mono" inputMode="numeric" type="password" autoComplete="cc-csc" placeholder="•••" maxLength={4} value={f.cvv} onChange={set('cvv', (v) => v.replace(/\D/g, '').slice(0, 4))} />
        </div>
      </div>
      {err && <p className="text-sm font-semibold text-error" role="alert">{err}</p>}
      <p className="field-hint">Tus datos se envían cifrados y no se almacenan: solo guardamos la marca y los últimos 4 dígitos para tu comprobante.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Volver</button>
        <button type="submit" className="btn-accent" disabled={busy}>{busy ? 'Procesando...' : `Pagar ${bs(monto)}`}</button>
      </div>
    </form>
  );
}

/** RF-007 / RF-008 · UC-02: pago de reservas por QR, tarjeta o efectivo + historial */
export default function Payments() {
  const toast = useToast();
  const [reservas, setReservas] = useState(null);
  const [pagos, setPagos] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { reserva, pago, paso: 'metodo' | 'detalle' }
  const [busy, setBusy] = useState(false);
  const previos = useRef({});

  const cargar = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        api.get('/reservations/my-history', { params: { estado: 'activa', orden: 'asc', limit: 50 } }),
        api.get('/payments/my'),
      ]);
      setReservas(r.data.data);
      setPagos(p.data.data);
      setError('');
      p.data.data.forEach((x) => {
        const antes = previos.current[x.id];
        if (antes && antes !== x.estado) {
          if (x.estado === 'pagada') toast.success(`Pago confirmado. Comprobante ${x.comprobante}`);
          if (x.estado === 'rechazada') toast.error(`Pago rechazado: ${x.motivoRechazo}`);
        }
        previos.current[x.id] = x.estado;
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const pagoDe = (reservaId) => pagos?.find((p) => p.reservaId === reservaId);
  // Tarjeta procesando, o QR informado esperando a caja
  const enProceso = (p) => p && ((p.metodo === 'tarjeta' && p.estado === 'pendiente' && p.cobroSolicitado) || p.estado === 'en_verificacion');
  // Se consulta cada 4 s mientras algo espere un resultado (pasarela o caja)
  const esperando = (p) => enProceso(p) || (p?.metodo === 'efectivo' && p.estado === 'pendiente');
  const hayEsperando = pagos?.some(esperando);
  useEffect(() => {
    if (!hayEsperando) return undefined;
    const id = setInterval(cargar, 4000);
    return () => clearInterval(id);
  }, [hayEsperando, cargar]);

  const abrir = (reserva) => {
    const p = pagoDe(reserva.id);
    if (p && p.estado === 'pendiente' && !p.cobroSolicitado) setModal({ reserva, pago: p, paso: 'detalle' });
    else setModal({ reserva, pago: null, paso: 'metodo' });
  };

  const elegirMetodo = async (metodo) => {
    setBusy(true);
    try {
      const { data } = await api.post('/payments', { reservaId: modal.reserva.id, metodo });
      setModal((m) => ({ ...m, pago: data.data, paso: 'detalle' }));
      await cargar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const informarQr = async () => {
    setBusy(true);
    try {
      await api.post(`/payments/${modal.pago.referencia}/report-qr`);
      toast.info('Pago informado. Caja lo verificará en breve.');
      setModal(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      cargar();
    }
  };

  const pagarTarjeta = async (f) => {
    setBusy(true);
    try {
      await api.post(`/payments/${modal.pago.referencia}/card`, {
        numero: f.numero.replace(/\s/g, ''), titular: f.titular.trim(), exp: f.exp, cvv: f.cvv,
      });
      toast.info('Procesando el pago con tu tarjeta...');
      setModal(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      cargar();
    }
  };

  const pendientes = reservas?.filter((r) => r.estadoPago !== 'pagada') || [];
  const reserva = modal?.reserva;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Pagos</h1>
        <p className="text-sm text-muted">Paga tus reservas con QR, tarjeta o efectivo y consulta tus comprobantes.</p>
      </div>

      {error && <Alert onRetry={cargar}>{error}</Alert>}
      {(!reservas || !pagos) && !error && <Spinner />}

      {reservas && pagos && (
        <>
          <section className="space-y-3" aria-labelledby="pend-title">
            <h2 id="pend-title" className="text-lg font-bold">Reservas pendientes de pago</h2>
            {pendientes.length === 0 ? (
              <EmptyState title="No tienes reservas pendientes de pago">Cuando reserves un cupo aparecerá aquí.</EmptyState>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {pendientes.map((r) => {
                  const p = pagoDe(r.id);
                  const bloqueado = enProceso(p);
                  const abierto = p && p.estado === 'pendiente' && !p.cobroSolicitado;
                  return (
                    <li key={r.id} className="card flex flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{r.nombreTurno}</h3>
                          <p className="text-sm text-muted">{formatFecha(r.fecha)} · {r.horario}</p>
                        </div>
                        <p className="text-lg font-extrabold">{bs(r.monto)}</p>
                      </div>
                      {p?.estado === 'rechazada' && <Alert>Último intento rechazado: {p.motivoRechazo}. Puedes volver a intentarlo.</Alert>}
                      {p?.metodo === 'tarjeta' && bloqueado && p.estado !== 'en_verificacion' && <Alert type="info">Procesando el cobro con tu tarjeta...</Alert>}
                      {p?.metodo === 'tarjeta' && p.estado === 'en_verificacion' && <Alert type="info">Pago en verificación: el procesador aún no confirmó. Lo conciliaremos automáticamente.</Alert>}
                      {p?.metodo === 'qr' && p.estado === 'en_verificacion' && <Alert type="info">Pago por QR informado. Esperando la validación de caja.</Alert>}
                      {p?.metodo === 'efectivo' && p.estado === 'pendiente' && <Alert type="info">Pendiente de pago en efectivo en la caja del comedor. Referencia: {p.referencia}</Alert>}
                      <button type="button" className="btn-accent" disabled={bloqueado} onClick={() => abrir(r)}>
                        {bloqueado ? 'Esperando confirmación' : abierto ? 'Continuar pago' : `Pagar ${bs(r.monto)}`}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="hist-title">
            <h2 id="hist-title" className="text-lg font-bold">Historial de pagos</h2>
            {pagos.length === 0 ? (
              <EmptyState title="Aún no registras pagos" />
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-primary/10 text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Reserva</th>
                      <th className="px-4 py-3 font-semibold">Método</th>
                      <th className="px-4 py-3 font-semibold">Referencia</th>
                      <th className="px-4 py-3 text-right font-semibold">Monto</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => (
                      <tr key={p.id} className="border-b border-primary/5 last:border-0">
                        <td className="px-4 py-3">{p.reserva ? `${p.reserva.nombreTurno} · ${p.reserva.fecha}` : '—'}</td>
                        <td className="px-4 py-3">{METODOS_PAGO[p.metodo]}{p.tarjeta ? ` ····${p.tarjeta.ultimos4}` : ''}</td>
                        <td className="px-4 py-3 font-mono text-xs">{p.referencia}</td>
                        <td className="px-4 py-3 text-right font-semibold">{bs(p.monto)}</td>
                        <td className="px-4 py-3"><Badge className={ESTADOS_PAGO[p.estado].className}>{ESTADOS_PAGO[p.estado].label}</Badge></td>
                        <td className="px-4 py-3 font-mono text-xs">{p.comprobante || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-primary/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pay-title">
          <div className="card w-full max-w-md space-y-4 p-6">
            <div>
              <h2 id="pay-title" className="text-lg font-bold">
                {modal.paso === 'metodo' ? 'Elige cómo pagar' : `Pago con ${METODOS_PAGO[modal.pago.metodo]}`}
              </h2>
              <p className="text-sm text-muted">{reserva.nombreTurno} · {formatFecha(reserva.fecha)} · {bs(reserva.monto)}</p>
            </div>

            {modal.paso === 'metodo' && (
              <>
                <div className="grid gap-2">
                  {METODOS.map((m) => (
                    <button key={m.key} type="button" disabled={busy} onClick={() => elegirMetodo(m.key)} className="flex items-center justify-between rounded-lg border border-primary/20 px-4 py-3 text-left hover:border-primary hover:bg-primary/5 disabled:opacity-60">
                      <span><span className="block font-bold">{m.titulo}</span><span className="block text-sm text-muted">{m.desc}</span></span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button></div>
              </>
            )}

            {modal.paso === 'detalle' && modal.pago.metodo !== 'tarjeta' && (
              <QrPanel pago={modal.pago} busy={busy} onClose={() => { setModal(null); cargar(); }} onInformar={informarQr} />
            )}
            {modal.paso === 'detalle' && modal.pago.metodo === 'tarjeta' && (
              <CardForm monto={modal.pago.monto} busy={busy} onSubmit={pagarTarjeta} onCancel={() => setModal(null)} />
            )}

            {modal.paso === 'detalle' && (
              <button type="button" className="w-full text-center text-sm font-semibold text-primary underline" onClick={() => setModal((m) => ({ ...m, pago: null, paso: 'metodo' }))} disabled={busy}>
                Cambiar método de pago
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
