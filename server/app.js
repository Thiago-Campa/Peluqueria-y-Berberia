import express from "express";
import cors from "cors";
import { createHmac, timingSafeEqual, randomInt } from "node:crypto";
import * as db from "./store.js";
import { hashClave, claveOk } from "./seguridad.js";
import { enviarCorreo, correoReserva, correoCodigo, correoConfigurado, diagnostico } from "./correo.js";
import * as mp from "./mercadopago.js";

const app = express();
const DIAS_CERRADOS = [0]; // domingo
// Cancelando con al menos esta anticipación (en minutos) se devuelve la seña.
// Con menos, el cliente puede cancelar igual, pero la seña queda para el local.
const ANTICIPO_MIN = 60;
const pesos = (n) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

// En Vercel no hay contraseña por defecto: hay que cargar ADMIN_PASSWORD en las variables
const PASS = process.env.ADMIN_PASSWORD || (process.env.VERCEL ? null : "admin1234");
const SECRET = process.env.ADMIN_SECRET || PASS || "sin-clave";

app.set("trust proxy", 1); // detrás de Vercel, para saber la IP real de cada visita
app.use(cors());
app.use(express.json());

// ---------- horarios ----------
const aMin = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const nombrePelu = (p) => `${p.nombre} ${p.apellido}`.trim();
// El corte tiene que empezar en un turno válido y terminar antes de que cierre ese bloque
const cabe = (cfg, inicio, dur) =>
  cfg.bloques.some((b) => {
    const desde = aMin(b.desde);
    return inicio >= desde && inicio + dur <= aMin(b.hasta) && (inicio - desde) % cfg.intervalo === 0;
  });

// ---------- sesión de admin (token firmado: funciona aunque Vercel use varias instancias) ----------
const firmar = (exp) => createHmac("sha256", SECRET).update(String(exp)).digest("hex");
const crearToken = () => { const exp = Date.now() + 12 * 60 * 60 * 1000; return `${exp}.${firmar(exp)}`; };
const tokenValido = (t = "") => {
  const [exp, firma] = t.split(".");
  if (!exp || !firma || Number(exp) < Date.now()) return false;
  const esperada = firmar(exp);
  return firma.length === esperada.length && timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
};
const auth = (req, res, next) =>
  tokenValido((req.headers.authorization || "").replace("Bearer ", ""))
    ? next()
    : res.status(401).json({ mensaje: "Sesión vencida. Ingresá de nuevo." });

// Corta si alguien intenta demasiadas veces (ver store.limitar). Devuelve true si ya cortó.
const frenar = async (res, clave, max, minutos) => {
  if (await db.limitar(clave, max, minutos)) return false;
  res.status(429).json({ mensaje: `Demasiados intentos. Probá de nuevo en ${minutos} minutos.` });
  return true;
};

app.post("/api/admin/login", async (req, res) => {
  if (await frenar(res, `admin:${req.ip}`, 10, 15)) return;
  if (!PASS) return res.status(503).json({ mensaje: "Falta configurar ADMIN_PASSWORD en Vercel." });
  if (req.body.password !== PASS) return res.status(401).json({ mensaje: "Contraseña incorrecta." });
  await db.reiniciarLimite(`admin:${req.ip}`);
  res.json({ token: crearToken() });
});

// ---------- sesión de clientes (token firmado, dura 30 días) ----------
const firmarU = (txt) => createHmac("sha256", SECRET).update(`u:${txt}`).digest("hex");
const crearTokenU = (id) => { const base = `${id}.${Date.now() + 30 * 24 * 60 * 60 * 1000}`; return `${base}.${firmarU(base)}`; };
const idDelToken = (t = "") => {
  const [id, exp, firma] = t.split(".");
  if (!id || !exp || !firma || Number(exp) < Date.now()) return null;
  const esperada = firmarU(`${id}.${exp}`);
  return firma.length === esperada.length && timingSafeEqual(Buffer.from(firma), Buffer.from(esperada)) ? Number(id) : null;
};
const authU = async (req, res, next) => {
  const id = idDelToken((req.headers.authorization || "").replace("Bearer ", ""));
  const usuario = id && (await db.usuarioPorId(id));
  if (!usuario) return res.status(401).json({ mensaje: "Tu sesión venció. Iniciá sesión de nuevo para reservar." });
  req.usuario = usuario;
  next();
};
const esEmail = (e) => e.length <= 120 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(e);

const codigoHash = (email, codigo) => createHmac("sha256", SECRET).update(`c:${email}:${codigo}`).digest("hex");
const sesionDe = (usuario) => ({ token: crearTokenU(usuario.id), usuario });

// Manda un código de 6 números por correo. Devuelve true si salió (o si estamos probando en tu compu sin correo).
async function mandarCodigo(res, { email, tipo, datos, nombre }) {
  const codigo = String(randomInt(100000, 1000000));
  await db.guardarCodigo(email, tipo, codigoHash(email, codigo), datos);
  const cfg = await db.getConfig();
  const mail = correoCodigo({ codigo, motivo: tipo, cfg, nombre });
  const r = await enviarCorreo({ para: email, asunto: mail.asunto, texto: mail.texto, html: mail.html });
  if (r.ok) return true;
  if (r.motivo === "no-config" && !process.env.VERCEL) {
    console.log(`\n[PRUEBA LOCAL] Código para ${email}: ${codigo}\n`); // sin correo configurado, se ve en esta terminal
    return true;
  }
  await db.borrarCodigo(email, tipo);
  res.status(503).json({ mensaje: "No pudimos enviarte el correo con el código. Probá de nuevo en un rato." });
  return false;
}

// 1) El cliente completa sus datos y le mandamos un código al correo
app.post("/api/registro", async (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const telefono = String(req.body.telefono || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const clave = String(req.body.clave || "");
  if (!nombre || !telefono) return res.status(400).json({ mensaje: "Completá tu nombre y tu teléfono." });
  if (!esEmail(email)) return res.status(400).json({ mensaje: "Ese correo no parece válido." });
  if (clave.length < 6) return res.status(400).json({ mensaje: "La contraseña tiene que tener al menos 6 caracteres." });
  if (await frenar(res, `reg:${email}`, 5, 60) || await frenar(res, `reg-ip:${req.ip}`, 20, 60)) return;
  if (await db.usuarioPorEmail(email)) return res.status(409).json({ mensaje: "Ya hay una cuenta con ese correo. Ingresá con tu contraseña." });
  if (await mandarCodigo(res, { email, tipo: "registro", nombre, datos: { nombre, telefono, clave: hashClave(clave) } }))
    res.json({ pendiente: true, email });
});

// 2) Con el código correcto se crea la cuenta y queda iniciada la sesión
app.post("/api/registro/verificar", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (await frenar(res, `ver-ip:${req.ip}`, 30, 15)) return;
  const r = await db.verificarCodigo(email, "registro", codigoHash(email, String(req.body.codigo || "").trim()));
  if (!r.ok) return res.status(400).json({ mensaje: r.motivo });
  const usuario = await db.crearUsuario({ nombre: r.datos.nombre, email, telefono: r.datos.telefono, clave: r.datos.clave });
  if (!usuario) return res.status(409).json({ mensaje: "Ya hay una cuenta con ese correo. Ingresá con tu contraseña." });
  res.status(201).json(sesionDe(usuario));
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (await frenar(res, `login:${email}`, 8, 15) || await frenar(res, `login-ip:${req.ip}`, 40, 15)) return;
  const u = await db.usuarioPorEmail(email);
  if (!u || !claveOk(String(req.body.clave || ""), u.clave)) return res.status(401).json({ mensaje: "Correo o contraseña incorrectos." });
  await db.reiniciarLimite(`login:${email}`);
  const { clave, ...usuario } = u;
  res.json(sesionDe(usuario));
});

// Recuperar contraseña: se pide un código y con él se elige una nueva
app.post("/api/clave/olvide", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!esEmail(email)) return res.status(400).json({ mensaje: "Ese correo no parece válido." });
  if (await frenar(res, `olv:${email}`, 5, 60) || await frenar(res, `olv-ip:${req.ip}`, 20, 60)) return;
  const u = await db.usuarioPorEmail(email);
  // Siempre se responde lo mismo, exista o no la cuenta (para no revelar quién está registrado)
  if (u && !(await mandarCodigo(res, { email, tipo: "clave", nombre: u.nombre }))) return;
  res.json({ ok: true });
});

app.post("/api/clave/nueva", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const clave = String(req.body.clave || "");
  if (clave.length < 6) return res.status(400).json({ mensaje: "La contraseña tiene que tener al menos 6 caracteres." });
  if (await frenar(res, `ver-ip:${req.ip}`, 30, 15)) return;
  const r = await db.verificarCodigo(email, "clave", codigoHash(email, String(req.body.codigo || "").trim()));
  if (!r.ok) return res.status(400).json({ mensaje: r.motivo });
  await db.cambiarClave(email, hashClave(clave));
  await db.reiniciarLimite(`login:${email}`);
  const u = await db.usuarioPorEmail(email);
  const { clave: _, ...usuario } = u;
  res.json(sesionDe(usuario));
});

app.get("/api/yo", authU, (req, res) => res.json(req.usuario));

// ---------- público ----------
app.get("/api/servicios", async (_req, res) => res.json(await db.getServicios()));
app.get("/api/config", async (_req, res) => res.json({ ...(await db.getConfig()), pagos: mp.mpConfigurado(), anticipo: ANTICIPO_MIN }));
app.get("/api/turnos/ocupados", async (req, res) => res.json(await db.ocupados(String(req.query.fecha || ""))));

app.post("/api/turnos", authU, async (req, res) => {
  const { servicioId, peluqueroId, fecha, hora } = req.body;
  const { nombre, telefono, email } = req.usuario;
  const servicio = (await db.getServicios()).find((s) => s.id === servicioId);
  const cfg = await db.getConfig();
  const pelu = cfg.peluqueros.find((p) => p.id === peluqueroId);

  if (!servicio || !pelu || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") || !/^\d{2}:\d{2}$/.test(hora || ""))
    return res.status(400).json({ mensaje: "Faltan datos para reservar el turno." });

  const [y, m, d] = fecha.split("-").map(Number);
  const dia = new Date(y, m - 1, d);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (dia < hoy || DIAS_CERRADOS.includes(dia.getDay()))
    return res.status(400).json({ mensaje: "Ese día no se pueden reservar turnos." });

  const inicio = aMin(hora);
  if (!cabe(cfg, inicio, servicio.duracion))
    return res.status(400).json({ mensaje: "Ese horario no está disponible para este corte." });

  // Con Mercado Pago configurado y seña > 0, el turno queda "pendiente" 15 minutos hasta que se pague
  const sena = mp.mpConfigurado() ? Math.round((servicio.precio * (cfg.sena || 0)) / 100) : 0;
  const vence = sena > 0 ? new Date(Date.now() + 15 * 60 * 1000) : null;
  const turno = await db.reservar({
    nombre, telefono, email, usuarioId: req.usuario.id, servicio, peluqueroId: pelu.id, fecha, hora, inicio,
    estado: sena > 0 ? "pendiente" : "confirmado", sena, vence,
  });
  if (!turno)
    return res.status(409).json({ mensaje: `Ese horario ya está reservado con ${nombrePelu(pelu)}. Tu turno no se confirmó: elegí otro horario u otro peluquero.` });

  if (sena > 0) {
    try {
      const pagoUrl = await mp.crearPreferencia({ turnoId: turno.id, titulo: `Seña ${servicio.nombre} - ${cfg.nombre}`, monto: sena, vence, email, nombre });
      return res.status(201).json({ pagoUrl, sena });
    } catch (e) {
      console.error("No se pudo crear el pago en Mercado Pago:", e.message);
      await db.borrarTurno(turno.id); // se libera el horario
      return res.status(502).json({ mensaje: "No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en un momento." });
    }
  }

  res.status(201).json(await entregarTurno(turno.id, true));
});

// Arma la respuesta del turno confirmado y, si corresponde, manda el correo.
// El correo se manda antes de responder (en Vercel la función se corta al contestar).
async function entregarTurno(id, mandarMail) {
  const t = await db.turnoCompleto(id);
  let correo;
  if (mandarMail) {
    const cfg = await db.getConfig();
    const mail = correoReserva({ turno: t, cfg, nombrePelu: t.peluquero });
    correo = (await enviarCorreo({ para: t.email, asunto: mail.asunto, texto: mail.texto, html: mail.html })).ok;
  }
  return { ...t, correo };
}

// ---------- Mercado Pago: confirmación del pago ----------
// Se consulta SIEMPRE el pago a Mercado Pago con nuestro token: no se confía en lo que llegue en el pedido.
async function procesarPago(paymentId) {
  const pago = await mp.obtenerPago(paymentId);
  const turnoId = Number(pago.external_reference);
  if (!turnoId) return { estado: "ignorado" };
  if (pago.status !== "approved") return { estado: pago.status, turnoId };

  const r = await db.confirmarPago(turnoId, String(pago.id), Number(pago.transaction_amount));
  if (r.estado === "choque" || r.estado === "inexistente" || r.estado === "cancelado") {
    // Pagó pero el horario ya no está (o el cliente canceló antes de que entrara el pago): se le devuelve la plata
    try {
      await mp.reembolsar(pago.id);
      if (r.estado === "cancelado") await db.marcarReembolso(turnoId, String(pago.id));
    } catch (e) {
      console.error(`No se pudo reembolsar el pago ${pago.id}:`, e.message);
    }
  }
  if (r.estado === "monto") console.error(`El pago ${pago.id} es menor a la seña del turno ${turnoId}: no se confirmó.`);
  return { ...r, turnoId };
}

// Mercado Pago avisa acá cuando se acredita un pago (solo funciona con el sitio publicado en https)
app.post("/api/mp/webhook", async (req, res) => {
  const id = req.query["data.id"] || req.body?.data?.id || (req.query.topic === "payment" ? req.query.id : null);
  const tipo = req.query.type || req.body?.type || req.query.topic;
  if (id && (!tipo || tipo === "payment")) {
    try {
      const r = await procesarPago(id);
      if (r.estado === "confirmado") await entregarTurno(r.turnoId, true);
    } catch (e) {
      console.error("Webhook de Mercado Pago:", e.message);
      return res.sendStatus(500); // Mercado Pago reintenta
    }
  }
  res.sendStatus(200);
});

// El cliente vuelve de Mercado Pago: se confirma el pago acá también (sirve en tu compu, donde el webhook no llega)
app.post("/api/pago/confirmar", authU, async (req, res) => {
  if (!mp.mpConfigurado()) return res.status(400).json({ mensaje: "Los pagos no están activados." });
  const r = await procesarPago(String(req.body.paymentId || ""));
  const t = r.turnoId && (await db.turnoCompleto(r.turnoId));
  if (!t || t.email.toLowerCase() !== req.usuario.email.toLowerCase())
    return res.status(404).json({ mensaje: "No encontramos ese pago entre tus turnos." });
  if (t.estado === "cancelado")
    return res.status(409).json({ mensaje: `Ese turno está cancelado.${r.estado === "cancelado" ? " Te devolvemos la seña a Mercado Pago." : ""}` });
  if (r.estado === "confirmado") return res.json(await entregarTurno(t.id, true));
  if (r.estado === "ya") return res.json({ ...t, correo: true });
  if (r.estado === "choque" || r.estado === "inexistente")
    return res.status(409).json({ mensaje: "Tu pago llegó cuando el horario ya no estaba disponible. Te devolvemos la seña a Mercado Pago. Elegí otro horario." });
  res.status(402).json({ mensaje: "Mercado Pago todavía no confirmó el pago. Si ya pagaste, en unos minutos te llega el correo con tu turno." });
});

// ---------- mis turnos: el cliente ve sus reservas y puede cancelarlas ----------
// `ahora` va para que la página calcule cuánto falta con la hora del servidor, aunque el reloj del celular esté mal
app.get("/api/mis-turnos", authU, async (req, res) =>
  res.json({ ahora: Date.now(), anticipo: ANTICIPO_MIN, turnos: await db.turnosDeUsuario(req.usuario) }));

const AVISO_CANCELADO = {
  devuelta: (t) => `Turno cancelado. Te devolvimos la seña de ${pesos(t.sena)} a Mercado Pago (según tu medio de pago, puede tardar unos días en verse).`,
  retenida: (t) => `Turno cancelado. Como faltaba menos de una hora, la seña de ${pesos(t.sena)} no se devuelve.`,
  manual: (t) => `Turno cancelado. El local te va a devolver la seña de ${pesos(t.sena)}.`,
  "sin-sena": () => "Turno cancelado. El horario quedó libre.",
};

app.post("/api/mis-turnos/:id/cancelar", authU, async (req, res) => {
  const t = await db.turnoDeUsuario(req.params.id, req.usuario);
  if (!t) return res.status(404).json({ mensaje: "No encontramos ese turno entre los tuyos." });
  if (t.estado === "cancelado") return res.status(409).json({ mensaje: "Ese turno ya estaba cancelado." });
  if (t.estado === "pendiente" && !(t.vence > new Date()))
    return res.status(409).json({ mensaje: "Ese turno ya no está reservado: la seña no se pagó a tiempo y el horario se liberó." });
  if (t.faltan <= 0) return res.status(400).json({ mensaje: "Ese turno ya empezó o ya pasó, así que no se puede cancelar." });

  const pagada = t.estado === "confirmado" && t.sena > 0 && !!t.pagoId;
  const conTiempo = t.faltan >= ANTICIPO_MIN;

  // Con menos de una hora la seña no se devuelve: se cancela solo si el cliente confirmó que lo sabe
  if (pagada && !conTiempo && req.body?.aceptoSinReembolso !== true)
    return res.status(409).json({
      codigo: "sin-reembolso",
      mensaje: `Falta menos de una hora para tu turno: si lo cancelás ahora, la seña de ${pesos(t.sena)} no se devuelve.`,
    });

  let reembolso = "sin-sena";
  if (pagada && !conTiempo) reembolso = "retenida";
  if (pagada && conTiempo) {
    if (!mp.mpConfigurado()) reembolso = "manual";
    else {
      // Primero se devuelve la plata y después se cancela: si Mercado Pago falla, el turno sigue reservado y se puede reintentar
      try {
        await mp.reembolsar(t.pagoId);
        reembolso = "devuelta";
      } catch (e) {
        console.error(`No se pudo devolver la seña del turno ${t.id} (pago ${t.pagoId}):`, e.message);
        return res.status(502).json({ mensaje: "No pudimos devolverte la seña en este momento, así que tu turno sigue reservado. Probá de nuevo en unos minutos." });
      }
    }
  }

  if (!(await db.cancelarTurno(t.id, t.estado, reembolso)))
    return res.status(409).json({ mensaje: "Tu turno cambió mientras lo cancelabas. Actualizá la página y probá de nuevo." });

  const { pagoId, faltan, ...turno } = (await db.turnoDeUsuario(t.id, req.usuario)) || { id: t.id };
  res.json({ turno, mensaje: AVISO_CANCELADO[reembolso](t) });
});

// ---------- admin: cortes ----------
const limpiar = (b) => ({
  nombre: String(b.nombre || "").trim(),
  desc: String(b.desc || "").trim(),
  precio: Math.max(0, Math.round(Number(b.precio)) || 0),
  duracion: Math.min(240, Math.max(30, Math.round((Number(b.duracion) || 30) / 30) * 30)),
});

app.post("/api/admin/servicios", auth, async (req, res) => {
  const s = limpiar(req.body);
  if (!s.nombre) return res.status(400).json({ mensaje: "Poné un nombre para el corte." });
  res.status(201).json(await db.crearServicio(s));
});

app.put("/api/admin/servicios/:id", auth, async (req, res) => {
  const s = limpiar(req.body);
  if (!s.nombre) return res.status(400).json({ mensaje: "El corte necesita un nombre." });
  const fila = await db.actualizarServicio(req.params.id, s);
  if (!fila) return res.status(404).json({ mensaje: "Ese corte ya no existe." });
  res.json(fila);
});

app.delete("/api/admin/servicios/:id", auth, async (req, res) => {
  await db.borrarServicio(req.params.id);
  res.json({ ok: true });
});

// ---------- admin: datos del local ----------
app.put("/api/admin/config", auth, async (req, res) => {
  const body = req.body;
  const cfg = await db.getConfig();
  for (const k of ["nombre", "slogan", "whatsapp", "instagram", "direccion"])
    if (typeof body[k] === "string") cfg[k] = body[k].trim();
  cfg.whatsapp = cfg.whatsapp.replace(/\D/g, "");
  if (["claro", "oscuro"].includes(body.tema)) cfg.tema = body.tema;
  if (body.sena !== undefined) cfg.sena = Math.min(100, Math.max(0, Math.round(Number(body.sena)) || 0));

  if (Array.isArray(body.peluqueros))
    cfg.peluqueros = cfg.peluqueros.map((p) => {
      const nuevo = body.peluqueros.find((x) => x.id === p.id);
      return nuevo ? { id: p.id, nombre: String(nuevo.nombre || "").trim() || p.nombre, apellido: String(nuevo.apellido || "").trim() } : p;
    });

  if (Array.isArray(body.bloques)) {
    const validos = body.bloques.filter((x) => /^\d{2}:\d{2}$/.test(x.desde) && /^\d{2}:\d{2}$/.test(x.hasta) && aMin(x.desde) < aMin(x.hasta));
    if (validos.length) cfg.bloques = validos.sort((p, q) => aMin(p.desde) - aMin(q.desde));
  }

  await db.guardarConfig(cfg);
  res.json(cfg);
});

// ---------- admin: probar el correo ----------
app.post("/api/admin/correo-prueba", auth, async (_req, res) => {
  if (!correoConfigurado()) return res.json({ ok: false, detalle: "Faltan MAIL_USER y MAIL_PASS en el .env (o en las variables de Vercel). Después de cargarlos, reiniciá el servidor." });
  const cfg = await db.getConfig();
  const r = await enviarCorreo({
    para: diagnostico().usuario,
    asunto: `Prueba de correo de ${cfg.nombre}`,
    texto: "Si recibiste este mensaje, el correo de confirmación de turnos está funcionando.",
    html: "<p>Si recibiste este mensaje, el correo de confirmación de turnos está <strong>funcionando</strong>.</p>",
  });
  res.json({ ...r, para: diagnostico().usuario, ...diagnostico() });
});

// ---------- admin: turnos ----------
app.get("/api/admin/turnos", auth, async (_req, res) => res.json(await db.listarTurnos()));
app.delete("/api/admin/turnos/:id", auth, async (req, res) => {
  await db.borrarTurno(req.params.id);
  res.json({ ok: true });
});

// Cualquier error inesperado (por ejemplo, la base sin conexión) vuelve como JSON
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ mensaje: "Error del servidor. Probá de nuevo en un momento." });
});

export default app;
