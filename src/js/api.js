export const resolver = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.mensaje || "Error del servidor"), { status: res.status });
  return data;
};

export const getServicios = () => fetch("/api/servicios").then(resolver);
export const getConfig = () => fetch("/api/config").then(resolver);
export const getOcupados = (fecha) => fetch(`/api/turnos/ocupados?fecha=${fecha}`).then(resolver);

// Sesión del cliente (se guarda en el navegador para que no tenga que ingresar cada vez)
export const leerSesion = () => { try { return JSON.parse(localStorage.getItem("cliente")); } catch { return null; } };
export const guardarSesion = (s) => { try { localStorage.setItem("cliente", JSON.stringify(s)); } catch {} };
export const borrarSesion = () => { try { localStorage.removeItem("cliente"); } catch {} };

const enviar = (ruta, body, token) =>
  fetch(`/api/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }).then(resolver);

export const registrarse = (datos) => enviar("registro", datos);
export const verificarRegistro = (datos) => enviar("registro/verificar", datos);
export const olvideClave = (datos) => enviar("clave/olvide", datos);
export const nuevaClave = (datos) => enviar("clave/nueva", datos);
export const confirmarPago = (paymentId, token) => enviar("pago/confirmar", { paymentId }, token);
export const ingresar = (datos) => enviar("login", datos);
export const verificarSesion = (token) => fetch("/api/yo", { headers: { Authorization: `Bearer ${token}` } }).then(resolver);
export const crearTurno = (datos, token) => enviar("turnos", datos, token);

// Llamadas del panel admin (llevan el token de la sesión)
export const adm = (ruta, metodo = "GET", body) =>
  fetch(`/api/admin/${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("adm") || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  }).then(resolver);
