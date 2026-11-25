import { useEffect, useState } from "react";
import { adm, getServicios, getConfig } from "../js/api.js";
import { peso, fechaCorta } from "../js/format.js";

// Ventana para confirmar antes de borrar, modificar o agregar algo
function Confirmar({ titulo, texto, boton = "Confirmar", peligro, onResp }) {
  useEffect(() => {
    const tecla = (e) => e.key === "Escape" && onResp(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  return (
    <div className="modal" role="presentation" onClick={() => onResp(false)}>
      <div className="modal__caja" role="alertdialog" aria-modal="true" aria-labelledby="conf-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="conf-t">{titulo}</h2>
        {texto && <p>{texto}</p>}
        <div className="modal__acc">
          <button className="btn btn--sm btn--ghost" autoFocus onClick={() => onResp(false)}>Cancelar</button>
          <button className={`btn btn--sm${peligro ? " btn--rojo" : ""}`} onClick={() => onResp(true)}>{boton}</button>
        </div>
      </div>
    </div>
  );
}

function Cortes({ onCambio, ok, fallo, pedir }) {
  const [lista, setLista] = useState([]);
  useEffect(() => { getServicios().then(setLista); }, []);

  const campo = (id, k, v) => setLista((l) => l.map((s) => (s.id === id ? { ...s, [k]: v } : s)));
  const guardar = async (s) => {
    if (!(await pedir({ titulo: "¿Guardar los cambios?", texto: `Vas a actualizar “${s.nombre}”: ${peso(s.precio)} · ${s.duracion} min.`, boton: "Guardar" }))) return;
    try { await adm(`servicios/${s.id}`, "PUT", s); ok("Corte guardado"); onCambio(); } catch (e) { fallo(e); }
  };
  const quitar = async (s) => {
    if (!(await pedir({ titulo: `¿Quitar “${s.nombre}”?`, texto: "El corte desaparece de la página y no se puede deshacer. Los turnos ya reservados no se borran.", boton: "Sí, quitar", peligro: true }))) return;
    try { await adm(`servicios/${s.id}`, "DELETE"); setLista((l) => l.filter((x) => x.id !== s.id)); ok("Corte quitado"); onCambio(); } catch (e) { fallo(e); }
  };
  const agregar = async () => {
    if (!(await pedir({ titulo: "¿Agregar un corte nuevo?", texto: "Se crea un corte en blanco (“Nuevo corte”, $0, 30 min) para que lo completes y lo guardes.", boton: "Agregar" }))) return;
    try { const nuevo = await adm("servicios", "POST", { nombre: "Nuevo corte", precio: 0, duracion: 30 }); setLista((l) => [...l, nuevo]); onCambio(); } catch (e) { fallo(e); }
  };
  return (
    <>
      <button className="btn" onClick={agregar}>Agregar corte</button>
      <ul className="a-lista">
        {lista.map((s) => (
          <li className="a-fila" key={s.id}>
            <div className="a-campos">
              <input value={s.nombre} onChange={(e) => campo(s.id, "nombre", e.target.value)} aria-label="Nombre del corte" placeholder="Nombre" />
              <input value={s.desc} onChange={(e) => campo(s.id, "desc", e.target.value)} aria-label="Descripción" placeholder="Descripción corta" />
              <input type="number" min="0" step="500" value={s.precio} onChange={(e) => campo(s.id, "precio", e.target.value)} aria-label="Precio en pesos" />
              <select value={s.duracion} onChange={(e) => campo(s.id, "duracion", Number(e.target.value))} aria-label="Duración">
                {[30, 60, 90, 120, 150, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div className="a-acc">
              <button className="btn btn--sm" onClick={() => guardar(s)}>Guardar</button>
              <button className="btn btn--sm btn--peligro" onClick={() => quitar(s)}>Quitar</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dos = (n) => String(n).padStart(2, "0");
const nombreMes = (ym) => { const [y, m] = ym.split("-"); return `${MESES[m - 1]} ${y}`; };
const moverMes = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}`; };
const suma = (l) => l.reduce((a, t) => a + t.precio, 0);

function Barberos({ fallo }) {
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())} ${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;
  const [turnos, setTurnos] = useState(null);
  const [pelus, setPelus] = useState([]);
  const [mes, setMes] = useState(hoy.slice(0, 7));

  useEffect(() => {
    Promise.all([adm("turnos"), getConfig()]).then(([t, c]) => { setTurnos(t.filter((x) => x.estado === "confirmado")); setPelus(c.peluqueros); }).catch(fallo);
  }, []);
  if (!turnos) return null;

  const hecho = (t) => `${t.fecha} ${t.hora}` <= hoy;
  const delMes = turnos.filter((t) => t.fecha.startsWith(mes)).sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`));

  // Cortes más pedidos del mes
  const porCorte = {};
  for (const t of delMes) (porCorte[t.servicio] ??= { nombre: t.servicio, n: 0, total: 0 }, porCorte[t.servicio].n++, porCorte[t.servicio].total += t.precio);
  const ranking = Object.values(porCorte).sort((a, b) => b.n - a.n || b.total - a.total);
  const maxN = ranking[0]?.n || 1;

  // Balance de todos los meses
  const porMes = {};
  for (const t of turnos) (porMes[t.fecha.slice(0, 7)] ??= []).push(t);
  const meses = Object.keys(porMes).sort().reverse();

  return (
    <>
      <div className="b-mes">
        <button className="btn btn--sm btn--ghost" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">‹</button>
        <strong>{nombreMes(mes)}</strong>
        <button className="btn btn--sm btn--ghost" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente">›</button>
      </div>

      <div className="b-resumen">
        <div><span>Balance del mes</span><strong>{peso(suma(delMes.filter(hecho)))}</strong><em>cortes ya realizados</em></div>
        <div><span>Por cobrar</span><strong>{peso(suma(delMes.filter((t) => !hecho(t))))}</strong><em>turnos que todavía no pasaron</em></div>
        <div><span>Cortes del mes</span><strong>{delMes.length}</strong><em>{delMes.filter(hecho).length} realizados</em></div>
      </div>

      <h2 className="b-titulo">Cortes más pedidos</h2>
      {ranking.length ? (
        <ol className="b-rank">
          {ranking.map((r) => (
            <li key={r.nombre}>
              <span className="b-rank__nombre">{r.nombre}</span>
              <span className="b-rank__barra"><i style={{ width: `${(r.n / maxN) * 100}%` }} /></span>
              <span className="b-rank__n">{r.n} {r.n === 1 ? "vez" : "veces"} · {peso(r.total)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="nota">No hay cortes en {nombreMes(mes)}.</p>}

      <h2 className="b-titulo">Barberos</h2>
      <div className="b-grid">
        {pelus.map((p) => {
          const lista = delMes.filter((t) => t.peluqueroId === p.id);
          return (
            <section className="b-card" key={p.id}>
              <header>
                <h3>{`${p.nombre} ${p.apellido}`.trim()}</h3>
                <p><strong>{lista.length}</strong> {lista.length === 1 ? "corte" : "cortes"} · <strong>{peso(suma(lista.filter(hecho)))}</strong></p>
              </header>
              {lista.length ? (
                <ul className="b-hist">
                  {lista.map((t) => (
                    <li key={t.id} className={hecho(t) ? "" : "b-hist--pend"}>
                      <span>{fechaCorta(t.fecha).slice(0, 5)} · {t.hora}</span>
                      <span>{t.servicio}<small>{t.nombre}{hecho(t) ? "" : " · pendiente"}</small></span>
                      <strong>{peso(t.precio)}</strong>
                    </li>
                  ))}
                </ul>
              ) : <p className="nota">Sin cortes este mes.</p>}
            </section>
          );
        })}
      </div>

      <h2 className="b-titulo">Balance mes a mes</h2>
      {meses.length ? (
        <table className="b-tabla">
          <thead><tr><th>Mes</th><th>Cortes</th>{pelus.map((p) => <th key={p.id}>{p.nombre}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m} className={m === mes ? "b-tabla--sel" : ""} onClick={() => setMes(m)}>
                <td>{nombreMes(m)}</td>
                <td>{porMes[m].length}</td>
                {pelus.map((p) => <td key={p.id}>{peso(suma(porMes[m].filter((t) => t.peluqueroId === p.id && hecho(t))))}</td>)}
                <td><strong>{peso(suma(porMes[m].filter(hecho)))}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="nota">Todavía no hay turnos reservados.</p>}
      <p className="nota">El balance suma solo los turnos que ya pasaron. Si cancelás un turno desde la pestaña “Turnos”, se borra también de este historial.</p>
    </>
  );
}

function Datos({ onCambio, ok, fallo, pedir }) {
  const [c, setC] = useState(null);
  useEffect(() => {
    getConfig().then((x) => setC({ ...x, bloques: x.bloques.map((b) => `${b.desde}-${b.hasta}`).join(", ") }));
  }, []);
  const [prueba, setPrueba] = useState(null);
  if (!c) return null;

  const probarCorreo = async () => {
    if (!(await pedir({ titulo: "¿Enviar un correo de prueba?", texto: "Te manda un mensaje a la casilla configurada en MAIL_USER para comprobar que los correos de confirmación funcionan.", boton: "Enviar" }))) return;
    setPrueba(null);
    try { setPrueba(await adm("correo-prueba", "POST")); } catch (x) { fallo(x); }
  };

  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const setPelu = (id, k, v) => setC({ ...c, peluqueros: c.peluqueros.map((p) => (p.id === id ? { ...p, [k]: v } : p)) });
  const hhmm = (h) => { const [a, b = "00"] = h.trim().split(":"); return `${a.padStart(2, "0")}:${b.padStart(2, "0")}`; };

  const guardar = async (e) => {
    e.preventDefault();
    if (!(await pedir({ titulo: "¿Guardar los datos del local?", texto: "Los cambios (nombre, peluqueros, horarios, contacto y fondo) se ven enseguida en la página.", boton: "Guardar" }))) return;
    const bloques = c.bloques.split(",").map((t) => t.split("-")).filter((p) => p.length === 2).map(([d, h]) => ({ desde: hhmm(d), hasta: hhmm(h) }));
    try { await adm("config", "PUT", { ...c, bloques }); ok("Datos guardados"); onCambio(); } catch (x) { fallo(x); }
  };

  return (
    <form className="a-form" onSubmit={guardar}>
      <label>Nombre de la peluquería<input value={c.nombre} onChange={set("nombre")} /></label>
      <label>Frase de la portada<input value={c.slogan} onChange={set("slogan")} /></label>
      <fieldset className="a-pelus">
        <legend>Peluqueros</legend>
        {c.peluqueros.map((p) => (
          <div className="a-pelu" key={p.id}>
            <label>Nombre<input value={p.nombre} onChange={(e) => setPelu(p.id, "nombre", e.target.value)} /></label>
            <label>Apellido<input value={p.apellido} onChange={(e) => setPelu(p.id, "apellido", e.target.value)} /></label>
          </div>
        ))}
      </fieldset>
      <label>Horarios de atención (turnos de 30 min)<input value={c.bloques} onChange={set("bloques")} placeholder="09:00-12:00, 17:00-20:00" /></label>
      <label>WhatsApp (con código de país, sin +)<input value={c.whatsapp} onChange={set("whatsapp")} inputMode="numeric" /></label>
      <label>Link de Instagram<input type="url" value={c.instagram} onChange={set("instagram")} /></label>
      <label>Dirección (el mapa se actualiza solo)<input value={c.direccion} onChange={set("direccion")} /></label>
      <label>Seña a cobrar con Mercado Pago (% del precio, 0 = no cobrar)
        <input type="number" min="0" max="100" step="5" value={c.sena ?? 0} onChange={set("sena")} />
        <small className="nota">{c.pagos ? "Mercado Pago está conectado: se cobra esta seña al reservar." : "Mercado Pago no está conectado todavía (falta MP_ACCESS_TOKEN): por ahora no se cobra nada."}</small>
      </label>
      <label>Fondo de la página
        <select value={c.tema} onChange={set("tema")}>
          <option value="claro">Claro</option>
          <option value="oscuro">Oscuro</option>
        </select>
      </label>
      <button className="btn">Guardar datos</button>
      <div className="a-prueba">
        <button type="button" className="btn btn--sm btn--ghost" onClick={probarCorreo}>Enviar correo de prueba</button>
        {prueba && <p className={`aviso aviso--${prueba.ok ? "ok" : "error"}`}>{prueba.ok ? `Listo: mandamos un correo a ${prueba.para}. Revisá la bandeja de entrada y el spam.` : prueba.detalle}{!prueba.ok && prueba.usuario ? ` (El servidor lee: usuario «${prueba.usuario}» y una contraseña de ${prueba.largoClave} caracteres; tiene que ser de 16.)` : ""}</p>}
      </div>
    </form>
  );
}

function TurnosAdmin({ ok, fallo, pedir }) {
  const [lista, setLista] = useState(null);
  useEffect(() => { adm("turnos").then(setLista).catch(fallo); }, []);

  const cancelar = async (t) => {
    if (!(await pedir({ titulo: `¿Cancelar el turno de ${t.nombre}?`, texto: `${fechaCorta(t.fecha)} a las ${t.hora} · ${t.servicio} con ${t.peluquero}. El horario queda libre y se borra del historial.${t.pagoId ? ` Ya pagó una seña (pago ${t.pagoId}): si querés devolverla, hacelo desde tu cuenta de Mercado Pago.` : ""}`, boton: "Sí, cancelar turno", peligro: true }))) return;
    try { await adm(`turnos/${t.id}`, "DELETE"); setLista((l) => l.filter((x) => x.id !== t.id)); ok("Turno cancelado"); } catch (e) { fallo(e); }
  };

  if (!lista) return null;
  if (!lista.length) return <p className="nota">Todavía no hay turnos reservados.</p>;
  return (
    <ul className="a-lista">
      {lista.map((t) => (
        <li className="a-fila a-fila--turno" key={t.id}>
          <strong>{fechaCorta(t.fecha)} · {t.hora}</strong>
          <span>{t.nombre} · {t.telefono}</span>
          <span>{t.servicio} ({t.duracion} min) · {t.peluquero} · {peso(t.precio)}{t.estado === "pendiente" ? " · ⏳ esperando el pago de la seña" : t.sena > 0 ? ` · seña pagada ${peso(t.sena)}` : ""}</span>
          <button className="btn btn--sm btn--peligro" onClick={() => cancelar(t)}>Cancelar</button>
        </li>
      ))}
    </ul>
  );
}

export default function Admin({ onCambio }) {
  const [dentro, setDentro] = useState(!!sessionStorage.getItem("adm"));
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("cortes");
  const [aviso, setAviso] = useState("");
  const [conf, setConf] = useState(null);
  // pedir({...}) abre la ventana de confirmación y devuelve true o false
  const pedir = (datos) => new Promise((res) => setConf({ ...datos, res }));
  const responder = (v) => { conf.res(v); setConf(null); };

  const salir = () => { sessionStorage.removeItem("adm"); setDentro(false); };
  const ok = (t) => { setAviso(t); setTimeout(() => setAviso(""), 2200); };
  const fallo = (e) => { if (/Sesión/.test(e.message)) salir(); ok(e.message); };

  const entrar = async (e) => {
    e.preventDefault();
    try {
      const { token } = await adm("login", "POST", { password: pass });
      sessionStorage.setItem("adm", token); setDentro(true); setError(""); setPass("");
    } catch (x) { setError(x.message); }
  };

  if (!dentro) {
    return (
      <main className="login">
        <form className="login__caja" onSubmit={entrar}>
          <h1>Panel de la peluquería</h1>
          <label>Contraseña<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus required /></label>
          {error && <p className="aviso aviso--error">{error}</p>}
          <button className="btn">Ingresar</button>
          <a href="#" className="login__volver">Volver al sitio</a>
        </form>
      </main>
    );
  }

  return (
    <main className="admin">
      <div className="a-top">
        <h1>Panel de la peluquería</h1>
        <div className="a-top__acc">
          <a className="btn btn--sm" href="#">Ver el sitio</a>
          <button className="btn btn--sm btn--ghost" onClick={salir}>Salir</button>
        </div>
      </div>
      <div className="a-tabs" role="tablist">
        {[["cortes", "Cortes y precios"], ["barberos", "Barberos y balance"], ["datos", "Datos del local"], ["turnos", "Turnos"]].map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{nombre}</button>
        ))}
      </div>
      {tab === "cortes" && <Cortes onCambio={onCambio} ok={ok} fallo={fallo} pedir={pedir} />}
      {tab === "barberos" && <Barberos fallo={fallo} />}
      {tab === "datos" && <Datos onCambio={onCambio} ok={ok} fallo={fallo} pedir={pedir} />}
      {tab === "turnos" && <TurnosAdmin ok={ok} fallo={fallo} pedir={pedir} />}
      {conf && <Confirmar {...conf} onResp={responder} />}
      {aviso && <div className="toast" role="status">{aviso}</div>}
    </main>
  );
}
