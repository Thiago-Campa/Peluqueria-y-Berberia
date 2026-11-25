import { servicios } from "./servicios.js";

// Datos iniciales del local (se cargan una sola vez, cuando la base está vacía)
export const INICIAL = {
  nombre: "Tu Peluquería",
  slogan: "Corte prolijo, turno sin esperas.",
  whatsapp: "5491100000000",
  instagram: "https://www.instagram.com/tu_peluqueria/",
  direccion: "Obelisco, Buenos Aires",
  tema: "claro",
  intervalo: 30,
  bloques: [{ desde: "09:00", hasta: "12:00" }, { desde: "17:00", hasta: "20:00" }],
  peluqueros: [
    { id: "p1", nombre: "Peluquero 1", apellido: "" },
    { id: "p2", nombre: "Peluquero 2", apellido: "" },
  ],
};

const TABLAS = `
CREATE TABLE IF NOT EXISTS config (
  id int PRIMARY KEY CHECK (id = 1),
  nombre text NOT NULL, slogan text NOT NULL, whatsapp text NOT NULL,
  instagram text NOT NULL, direccion text NOT NULL,
  tema text NOT NULL DEFAULT 'claro', intervalo int NOT NULL DEFAULT 30,
  bloques jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS peluqueros (
  id text PRIMARY KEY, nombre text NOT NULL, apellido text NOT NULL DEFAULT '', orden int NOT NULL
);
CREATE TABLE IF NOT EXISTS servicios (
  id text PRIMARY KEY, nombre text NOT NULL, descripcion text NOT NULL DEFAULT '',
  precio int NOT NULL DEFAULT 0, duracion int NOT NULL DEFAULT 30,
  orden serial
);
CREATE TABLE IF NOT EXISTS usuarios (
  id serial PRIMARY KEY, nombre text NOT NULL, email text NOT NULL, telefono text NOT NULL,
  clave text NOT NULL, creado timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_idx ON usuarios (lower(email));
CREATE TABLE IF NOT EXISTS turnos (
  id serial PRIMARY KEY, nombre text NOT NULL, telefono text NOT NULL,
  servicio text NOT NULL, precio int NOT NULL, duracion int NOT NULL,
  peluquero_id text NOT NULL REFERENCES peluqueros(id),
  fecha text NOT NULL, hora text NOT NULL, inicio int NOT NULL,
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS turnos_fecha_idx ON turnos (fecha, peluquero_id);
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS usuario_id int REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'confirmado';
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS sena int NOT NULL DEFAULT 0;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS pago_id text;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS vence timestamptz;
ALTER TABLE config ADD COLUMN IF NOT EXISTS sena int NOT NULL DEFAULT 50;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS cancelado timestamptz;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS reembolso text;
CREATE INDEX IF NOT EXISTS turnos_usuario_idx ON turnos (usuario_id);
CREATE TABLE IF NOT EXISTS codigos (
  email text NOT NULL, tipo text NOT NULL, codigo text NOT NULL, datos jsonb,
  expira timestamptz NOT NULL, intentos int NOT NULL DEFAULT 0, PRIMARY KEY (email, tipo)
);
CREATE TABLE IF NOT EXISTS limites (
  clave text PRIMARY KEY, n int NOT NULL, inicio timestamptz NOT NULL DEFAULT now()
);
`;

// Crea las tablas si no existen y carga los datos iniciales solo la primera vez.
// Va todo dentro de una transacción con un candado, así dos arranques a la vez no se pisan.
export async function crearEsquema(pool) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(424242)");
    await c.query(TABLAS);

    const i = INICIAL;
    const nuevo = await c.query(
      `INSERT INTO config (id, nombre, slogan, whatsapp, instagram, direccion, tema, intervalo, bloques)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8::jsonb) ON CONFLICT (id) DO NOTHING`,
      [i.nombre, i.slogan, i.whatsapp, i.instagram, i.direccion, i.tema, i.intervalo, JSON.stringify(i.bloques)]
    );

    if (nuevo.rowCount) {
      for (const [orden, p] of i.peluqueros.entries())
        await c.query(`INSERT INTO peluqueros (id, nombre, apellido, orden) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`, [p.id, p.nombre, p.apellido, orden]);
      for (const s of servicios)
        await c.query(`INSERT INTO servicios (id, nombre, descripcion, precio, duracion) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, [s.id, s.nombre, s.desc, s.precio, s.duracion]);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
