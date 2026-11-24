import { useState } from "react";
import { ingresar, registrarse, verificarRegistro, olvideClave, nuevaClave, guardarSesion } from "../js/api.js";

// Pasos: ingresar · registro · codigo (confirmar el correo) · olvide · nueva (elegir otra contraseña)
export default function Acceso({ onListo }) {
  const [paso, setPaso] = useState("ingresar");
  const [f, setF] = useState({ nombre: "", telefono: "", email: "", clave: "", codigo: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cargando, setCargando] = useState(false);

  const cambiar = (e) => setF({ ...f, [e.target.name]: e.target.value });
  const ir = (p) => { setPaso(p); setError(""); setInfo(""); };
  const terminar = (sesion) => { guardarSesion(sesion); onListo(sesion); };

  const enviar = async (e) => {
    e.preventDefault();
    setError(""); setInfo(""); setCargando(true);
    try {
      if (paso === "ingresar") terminar(await ingresar({ email: f.email, clave: f.clave }));
      else if (paso === "registro") { await registrarse(f); setPaso("codigo"); setInfo(`Te mandamos un código de 6 números a ${f.email}.`); }
      else if (paso === "codigo") terminar(await verificarRegistro({ email: f.email, codigo: f.codigo }));
      else if (paso === "olvide") { await olvideClave({ email: f.email }); setPaso("nueva"); setInfo("Si hay una cuenta con ese correo, te mandamos un código de 6 números."); }
      else if (paso === "nueva") terminar(await nuevaClave({ email: f.email, codigo: f.codigo, clave: f.clave }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const conTabs = paso === "ingresar" || paso === "registro";
  const boton = { ingresar: "Ingresar", registro: "Seguir", codigo: "Confirmar y crear cuenta", olvide: "Mandarme el código", nueva: "Guardar contraseña e ingresar" }[paso];

  return (
    <form className="form acceso" onSubmit={enviar}>
      {conTabs ? (
        <div className="full acc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={paso === "ingresar"} onClick={() => ir("ingresar")}>Ingresar</button>
          <button type="button" role="tab" aria-selected={paso === "registro"} onClick={() => ir("registro")}>Crear cuenta</button>
        </div>
      ) : (
        <h3 className="full">{paso === "codigo" ? "Confirmá tu correo" : "Recuperar contraseña"}</h3>
      )}
      {conTabs && <p className="nota full">Para reservar un turno necesitás una cuenta. Te mandamos la confirmación por correo.</p>}
      {info && <p className="aviso aviso--ok full">{info}</p>}

      {paso === "registro" && (
        <>
          <label>Nombre
            <input name="nombre" value={f.nombre} onChange={cambiar} autoComplete="name" required />
          </label>
          <label>Teléfono
            <input name="telefono" type="tel" value={f.telefono} onChange={cambiar} autoComplete="tel" required />
          </label>
        </>
      )}

      {paso !== "codigo" && paso !== "nueva" && (
        <label className={paso === "registro" ? "" : "full"}>Correo
          <input name="email" type="email" value={f.email} onChange={cambiar} autoComplete="email" required />
        </label>
      )}

      {(paso === "codigo" || paso === "nueva") && (
        <label className="full">Código de 6 números
          <input name="codigo" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={f.codigo} onChange={cambiar} autoComplete="one-time-code" autoFocus required />
        </label>
      )}

      {(paso === "ingresar" || paso === "registro" || paso === "nueva") && (
        <label className={paso === "registro" ? "" : "full"}>{paso === "nueva" ? "Contraseña nueva" : "Contraseña"}{paso !== "ingresar" && " (mínimo 6 caracteres)"}
          <input name="clave" type="password" value={f.clave} onChange={cambiar} autoComplete={paso === "ingresar" ? "current-password" : "new-password"} minLength={paso === "ingresar" ? undefined : 6} required />
        </label>
      )}

      {error && <p className="aviso aviso--error full">{error}</p>}
      <button className="btn full" disabled={cargando}>{cargando ? "Un momento…" : boton}</button>

      <p className="acc-links full">
        {paso === "ingresar" && <button type="button" onClick={() => ir("olvide")}>Olvidé mi contraseña</button>}
        {(paso === "codigo" || paso === "olvide" || paso === "nueva") && <button type="button" onClick={() => ir(paso === "codigo" ? "registro" : "ingresar")}>Volver</button>}
      </p>
    </form>
  );
}
