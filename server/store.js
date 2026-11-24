import dotenv from "dotenv";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { crearEsquema } from "./esquema.js";

dotenv.config({ quiet: true });

// Neon: DATABASE_URL (conexión con pooling) o, si no está, la directa.
// Si no hay ninguna, pg usa las variables PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
const cadena = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;

export const pool = new pg.Pool({
  connectionString: cadena,
  ssl: cadena ? undefined : true,
  max: 5,
  connectionTimeoutMillis: 15000,
});
pool.on("error", () => {}); // Neon cierra conexiones inactivas: no es un error grave

// Las tablas se crean solas en el primer pedido (no hace falta correr nada a mano)
let listo;
const preparar = () => (listo ??= crearEsquema(pool).catch((e) => { listo = undefined; throw e; }));
const q = async (texto, params) => { await preparar(); return (await pool.query(texto, params)).rows; };

const SERVICIO = `id, nombre, descripcion AS "desc", precio, duracion`;

// ---------- datos del local ----------
export const getConfig = async () => {
  const [c] = await q(`SELECT nombre, slogan, whatsapp, instagram, direccion, tema, intervalo, bloques, sena FROM config WHERE id = 1`);
  const peluqueros = await q(`SELECT id, nombre, apellido FROM peluqueros ORDER BY orden`);
  return { ...c, peluqueros };
};

export const guardarConfig = async (c) => {
  await q(
    `UPDATE config SET nombre=$1, slogan=$2, whatsapp=$3, instagram=$4, direccion=$5, tema=$6, bloques=$7::jsonb, sena=$8 WHERE id = 1`,
    [c.nombre, c.slogan, c.whatsapp, c.instagram, c.direccion, c.tema, JSON.stringify(c.bloques), c.sena]
  );
  for (const p of c.peluqueros)
    await q(`UPDATE peluqueros SET nombre=$2, apellido=$3 WHERE id=$1`, [p.id, p.nombre, p.apellido]);
};

// ---------- cortes ----------
export const getServicios = () => q(`SELECT ${SERVICIO} FROM servicios ORDER BY orden`);

export const crearServicio = async (s) =>
  (await q(
    `INSERT INTO servicios (id, nombre, descripcion, precio, duracion) VALUES ($1,$2,$3,$4,$5) RETURNING ${SERVICIO}`,
    [randomUUID().slice(0, 8), s.nombre, s.desc, s.precio, s.duracion]
  ))[0];

export const actualizarServicio = async (id, s) =>
  (await q(
    `UPDATE servicios SET nombre=$2, descripcion=$3, precio=$4, duracion=$5 WHERE id=$1 RETURNING ${SERVICIO}`,
    [id, s.nombre, s.desc, s.precio, s.duracion]
  ))[0];

export const borrarServicio = (id) => q(`DELETE FROM servicios WHERE id = $1`, [id]);

// ---------- usuarios (clientes) ----------
const USUARIO = `id, nombre, email, telefono`;
export const crearUsuario = async ({ nombre, email, telefono, clave }) =>
  (await q(
    `INSERT INTO usuarios (nombre, email, telefono, clave) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING ${USUARIO}`,
    [nombre, email, telefono, clave]
  ))[0] || null;
export const usuarioPorEmail = async (email) =>
  (await q(`SELECT ${USUARIO}, clave FROM usuarios WHERE lower(email) = lower($1)`, [email]))[0];
export const usuarioPorId = async (id) => (await q(`SELECT ${USUARIO} FROM usuarios WHERE id = $1`, [id]))[0];
export const cambiarClave = (email, clave) => q(`UPDATE usuarios SET clave = $2 WHERE lower(email) = lower($1)`, [email, clave]);

// ---------- códigos por correo (crear cuenta / recuperar contraseña) ----------
export const guardarCodigo = (email, tipo, codigo, datos, minutos = 15) =>
  q(
    `INSERT INTO codigos (email, tipo, codigo, datos, expira, intentos)
     VALUES ($1, $2, $3, $4::jsonb, now() + make_interval(mins => $5), 0)
     ON CONFLICT (email, tipo) DO UPDATE SET codigo = $3, datos = $4::jsonb, expira = now() + make_interval(mins => $5), intentos = 0`,
    [email, tipo, codigo, datos ? JSON.stringify(datos) : null, minutos]
  );
export const borrarCodigo = (email, tipo) => q(`DELETE FROM codigos WHERE email = $1 AND tipo = $2`, [email, tipo]);

// { ok: true, datos } si el código es correcto. Se puede probar 5 veces como máximo.
export async function verificarCodigo(email, tipo, codigo) {
  const [c] = await q(`SELECT codigo, datos, expira < now() AS vencido, intentos FROM codigos WHERE email = $1 AND tipo = $2`, [email, tipo]);
  if (!c || c.vencido) return { ok: false, motivo: "El código venció. Pedí uno nuevo." };
  if (c.intentos >= 5) { await borrarCodigo(email, tipo); return { ok: false, motivo: "Probaste demasiadas veces. Pedí un código nuevo." }; }
  if (c.codigo !== codigo) {
    await q(`UPDATE codigos SET intentos = intentos + 1 WHERE email = $1 AND tipo = $2`, [email, tipo]);
    return { ok: false, motivo: "Código incorrecto." };
  }
  await borrarCodigo(email, tipo);
  return { ok: true, datos: c.datos };
}

// ---------- límite de intentos (en la base, así vale aunque Vercel use varias instancias) ----------
// Devuelve true si todavía puede intentar, false si ya pasó el máximo en la ventana de tiempo.
export async function limitar(clave, max, minutos) {
  const [f] = await q(
    `INSERT INTO limites (clave, n, inicio) VALUES ($1, 1, now())
     ON CONFLICT (clave) DO UPDATE SET
       n = CASE WHEN limites.inicio < now() - make_interval(mins => $2) THEN 1 ELSE limites.n + 1 END,
       inicio = CASE WHEN limites.inicio < now() - make_interval(mins => $2) THEN now() ELSE limites.inicio END
     RETURNING n`,
    [clave, minutos]
  );
  return f.n <= max;
}
export const reiniciarLimite = (clave) => q(`DELETE FROM limites WHERE clave = $1`, [clave]);

// ---------- turnos ----------
// Un turno "pendiente" (esperando el pago de la seña) bloquea el horario hasta que vence.
const CAMPOS_TURNO = `t.id, t.nombre, t.telefono, t.email, t.servicio, t.precio, t.duracion, t.estado, t.sena, t.pago_id AS "pagoId",
  t.peluquero_id AS "peluqueroId", t.fecha, t.hora, trim(concat(p.nombre, ' ', p.apellido)) AS peluquero`;

export const ocupados = (fecha) =>
  q(`SELECT peluquero_id AS "peluqueroId", hora, duracion FROM turnos WHERE fecha = $1 AND (estado = 'confirmado' OR vence > now())`, [fecha]);

export const listarTurnos = () =>
  q(`SELECT ${CAMPOS_TURNO} FROM turnos t JOIN peluqueros p ON p.id = t.peluquero_id
     WHERE t.estado = 'confirmado' OR t.vence > now()
     ORDER BY t.fecha, t.hora`);

export const turnoCompleto = async (id) =>
  (await q(`SELECT ${CAMPOS_TURNO} FROM turnos t JOIN peluqueros p ON p.id = t.peluquero_id WHERE t.id = $1`, [Number(id) || 0]))[0];

export const borrarTurno = (id) => q(`DELETE FROM turnos WHERE id = $1`, [Number(id) || 0]);

// Devuelve el turno creado, o null si ese horario ya estaba ocupado con ese peluquero.
// El candado dentro de la transacción evita que dos personas reserven a la vez.
// Con seña, el turno nace "pendiente" y vence si no se paga (campo `vence`).
export async function reservar({ nombre, telefono, email, usuarioId, servicio, peluqueroId, fecha, hora, inicio, estado = "confirmado", sena = 0, vence = null }) {
  await preparar();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${fecha}|${peluqueroId}`]);
    await c.query(`DELETE FROM turnos WHERE estado = 'pendiente' AND vence < now() - interval '1 day'`);
    const choque = await c.query(
      `SELECT 1 FROM turnos WHERE fecha = $1 AND peluquero_id = $2 AND (estado = 'confirmado' OR vence > now())
         AND inicio < $3::int + $4::int AND $3::int < inicio + duracion LIMIT 1`,
      [fecha, peluqueroId, inicio, servicio.duracion]
    );
    if (choque.rowCount) { await c.query("ROLLBACK"); return null; }
    const { rows } = await c.query(
      `INSERT INTO turnos (nombre, telefono, email, usuario_id, servicio, precio, duracion, peluquero_id, fecha, hora, inicio, estado, sena, vence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz)
       RETURNING id, nombre, telefono, email, servicio, precio, duracion, estado, sena, peluquero_id AS "peluqueroId", fecha, hora`,
      [nombre, telefono, email, usuarioId, servicio.nombre, servicio.precio, servicio.duracion, peluqueroId, fecha, hora, inicio, estado, sena, vence]
    );
    await c.query("COMMIT");
    return rows[0];
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Pasa un turno de "pendiente" a "confirmado" cuando Mercado Pago aprobó el pago.
// Es seguro llamarlo varias veces (webhook + regreso del cliente): solo confirma una vez.
// Devuelve { estado }: "confirmado" | "ya" | "inexistente" | "choque" | "monto"
export async function confirmarPago(id, pagoId, monto) {
  await preparar();
  const [previo] = (await pool.query(`SELECT fecha, peluquero_id FROM turnos WHERE id = $1`, [id])).rows;
  if (!previo) return { estado: "inexistente" };
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${previo.fecha}|${previo.peluquero_id}`]);
    const { rows: [t] } = await c.query(`SELECT * FROM turnos WHERE id = $1 FOR UPDATE`, [id]);
    if (!t) { await c.query("ROLLBACK"); return { estado: "inexistente" }; }
    if (t.estado === "confirmado") { await c.query("COMMIT"); return { estado: "ya" }; }
    if (monto < t.sena) { await c.query("ROLLBACK"); return { estado: "monto" }; }
    if (t.vence && t.vence < new Date()) {
      // Pagó tarde: solo se confirma si nadie más tomó el horario mientras tanto
      const choque = await c.query(
        `SELECT 1 FROM turnos WHERE fecha = $1 AND peluquero_id = $2 AND id <> $3 AND (estado = 'confirmado' OR vence > now())
           AND inicio < $4::int + $5::int AND $4::int < inicio + duracion LIMIT 1`,
        [t.fecha, t.peluquero_id, id, t.inicio, t.duracion]
      );
      if (choque.rowCount) { await c.query("DELETE FROM turnos WHERE id = $1", [id]); await c.query("COMMIT"); return { estado: "choque" }; }
    }
    await c.query(`UPDATE turnos SET estado = 'confirmado', pago_id = $2, vence = NULL WHERE id = $1`, [id, pagoId]);
    await c.query("COMMIT");
    return { estado: "confirmado" };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
