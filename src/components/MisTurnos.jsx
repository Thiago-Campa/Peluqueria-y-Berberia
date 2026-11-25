import { useEffect, useState } from "react";
import { getMisTurnos, cancelarMiTurno } from "../js/api.js";
import { peso, fechaCorta, aMin, aHora, cuantoFalta, anticipoTexto } from "../js/format.js";
import { useConfirmar } from "./Confirmar.jsx";
import Tijera from "./Tijera.jsx";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const partes = (fecha) => { const [y, m, d] = fecha.split("-").map(Number); return { d, m, dia: new Date(y, m - 1, d).getDay() }; };
const fechaTexto = (fecha) => { const p = partes(fecha); return `${DIAS[p.dia]} ${fechaCorta(fecha).slice(0, 5)}`; };
const horaTexto = (iso) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Del más viejo al más nuevo: por el momento del turno y, si coinciden, el que se reservó antes
const ordenar = (l) => [...l].sort((a, b) => Date.parse(a.empieza) - Date.parse(b.empieza) || Date.parse(a.creado) - Date.parse(b.creado) || a.id - b.id);

// En qué situación está un turno ahora mismo
function situacion(t, ahora, anticipo) {
  if (t.estado === "cancelado") return { tipo: "cancelado" };
  const faltan = Date.parse(t.empieza) - ahora;
  if (faltan <= 0) return { tipo: "pasado" };
  const pagada = t.estado === "confirmado" && t.sena > 0 && t.pagado;
  const aTiempo = faltan >= anticipo * 60000;
  return { tipo: "vigente", faltan, pagada, aTiempo, retiene: pagada && !aTiempo };
}

function Chip({ t, s }) {
  if (s.tipo === "cancelado") return <span className="mt__chip">Cancelado</span>;
  if (s.tipo === "pasado") return <span className="mt__chip">Realizado</span>;
  if (t.estado === "pendiente") return <span className="mt__chip mt__chip--alerta">Esperando el pago</span>;
  return <span className="mt__chip mt__chip--ok">Confirmado</span>;
}

function Nota({ t, s, anticipo }) {
  const sena = peso(t.sena);
  if (s.tipo === "cancelado") {
    const cuando = t.cancelado ? `Lo cancelaste el ${fechaTexto(new Date(t.cancelado).toLocaleDateString("en-CA"))} a las ${horaTexto(t.cancelado)}. ` : "";
    if (t.reembolso === "devuelta") return <p className="mt__nota mt__nota--ok">{cuando}Te devolvimos la seña de {sena} a Mercado Pago.</p>;
    if (t.reembolso === "retenida") return <p className="mt__nota mt__nota--alerta">{cuando}Faltaba menos de {anticipoTexto(anticipo)}, así que la seña de {sena} no se devolvió.</p>;
    if (t.reembolso === "manual") return <p className="mt__nota">{cuando}El local te va a devolver la seña de {sena}.</p>;
    return cuando ? <p className="mt__nota">{cuando}El horario quedó libre.</p> : null;
  }
  if (s.tipo !== "vigente") return null;
  if (t.estado === "pendiente") return <p className="mt__nota mt__nota--alerta">Falta pagar la seña. Si el pago no se completa, el horario se libera solo.</p>;
  if (!s.pagada) return <p className="mt__nota">No pagaste seña, así que podés cancelar sin costo.</p>;
  if (s.retiene) return <p className="mt__nota mt__nota--alerta">Falta menos de {anticipoTexto(anticipo)}: podés cancelar, pero la seña de {sena} ya no se devuelve.</p>;
  const limite = aMin(t.hora) - anticipo;
  return (
    <p className="mt__nota mt__nota--ok">
      Si cancelás {limite >= 0 ? `hasta las ${aHora(limite)} del ${fechaTexto(t.fecha)}` : `con ${anticipoTexto(anticipo)} de anticipación`}, te devolvemos la seña de {sena}.
    </p>
  );
}

function Tarjeta({ t, s, primero, anticipo, cancelando, onCancelar }) {
  const p = partes(t.fecha);
  return (
    <li className={`mt mt--${s.tipo}${primero ? " mt--primero" : ""}`}>
      <div className="mt__talon" aria-label={`${fechaTexto(t.fecha)} a las ${t.hora}`}>
        <span className="mt__sem">{DIAS[p.dia]}</span>
        <strong className="mt__dia">{p.d}</strong>
        <span className="mt__mes">{MESES[p.m - 1]}</span>
        <span className="mt__hora">{t.hora}</span>
      </div>
      <div className="mt__cuerpo">
        {primero && <span className="mt__cinta">✂ Tu próximo turno</span>}
        <div className="mt__top">
          <h3>{t.servicio}</h3>
          <Chip t={t} s={s} />
        </div>
        <p className="mt__detalle">
          con <strong>{t.peluquero}</strong> · {t.duracion} min · {peso(t.precio)}
          {t.sena > 0 && t.estado !== "pendiente" && <> · seña {peso(t.sena)}</>}
        </p>
        {s.tipo === "vigente" && <p className={`mt__falta${s.faltan < anticipo * 60000 ? " mt__falta--ya" : ""}`}>{cuantoFalta(s.faltan)}</p>}
        <Nota t={t} s={s} anticipo={anticipo} />
        {s.tipo === "vigente" && (
          <div className="mt__acc">
            <button className="btn btn--sm btn--peligro" disabled={cancelando} onClick={() => onCancelar(t)}>
              {cancelando ? <><Tijera className="tijera--gira" /> Cancelando…</> : t.estado === "pendiente" ? "Liberar horario" : "Cancelar turno"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function MisTurnos({ n, sesion, version, onSalir }) {
  const [turnos, setTurnos] = useState(null);
  const [desfase, setDesfase] = useState(0); // diferencia entre el reloj del servidor y el de este dispositivo
  const [anticipo, setAnticipo] = useState(n.anticipo || 60);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [, setTic] = useState(0);
  const [pedir, ventana] = useConfirmar();

  const cargar = () =>
    getMisTurnos(sesion.token)
      .then((r) => { setDesfase(r.ahora - Date.now()); setAnticipo(r.anticipo); setTurnos(ordenar(r.turnos)); setError(""); })
      .catch((e) => { if (e.status === 401) return onSalir(); setError(e.message); setTurnos((l) => l || []); });

  useEffect(() => { cargar(); }, [sesion.token, version]);

  // Cada 30 segundos se recalcula cuánto falta (y si ya pasó la hora límite para que se devuelva la seña)
  useEffect(() => { const i = setInterval(() => setTic((x) => x + 1), 30000); return () => clearInterval(i); }, []);

  const ahora = Date.now() + desfase;
  const lista = (turnos || [])
    .filter((t) => t.estado !== "pendiente" || Date.parse(t.vence) > ahora)
    .map((t) => ({ t, s: situacion(t, ahora, anticipo) }));
  const proximos = lista.filter((x) => x.s.tipo === "vigente");
  const historial = lista.filter((x) => x.s.tipo !== "vigente");
  const conSena = (n.pagos && n.sena > 0) || lista.some((x) => x.t.sena > 0);

  const cancelar = async (t, insistir) => {
    const s = situacion(t, Date.now() + desfase, anticipo);
    const cuando = `${t.servicio} con ${t.peluquero}, el ${fechaTexto(t.fecha)} a las ${t.hora}.`;
    const retiene = s.retiene || insistir;
    const ok = await pedir(
      retiene
        ? { titulo: "¿Cancelar sin devolución?", texto: `${cuando} Falta menos de ${anticipoTexto(anticipo)}: si lo cancelás ahora, la seña de ${peso(t.sena)} no se devuelve.`, boton: "Cancelar igual", cancelar: "Mantener turno", peligro: true }
        : t.estado === "pendiente"
          ? { titulo: "¿Liberar este horario?", texto: `${cuando} Todavía no pagaste la seña, así que no se cobra nada.`, boton: "Sí, liberar", cancelar: "Volver", peligro: true }
          : { titulo: "¿Cancelar tu turno?", texto: `${cuando} ${s.pagada ? `Te devolvemos la seña de ${peso(t.sena)} a Mercado Pago.` : "El horario queda libre para otra persona."}`, boton: "Sí, cancelar", cancelar: "Mantener turno", peligro: true }
    );
    if (!ok) return;
    setCancelando(t.id); setAviso(null);
    try {
      const r = await cancelarMiTurno(t.id, { aceptoSinReembolso: retiene }, sesion.token);
      if (r.turno?.estado) setTurnos((l) => l.map((x) => (x.id === t.id ? r.turno : x)));
      else cargar();
      setAviso({ tipo: "ok", texto: r.mensaje });
    } catch (e) {
      if (e.status === 401) return onSalir();
      // Mientras decidía pasó la hora límite: se le vuelve a preguntar, ahora avisando que no se devuelve
      if (e.codigo === "sin-reembolso") { setCancelando(null); return await cancelar(t, true); }
      setAviso({ tipo: "error", texto: e.message });
      cargar();
    } finally {
      setCancelando(null);
    }
  };

  return (
    <section id="mis-turnos" className="section">
      <div className="wrap">
        <h2 className="title">Mis turnos</h2>
        <p className="lead">Tus reservas en orden de prioridad: el turno más cercano va primero.</p>

        {conSena && (
          <div className="mt-politica">
            <Tijera />
            <p>
              <strong>Cancelá con al menos {anticipoTexto(anticipo)} de anticipación y te devolvemos la seña.</strong>{" "}
              Si falta menos, podés cancelar igual, pero la seña no se devuelve.
            </p>
          </div>
        )}
        {aviso && <p className={`aviso aviso--${aviso.tipo} mt-aviso`} role="status">{aviso.texto}</p>}
        {error && <p className="aviso aviso--error mt-aviso">{error}</p>}

        {!turnos ? (
          <p className="mt-cargando"><Tijera className="tijera--gira" /> Buscando tus turnos…</p>
        ) : !proximos.length ? (
          <div className="mt-vacio">
            <p>No tenés turnos próximos.</p>
            <a className="btn btn--sm" href="#turnos">Pedir un turno</a>
          </div>
        ) : (
          <ol className="mt-lista">
            {proximos.map(({ t, s }, i) => (
              <Tarjeta key={t.id} t={t} s={s} primero={i === 0} anticipo={anticipo} cancelando={cancelando === t.id} onCancelar={cancelar} />
            ))}
          </ol>
        )}

        {historial.length > 0 && (
          <details className="mt-historial">
            <summary>Historial ({historial.length})</summary>
            <ol className="mt-lista">
              {historial.map(({ t, s }) => <Tarjeta key={t.id} t={t} s={s} anticipo={anticipo} />)}
            </ol>
          </details>
        )}
      </div>
      {ventana}
    </section>
  );
}
