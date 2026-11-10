export default function Footer({ n }) {
  return (
    <footer className="footer">
      <p>
        Derechos reservados 2026 · Desarrollado por{" "}
        <a href={n.github} target="_blank" rel="noreferrer">Thiago-Campa</a>
      </p>
      <a className="footer__admin" href="#/admin">Acceso admin</a>
    </footer>
  );
}
