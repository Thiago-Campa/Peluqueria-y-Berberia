import { horarioTexto } from "../js/format.js";

export default function Contacto({ n }) {
  const mapa = `https://www.google.com/maps?q=${encodeURIComponent(n.direccion)}&output=embed`;

  return (
    <section id="contacto" className="section">
      <div className="wrap contacto">
        <div className="info">
          <h2 className="title">Dónde estamos</h2>
          <p><strong>Dirección:</strong> {n.direccion}</p>
          <p><strong>Horarios:</strong> Lunes a sábado, {horarioTexto(n.bloques)}</p>
          <a className="btn" href={`https://wa.me/${n.whatsapp}`} target="_blank" rel="noreferrer">Escribinos por WhatsApp</a>
          <a className="btn btn--ghost" href={n.instagram} target="_blank" rel="noreferrer">Seguinos en Instagram</a>
        </div>
        <iframe className="mapa" title="Ubicación de la peluquería" src={mapa} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
    </section>
  );
}
