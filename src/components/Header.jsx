import { estadoLocal } from "../js/format.js";

export default function Header({ n, servicios, sesion, onSalir }) {
  const estado = estadoLocal(n.bloques, n.diasCerrados);
  const cinta = [...servicios, ...servicios];

  return (
    <>
      <nav className="nav">
        <a href="#inicio" className="brand"><span aria-hidden="true">✂</span> {n.nombre}</a>
        <div className="nav__links">
          <a href="#servicios">Precios</a>
          <a href="#turnos">Turnos</a>
          {sesion && <a href="#mis-turnos">Mis turnos</a>}
          <a href="#contacto">Contacto</a>
          {sesion && (
            <span className="nav__user">
              {sesion.usuario.nombre.split(" ")[0]} · <button type="button" onClick={onSalir}>Salir</button>
            </span>
          )}
        </div>
      </nav>

      <div className="portada">
        <header className="hero" id="inicio">
          <div className="hero__text">
            {estado && <p className={`pill${estado.abierto ? " pill--on" : ""}`}><i />{estado.texto}</p>}
            <h1 aria-label={n.slogan}>
              {n.slogan.split(" ").map((p, i) => (
                <span key={i} aria-hidden="true" style={{ animationDelay: `${150 + i * 90}ms` }}>{p}</span>
              ))}
            </h1>
            <p className="hero__sub">Mirá los precios, elegí tu servicio y reservá tu horario en un minuto.</p>
            <a href="#turnos" className="btn">Pedir turno</a>
          </div>
          <div className="pole-wrap" aria-hidden="true"><div className="pole" /></div>
        </header>

        {servicios.length > 0 && (
          <div className="ticker" aria-hidden="true">
            <div className="ticker__pista">
              {[0, 1].map((k) => (
                <div className="ticker__grupo" key={k}>
                  {cinta.map((s, i) => <span key={`${s.id}${i}`}>{s.nombre}</span>)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
