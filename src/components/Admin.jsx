import { useEffect, useState } from "react";
import { adm, getServicios, getConfig } from "../js/api.js";
import { comprimir } from "../js/imagen.js";
import { peso, fechaCorta } from "../js/format.js";

function Cortes({ onCambio, ok, fallo }) {
  const [lista, setLista] = useState([]);
  useEffect(() => { getServicios().then(setLista); }, []);

  const campo = (id, k, v) => setLista((l) => l.map((s) => (s.id === id ? { ...s, [k]: v } : s)));
  const guardar = async (s) => {
    try { await adm(`servicios/${s.id}`, "PUT", s); ok("Corte guardado"); onCambio(); } catch (e) { fallo(e); }
  };
  const quitar = async (s) => {
    if (!confirm(`¿Quitar “${s.nombre}”? No se puede deshacer.`)) return;
    try { await adm(`servicios/${s.id}`, "DELETE"); setLista((l) => l.filter((x) => x.id !== s.id)); ok("Corte quitado"); onCambio(); } catch (e) { fallo(e); }
  };
  const agregar = async () => {
    try { const nuevo = await adm("servicios", "POST", { nombre: "Nuevo corte", precio: 0, duracion: 30 }); setLista((l) => [...l, nuevo]); onCambio(); } catch (e) { fallo(e); }
  };
  const subir = async (s, archivo) => {
    if (!archivo) return;
    try {
      const { url } = await adm("foto", "POST", { dataUrl: await comprimir(archivo) });
      campo(s.id, "foto", url);
      await adm(`servicios/${s.id}`, "PUT", { ...s, foto: url });
      ok("Foto actualizada"); onCambio();
    } catch (e) { fallo(e); }
  };

  return (
    <>
      <button className="btn" onClick={agregar}>Agregar corte</button>
      <ul className="a-lista">
        {lista.map((s) => (
          <li className="a-fila" key={s.id}>
            <label className="a-foto">
              {s.foto ? <img src={s.foto} alt="" /> : <span>Sin foto</span>}
              <input type="file" accept="image/*" hidden onChange={(e) => subir(s, e.target.files[0])} />
              <em>{s.foto ? "Cambiar foto" : "Agregar foto"}</em>
            </label>
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

function Datos({ onCambio, ok, fallo }) {
  const [c, setC] = useState(null);
  useEffect(() => {
    getConfig().then((x) => setC({ ...x, bloques: x.bloques.map((b) => `${b.desde}-${b.hasta}`).join(", ") }));
  }, []);
  if (!c) return null;

  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const setPelu = (id, k, v) => setC({ ...c, peluqueros: c.peluqueros.map((p) => (p.id === id ? { ...p, [k]: v } : p)) });
  const hhmm = (h) => { const [a, b = "00"] = h.trim().split(":"); return `${a.padStart(2, "0")}:${b.padStart(2, "0")}`; };

  const guardar = async (e) => {
    e.preventDefault();
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
      <label>Fondo de la página
        <select value={c.tema} onChange={set("tema")}>
          <option value="claro">Claro</option>
          <option value="oscuro">Oscuro</option>
        </select>
      </label>
      <button className="btn">Guardar datos</button>
    </form>
  );
}

function TurnosAdmin({ ok, fallo }) {
  const [lista, setLista] = useState(null);
  useEffect(() => { adm("turnos").then(setLista).catch(fallo); }, []);

  const cancelar = async (t) => {
    if (!confirm(`¿Cancelar el turno de ${t.nombre}?`)) return;
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
          <span>{t.servicio} ({t.duracion} min) · {t.peluquero} · {peso(t.precio)}</span>
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
        {[["cortes", "Cortes y precios"], ["datos", "Datos del local"], ["turnos", "Turnos"]].map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{nombre}</button>
        ))}
      </div>
      {tab === "cortes" && <Cortes onCambio={onCambio} ok={ok} fallo={fallo} />}
      {tab === "datos" && <Datos onCambio={onCambio} ok={ok} fallo={fallo} />}
      {tab === "turnos" && <TurnosAdmin ok={ok} fallo={fallo} />}
      {aviso && <div className="toast" role="status">{aviso}</div>}
    </main>
  );
}
