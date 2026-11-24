import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Servicios from "./components/Servicios.jsx";
import Turnos from "./components/Turnos.jsx";
import Contacto from "./components/Contacto.jsx";
import Footer from "./components/Footer.jsx";
import Admin from "./components/Admin.jsx";
import Acceso from "./components/Acceso.jsx";
import { getServicios, getConfig, leerSesion, borrarSesion, verificarSesion } from "./js/api.js";
import { NEGOCIO } from "./js/config.js";

const esAdmin = () => window.location.hash === "#/admin";

export default function App() {
  const [servicios, setServicios] = useState([]);
  const [cfg, setCfg] = useState(NEGOCIO);
  const [elegido, setElegido] = useState("");
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(esAdmin());
  const [sesion, setSesion] = useState(leerSesion());

  const salir = () => { borrarSesion(); setSesion(null); };

  const cargar = () =>
    Promise.all([getServicios(), getConfig()])
      .then(([s, c]) => { setServicios(s); setCfg({ ...NEGOCIO, ...c }); setError(""); })
      .catch(() => setError("No se pudo cargar la lista de precios. Revisá que el backend esté corriendo."));

  // Si la sesión guardada ya no sirve (venció o la cuenta no existe), se cierra
  useEffect(() => {
    if (sesion?.token) verificarSesion(sesion.token).catch((e) => { if (e.status === 401) salir(); });
  }, []);

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
      <Header n={cfg} servicios={servicios} sesion={sesion} onSalir={salir} />
      <main>
        <Servicios servicios={servicios} error={error} onReservar={reservar} />
        <Turnos n={cfg} servicios={servicios} elegido={elegido} setElegido={setElegido} sesion={sesion} onSesion={setSesion} onSalir={salir} />
        <Contacto n={cfg} />
      </main>
      <div className="checker" aria-hidden="true" />
      <Footer n={cfg} />
    </>
  );
}
