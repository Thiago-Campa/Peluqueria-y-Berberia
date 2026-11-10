import express from "express";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { servicios as SEED } from "./servicios.js";
import { get, set, exclusivo } from "./store.js";

const app = express();
const PASS = process.env.ADMIN_PASSWORD || "admin1234";
const DIAS_CERRADOS = [0]; // domingo

const CONFIG_BASE = {
  nombre: "Tu Peluquería", slogan: "Corte prolijo, turno sin esperas.",
  whatsapp: "5491100000000", instagram: "https://www.instagram.com/tu_peluqueria/",
  direccion: "Obelisco, Buenos Aires",
  peluqueros: [
    { id: "p1", nombre: "Peluquero 1", apellido: "" },
    { id: "p2", nombre: "Peluquero 2", apellido: "" },
  ],
  bloques: [{ desde: "09:00", hasta: "12:00" }, { desde: "17:00", hasta: "20:00" }],
  intervalo: 30, // minutos que dura cada turno
  tema: "claro",
};

app.use(express.json({ limit: "4mb" }));

// ---------- datos ----------
const getConfig = async () => {
  const guardada = await get("config", {});
  const cfg = { ...CONFIG_BASE };
  for (const k of Object.keys(CONFIG_BASE)) if (guardada[k] !== undefined) cfg[k] = guardada[k];
  return cfg;
};
const getServicios = async () =>
  (await get("servicios", SEED)).map((s) => ({ desc: "", foto: "", ...s, duracion: s.duracion || 30 }));
const getTurnos = async () =>
  (await get("turnos", [])).map((t) => ({ duracion: 30, peluqueroId: "p1", ...t }));

// ---------- horarios ----------
const aMin = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const nombrePelu = (p) => `${p.nombre} ${p.apellido}`.trim();
const cabe = (cfg, inicio, dur) =>
  cfg.bloques.some((b) => {
    const desde = aMin(b.desde);
    return inicio >= desde && inicio + dur <= aMin(b.hasta) && (inicio - desde) % cfg.intervalo === 0;
  });
const choca = (turnos, fecha, peluqueroId, inicio, dur) =>
  turnos.some((t) => t.fecha === fecha && t.peluqueroId === peluqueroId && inicio < aMin(t.hora) + t.duracion && aMin(t.hora) < inicio + dur);

// ---------- sesión de admin (token firmado, sirve aunque Vercel use varias instancias) ----------
const firmar = (exp) => createHmac("sha256", PASS).update(String(exp)).digest("hex");
const crearToken = () => { const exp = Date.now() + 12 * 60 * 60 * 1000; return `${exp}.${firmar(exp)}`; };
const tokenValido = (t) => {
  const [exp, firma = ""] = String(t).split(".");
  if (!exp || Number(exp) < Date.now()) return false;
  const esperada = Buffer.from(firmar(exp)), recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
};
const auth = (req, res, next) =>
  tokenValido((req.headers.authorization || "").replace("Bearer ", ""))
    ? next()
    : res.status(401).json({ mensaje: "Sesión vencida. Ingresá de nuevo." });

app.post("/api/admin/login", (req, res) => {
  if (req.body.password !== PASS) return res.status(401).json({ mensaje: "Contraseña incorrecta." });
  res.json({ token: crearToken() });
});

// ---------- público ----------
app.get("/api/servicios", async (_req, res) => res.json(await getServicios()));
app.get("/api/config", async (_req, res) => res.json(await getConfig()));

app.get("/api/foto/:id", async (req, res) => {
  const f = await get(`foto:${req.params.id}`, null);
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(f || "");
  if (!m) return res.status(404).end();
  res.set("Content-Type", m[1]).set("Cache-Control", "public, max-age=31536000, immutable").send(Buffer.from(m[2], "base64"));
});

app.get("/api/turnos/ocupados", async (req, res) => {
  const turnos = await getTurnos();
  res.json(turnos.filter((t) => t.fecha === req.query.fecha).map(({ peluqueroId, hora, duracion }) => ({ peluqueroId, hora, duracion })));
});

app.post("/api/turnos", (req, res) =>
  exclusivo(async () => {
    const { nombre, telefono, servicioId, peluqueroId, fecha, hora } = req.body;
    const servicio = (await getServicios()).find((s) => s.id === servicioId);
    const cfg = await getConfig();
    const pelu = cfg.peluqueros.find((p) => p.id === peluqueroId);

    if (!nombre?.trim() || !telefono?.trim() || !servicio || !pelu || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") || !/^\d{2}:\d{2}$/.test(hora || ""))
      return res.status(400).json({ mensaje: "Faltan datos para reservar el turno." });

    const [y, m, d] = fecha.split("-").map(Number);
    const dia = new Date(y, m - 1, d);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (dia < hoy || DIAS_CERRADOS.includes(dia.getDay()))
      return res.status(400).json({ mensaje: "Ese día no se pueden reservar turnos." });

    const inicio = aMin(hora);
    if (!cabe(cfg, inicio, servicio.duracion))
      return res.status(400).json({ mensaje: "Ese horario no está disponible para este corte." });

    const turnos = await getTurnos();
    if (choca(turnos, fecha, pelu.id, inicio, servicio.duracion))
      return res.status(409).json({ mensaje: `Ese horario ya está reservado con ${nombrePelu(pelu)}. Tu turno no se confirmó: elegí otro horario u otro peluquero.` });

    const turno = {
      id: Date.now(), nombre: nombre.trim(), telefono: telefono.trim(),
      servicio: servicio.nombre, precio: servicio.precio, duracion: servicio.duracion,
      peluqueroId: pelu.id, fecha, hora,
    };
    await set("turnos", [...turnos, turno]);
    res.status(201).json({ ...turno, peluquero: nombrePelu(pelu) });
  })
);

// ---------- admin: cortes ----------
const limpiar = (b) => ({
  nombre: String(b.nombre || "").trim(),
  desc: String(b.desc || "").trim(),
  precio: Math.max(0, Number(b.precio) || 0),
  duracion: Math.min(240, Math.max(30, Math.round((Number(b.duracion) || 30) / 30) * 30)),
  foto: String(b.foto || "").startsWith("/api/foto/") ? b.foto : "",
});

app.post("/api/admin/servicios", auth, async (req, res) => {
  const s = limpiar(req.body);
  if (!s.nombre) return res.status(400).json({ mensaje: "Poné un nombre para el corte." });
  const nuevo = { id: randomUUID().slice(0, 8), ...s };
  await set("servicios", [...(await getServicios()), nuevo]);
  res.status(201).json(nuevo);
});

app.put("/api/admin/servicios/:id", auth, async (req, res) => {
  const lista = await getServicios();
  const i = lista.findIndex((s) => s.id === req.params.id);
  if (i < 0) return res.status(404).json({ mensaje: "Ese corte ya no existe." });
  const s = limpiar(req.body);
  if (!s.nombre) return res.status(400).json({ mensaje: "El corte necesita un nombre." });
  lista[i] = { ...lista[i], ...s };
  await set("servicios", lista);
  res.json(lista[i]);
});

app.delete("/api/admin/servicios/:id", auth, async (req, res) => {
  const lista = await getServicios();
  await set("servicios", lista.filter((s) => s.id !== req.params.id));
  res.json({ ok: true });
});

// ---------- admin: fotos (llegan ya achicadas desde el navegador) ----------
app.post("/api/admin/foto", auth, async (req, res) => {
  const dataUrl = req.body.dataUrl || "";
  if (!/^data:image\/(png|jpeg|webp);base64,.+$/.test(dataUrl) || dataUrl.length > 900_000)
    return res.status(400).json({ mensaje: "La imagen no es válida o es muy pesada." });
  const id = randomUUID();
  await set(`foto:${id}`, dataUrl);
  res.json({ url: `/api/foto/${id}` });
});

// ---------- admin: datos del local ----------
app.put("/api/admin/config", auth, async (req, res) => {
  const body = req.body;
  const cfg = await getConfig();
  for (const k of ["nombre", "slogan", "whatsapp", "instagram", "direccion"])
    if (typeof body[k] === "string") cfg[k] = body[k].trim();
  cfg.whatsapp = cfg.whatsapp.replace(/\D/g, "");
  if (["claro", "oscuro"].includes(body.tema)) cfg.tema = body.tema;

  if (Array.isArray(body.peluqueros))
    cfg.peluqueros = cfg.peluqueros.map((p) => {
      const nuevo = body.peluqueros.find((x) => x.id === p.id);
      return nuevo ? { id: p.id, nombre: String(nuevo.nombre || "").trim() || p.nombre, apellido: String(nuevo.apellido || "").trim() } : p;
    });

  if (Array.isArray(body.bloques)) {
    const validos = body.bloques.filter((x) => /^\d{2}:\d{2}$/.test(x.desde) && /^\d{2}:\d{2}$/.test(x.hasta) && aMin(x.desde) < aMin(x.hasta));
    if (validos.length) cfg.bloques = validos.sort((p, q) => aMin(p.desde) - aMin(q.desde));
  }

  await set("config", cfg);
  res.json(cfg);
});

// ---------- admin: turnos ----------
app.get("/api/admin/turnos", auth, async (_req, res) => {
  const cfg = await getConfig();
  const nombres = Object.fromEntries(cfg.peluqueros.map((p) => [p.id, nombrePelu(p)]));
  const turnos = (await getTurnos()).map((t) => ({ ...t, peluquero: nombres[t.peluqueroId] || "—" }));
  res.json(turnos.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)));
});

app.delete("/api/admin/turnos/:id", auth, async (req, res) => {
  const t = await getTurnos();
  await set("turnos", t.filter((x) => String(x.id) !== req.params.id));
  res.json({ ok: true });
});

export default app;
