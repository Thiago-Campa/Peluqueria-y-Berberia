import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Servicios from "./components/Servicios.jsx";
import Turnos from "./components/Turnos.jsx";
import Contacto from "./components/Contacto.jsx";
import Footer from "./components/Footer.jsx";
import Admin from "./components/Admin.jsx";
import { getServicios, getConfig } from "./js/api.js";
import { NEGOCIO } from "./js/config.js";

const esAdmin = () => window.location.hash === "#/admin";

export default function App() {
  const [servicios, setServicios] = useState([]);
  const [cfg, setCfg] = useState(NEGOCIO);
  const [elegido, setElegido] = useState("");
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(esAdmin());

  const cargar = () =>
    Promise.all([getServicios(), getConfig()])
      .then(([s, c]) => { setServicios(s); setCfg({ ...NEGOCIO, ...c }); setError(""); })
      .catch(() => setError("No se pudo cargar la lista de precios. Probá de nuevo en un momento."));

  useEffect(() => {
    cargar();
    const alCambiar = () => setAdmin(esAdmin());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tema = cfg.tema || "claro";
    document.title = `${cfg.nombre} · Turnos y precios`;
  }, [cfg]);

  const reservar = (id) => {
    setElegido(id);
    document.getElementById("turnos")?.scrollIntoView({ behavior: "smooth" });
  };

  if (admin) return <Admin onCambio={cargar} />;

  return (
    <>
      <Header n={cfg} servicios={servicios} />
      <main>
        <Servicios servicios={servicios} error={error} onReservar={reservar} />
        <Turnos n={cfg} servicios={servicios} elegido={elegido} setElegido={setElegido} />
        <Contacto n={cfg} />
      </main>
      <div className="checker" aria-hidden="true" />
      <Footer n={cfg} />
    </>
  );
}
