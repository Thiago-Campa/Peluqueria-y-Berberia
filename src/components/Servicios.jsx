import { peso } from "../js/format.js";

export default function Servicios({ servicios, error, onReservar }) {
  return (
    <section id="servicios" className="section">
      <div className="wrap">
        <h2 className="title">Servicios y precios</h2>
        <p className="lead">Elegí el que quieras y tocá “Reservar”. Te llevamos directo a los horarios.</p>
        {error && <p className="aviso aviso--error">{error}</p>}
        <ul className="menu">
          {servicios.map((s) => (
            <li key={s.id} className="plato">
              <span className="sello-precio">{peso(s.precio)}</span>
              <h3>{s.nombre}</h3>
              {s.desc && <p>{s.desc}</p>}
              <span className="plato__min">{s.duracion} min</span>
              <button className="btn btn--sm" onClick={() => onReservar(s.id)}>Reservar</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
