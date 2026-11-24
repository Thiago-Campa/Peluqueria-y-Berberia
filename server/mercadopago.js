// Cobro de la seña con Mercado Pago (Checkout Pro), sin librerías: solo fetch.
// El dinero se acredita en la cuenta de Mercado Pago dueña del Access Token (MP_ACCESS_TOKEN).
const API = "https://api.mercadopago.com";

export const mpConfigurado = () => !!process.env.MP_ACCESS_TOKEN;

// Dirección pública del sitio (para volver de Mercado Pago y para el webhook)
export const baseUrl = () =>
  (process.env.BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:5173")
  ).replace(/\/$/, "");

async function llamar(ruta, opciones = {}) {
  const r = await fetch(API + ruta, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...opciones.headers },
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.message || datos.error || `Mercado Pago respondió ${r.status}`);
  return datos;
}

export async function crearPreferencia({ turnoId, titulo, monto, vence, email, nombre }) {
  const base = baseUrl();
  const https = base.startsWith("https://");
  const pref = await llamar("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{ id: String(turnoId), title: titulo.slice(0, 250), quantity: 1, unit_price: monto, currency_id: "ARS" }],
      payer: { email, name: nombre },
      external_reference: String(turnoId),
      back_urls: { success: `${base}/?pago=ok`, failure: `${base}/?pago=error`, pending: `${base}/?pago=pendiente` },
      ...(https ? { auto_return: "approved", notification_url: `${base}/api/mp/webhook` } : {}),
      expires: true,
      expiration_date_to: vence.toISOString(),
    }),
  });
  return pref.init_point;
}

export const obtenerPago = (id) => llamar(`/v1/payments/${encodeURIComponent(id)}`);

// Devuelve el pago completo al cliente (si el turno ya no existe o se pisó con otro)
export const reembolsar = (id) =>
  llamar(`/v1/payments/${encodeURIComponent(id)}/refunds`, { method: "POST", headers: { "X-Idempotency-Key": `reembolso-${id}` }, body: JSON.stringify({}) });
