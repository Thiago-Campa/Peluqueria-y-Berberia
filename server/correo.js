// Envío de correos con nodemailer + Gmail (contraseña de aplicación).
// Variables: MAIL_USER (tu Gmail) y MAIL_PASS (contraseña de aplicación de 16 letras).
import { LOGO } from "./logo.js";

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (iso) => iso.split("-").reverse().join("/");
const peso = (n) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

// La contraseña de aplicación de Google se muestra con espacios (abcd efgh ...): se los sacamos solos
const usuario = () => (process.env.MAIL_USER || "").trim();
const clave = () => (process.env.MAIL_PASS || "").replace(/\s+/g, "");
export const correoConfigurado = () => !!(usuario() && clave());
// Para el botón de prueba del admin: qué está leyendo el servidor (sin mostrar la contraseña)
export const diagnostico = () => ({ usuario: usuario(), largoClave: clave().length });
const esEjemplo = () => /tu_correo|tucorreo|tu_contrase/i.test(usuario() + clave());

// Traduce el error técnico a algo que se pueda entender y arreglar
const explicar = (e) => {
  const m = String(e?.message || e);
  if (e?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find (package|module) 'nodemailer'/.test(m)) return "Falta instalar nodemailer: corré «npm install» en la carpeta del proyecto y reiniciá el servidor.";
  if (e?.code === "EAUTH" || /Invalid login|Username and Password not accepted|535/.test(m)) return "Gmail rechazó el usuario o la contraseña. Tiene que ser una «contraseña de aplicación» de 16 letras (sin espacios), no la clave normal de la cuenta, y la cuenta necesita la verificación en 2 pasos.";
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET/.test(m)) return "No hay conexión con Gmail desde este servidor. Revisá tu internet.";
  return m;
};

let transporte;
async function getTransporte() {
  if (transporte) return transporte;
  const { default: nodemailer } = await import("nodemailer");
  transporte = nodemailer.createTransport({
    service: "gmail",
    auth: { user: usuario(), pass: clave() },
  });
  return transporte;
}

// Devuelve { ok: true } o { ok: false, motivo } (motivo "no-config" si faltan las variables)
export async function enviarCorreo({ para, asunto, texto, html }) {
  if (!correoConfigurado()) {
    console.warn("Correo no configurado (faltan MAIL_USER y MAIL_PASS): no se envió el mail.");
    return { ok: false, motivo: "no-config", detalle: "Faltan MAIL_USER y MAIL_PASS en el .env (o en las variables de Vercel). Después de cargarlos, reiniciá el servidor." };
  }
  if (esEjemplo()) return { ok: false, motivo: "ejemplo", detalle: "El .env todavía tiene los datos de ejemplo (tu_correo@gmail.com / tu_contraseña_de_aplicacion). Reemplazalos por tu Gmail real y tu contraseña de aplicación, guardá y reiniciá el servidor." };
  try {
    const t = await getTransporte();
    await t.sendMail({ from: `"${process.env.MAIL_NOMBRE || "Turnos"}" <${usuario()}>`, to: para, subject: asunto, text: texto, html,
      attachments: html?.includes("cid:logo-peluqueria") ? [{ filename: "logo.jpg", content: LOGO, cid: "logo-peluqueria", contentDisposition: "inline" }] : [] });
    return { ok: true };
  } catch (e) {
    transporte = undefined; // la próxima vez se vuelve a armar la conexión
    console.error("No se pudo enviar el correo:", e.message);
    return { ok: false, motivo: "error", detalle: explicar(e) };
  }
}

// El logo va incrustado en el correo (adjunto "inline"), así se ve siempre y no depende de ninguna dirección web
const marco = (cfg, cuerpo) =>
  `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1b2333">
  <img src="cid:logo-peluqueria" alt="${esc(cfg.nombre)}" width="120" height="120" style="display:block;margin:0 0 12px">
  <h2 style="margin:0 0 8px">${esc(cfg.nombre)}</h2>${cuerpo}</div>`;

export function correoReserva({ turno, cfg, nombrePelu }) {
  const resta = Math.max(0, turno.precio - (turno.sena || 0));
  const filas = [
    ["Servicio", turno.servicio],
    ["Día", fecha(turno.fecha)],
    ["Hora", turno.hora],
    ["Peluquero", nombrePelu],
    ["Duración", `${turno.duracion} min`],
    ["Total", peso(turno.precio)],
    ...(turno.sena ? [["Seña pagada", peso(turno.sena)], ["Resta abonar en el local", peso(resta)]] : []),
  ];
  const texto = [
    `Hola ${turno.nombre}, tu turno en ${cfg.nombre} quedó confirmado.`,
    "",
    ...filas.map(([k, v]) => `${k}: ${v}`),
    "",
    `Dirección: ${cfg.direccion}`,
    "Si no podés venir, avisanos por WhatsApp para liberar el horario.",
  ].join("\n");
  const html = marco(cfg, `
    <p>Hola ${esc(turno.nombre)}, tu turno quedó <strong>confirmado</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      ${filas.map(([k, v]) => `<tr><td style="padding:8px;border-bottom:1px solid #e4e9f2;color:#5b6577">${k}</td><td style="padding:8px;border-bottom:1px solid #e4e9f2;text-align:right"><strong>${esc(v)}</strong></td></tr>`).join("")}
    </table>
    <p style="color:#5b6577">Dirección: ${esc(cfg.direccion)}</p>
    <p style="color:#5b6577">Si no podés venir, avisanos por WhatsApp para liberar el horario.</p>`);
  return { asunto: `Turno confirmado en ${cfg.nombre}`, texto, html };
}

export function correoCodigo({ codigo, motivo, cfg, nombre }) {
  const que = motivo === "clave" ? "cambiar tu contraseña" : "confirmar tu correo y crear tu cuenta";
  const texto = `Hola ${nombre || ""}, tu código para ${que} en ${cfg.nombre} es: ${codigo}\n\nVence en 15 minutos. Si no lo pediste vos, ignorá este mensaje.`;
  const html = marco(cfg, `
    <p>Hola ${esc(nombre || "")}, usá este código para ${que}:</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;background:#e4e9f2;padding:14px;border-radius:8px">${esc(codigo)}</p>
    <p style="color:#5b6577">Vence en 15 minutos. Si no lo pediste vos, ignorá este mensaje.</p>`);
  return { asunto: `Tu código: ${codigo}`, texto, html };
}
