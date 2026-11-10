export const resolver = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.mensaje || "Error del servidor");
  return data;
};

export const getServicios = () => fetch("/api/servicios").then(resolver);
export const getConfig = () => fetch("/api/config").then(resolver);
export const getOcupados = (fecha) => fetch(`/api/turnos/ocupados?fecha=${fecha}`).then(resolver);
export const crearTurno = (datos) =>
  fetch("/api/turnos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  }).then(resolver);

// Llamadas del panel admin (llevan el token de la sesión)
export const adm = (ruta, metodo = "GET", body) =>
  fetch(`/api/admin/${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("adm") || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  }).then(resolver);
