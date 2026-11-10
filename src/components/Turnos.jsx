import { useEffect, useState } from "react";
import { crearTurno, getOcupados } from "../js/api.js";
import { peso, fechaCorta, aMin, generarSlots, nombreCompleto } from "../js/format.js";

const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local
const vacio = { nombre: "", telefono: "", fecha: "", hora: "", peluqueroId: "" };

function Ticket({ n, servicio, duracion, peluquero, fecha, hora, precio, sello }) {
  return (
    <aside className="ticket" aria-live="polite">
      <p className="ticket__marca">{n.nombre}</p>
      <dl>
        <dt>Servicio</dt><dd>{servicio || "Sin elegir"}</dd>
        <dt>Duración</dt><dd>{duracion ? `${duracion} min` : "—"}</dd>
        <dt>Peluquero</dt><dd>{peluquero || "Sin elegir"}</dd>
        <dt>Día</dt><dd>{fecha ? fechaCorta(fecha) : "Sin elegir"}</dd>
        <dt>Hora</dt><dd>{hora || "Sin elegir"}</dd>
      </dl>
      <div className="ticket__corte" />
      <p className="ticket__total"><span>Total</span><strong>{precio ? peso(precio) : "—"}</strong></p>
      {sello && <span className="sello">RESERVADO</span>}
    </aside>
  );
}

export default function Turnos({ n, servicios, elegido, setElegido }) {
  const [form, setForm] = useState(vacio);
  const [ocupados, setOcupados] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [turno, setTurno] = useState(null);

  const servicio = servicios.find((s) => s.id === elegido);
  const pelu = n.peluqueros.find((p) => p.id === form.peluqueroId);
  const otro = n.peluqueros.find((p) => p.id !== form.peluqueroId);
  const dur = servicio?.duracion || 30;
  const paso = n.intervalo || 30;

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const cargar = (fecha) => getOcupados(fecha).then(setOcupados).catch(() => setOcupados([]));

  // Mientras hay una fecha elegida, se actualizan los horarios ocupados cada 20 segundos
  useEffect(() => {
    if (!form.fecha) return;
    cargar(form.fecha);
    const t = setInterval(() => cargar(form.fecha), 20000);
    return () => clearInterval(t);
  }, [form.fecha]);

  // Si cambia el corte, la duración cambia y el horario elegido puede dejar de servir
  useEffect(() => { setForm((f) => ({ ...f, hora: "" })); }, [elegido]);

  const elegirFecha = (e) => {
    const [y, m, d] = e.target.value.split("-").map(Number);
    if (n.diasCerrados.includes(new Date(y, m - 1, d).getDay())) {
      setAviso({ tipo: "error", texto: "Ese día la peluquería está cerrada. Elegí otra fecha." });
      return setForm({ ...form, fecha: "", hora: "" });
    }
    setAviso(null);
    setForm({ ...form, fecha: e.target.value, hora: "" });
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!servicio || !pelu || !form.hora)
      return setAviso({ tipo: "error", texto: "Elegí servicio, peluquero, fecha y horario." });
    try {
      setTurno(await crearTurno({ ...form, servicioId: servicio.id }));
      setForm(vacio); setElegido(""); setAviso(null);
    } catch (err) {
      // Si alguien reservó antes, el turno no se confirma y se actualiza la grilla
      setAviso({ tipo: "error", texto: err.message });
      setForm((f) => ({ ...f, hora: "" }));
      cargar(form.fecha);
    }
  };

  if (turno) {
    const msg = `Hola, soy ${turno.nombre}. Reservé turno para ${turno.servicio} con ${turno.peluquero} el ${fechaCorta(turno.fecha)} a las ${turno.hora}.`;
    return (
      <section id="turnos" className="section section--alt">
        <div className="wrap reserva">
          <div>
            <h2 className="title">Turno reservado</h2>
            <p className="aviso aviso--ok">Te esperamos, {turno.nombre}. Guardá este ticket o avisanos por WhatsApp.</p>
            <div className="acciones">
              <a className="btn" href={`https://wa.me/${n.whatsapp}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Avisar por WhatsApp</a>
              <button className="btn btn--ghost" onClick={() => setTurno(null)}>Reservar otro turno</button>
            </div>
          </div>
          <Ticket n={n} servicio={turno.servicio} duracion={turno.duracion} peluquero={turno.peluquero} fecha={turno.fecha} hora={turno.hora} precio={turno.precio} sello />
        </div>
      </section>
    );
  }

  const ahora = new Date().toTimeString().slice(0, 5);
  const estado = (s) => {
    if (form.fecha === hoy() && s.hora <= ahora) return "pasado";
    if (s.min + dur > s.fin) return "noentra";
    const ocupado = ocupados.some((o) => o.peluqueroId === form.peluqueroId && s.min < aMin(o.hora) + o.duracion && aMin(o.hora) < s.min + dur);
    return ocupado ? "ocupado" : "libre";
  };

  return (
    <section id="turnos" className="section section--alt">
      <div className="wrap">
        <h2 className="title">Pedí tu turno</h2>
        <p className="lead">Elegí el corte, el peluquero y el día. Los turnos son de {paso} minutos.</p>
        <div className="reserva">
          <form className="form" onSubmit={enviar}>
            <label>Nombre
              <input name="nombre" value={form.nombre} onChange={cambiar} autoComplete="name" required />
            </label>
            <label>Teléfono
              <input name="telefono" type="tel" value={form.telefono} onChange={cambiar} autoComplete="tel" required />
            </label>
            <label>Servicio
              <select value={elegido} onChange={(e) => setElegido(e.target.value)} required>
                <option value="">Elegí un servicio</option>
                {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {peso(s.precio)} · {s.duracion} min</option>)}
              </select>
            </label>
            <label>Fecha
              <input type="date" min={hoy()} value={form.fecha} onChange={elegirFecha} required />
            </label>

            <div className="full" role="radiogroup" aria-label="Peluquero">
              <p className="label">Peluquero</p>
              <div className="pelus">
                {n.peluqueros.map((p) => (
                  <button type="button" key={p.id} role="radio" aria-checked={form.peluqueroId === p.id} className="pelu"
                    onClick={() => setForm({ ...form, peluqueroId: p.id, hora: "" })}>
                    <span aria-hidden="true">✂</span> {nombreCompleto(p)}
                  </button>
                ))}
              </div>
            </div>

            <div className="full">
              <p className="label">Horario</p>
              {servicio && pelu && form.fecha ? (
                <>
                  {n.bloques.map((b) => (
                    <div className="franja" key={b.desde}>
                      <p className="franja__t">{b.desde} a {b.hasta}</p>
                      <div className="horas">
                        {generarSlots(b, paso).map((s) => {
                          const e = estado(s);
                          return (
                            <button type="button" key={s.hora} aria-pressed={form.hora === s.hora} disabled={e !== "libre"}
                              className={`hora${e === "ocupado" ? " hora--ocupada" : ""}${e === "noentra" ? " hora--noentra" : ""}`}
                              title={e === "ocupado" ? `Ocupado con ${nombreCompleto(pelu)}` : e === "noentra" ? "El corte no entra antes del cierre" : undefined}
                              onClick={() => setForm({ ...form, hora: s.hora })}>{s.hora}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="nota">
                    {dur > paso && `Este corte dura ${dur} min y ocupa ${Math.ceil(dur / paso)} turnos seguidos. `}
                    Los horarios tachados están ocupados con {nombreCompleto(pelu)}
                    {otro ? `. Probá con ${nombreCompleto(otro)} para ver más.` : "."}
                  </p>
                </>
              ) : <p className="nota">Elegí servicio, peluquero y fecha para ver los horarios libres.</p>}
            </div>

            {aviso && <p className={`aviso aviso--${aviso.tipo} full`}>{aviso.texto}</p>}
            <button className="btn full">Confirmar turno</button>
          </form>
          <Ticket n={n} servicio={servicio?.nombre} duracion={servicio?.duracion} peluquero={pelu && nombreCompleto(pelu)} fecha={form.fecha} hora={form.hora} precio={servicio?.precio} />
        </div>
      </div>
    </section>
  );
}
