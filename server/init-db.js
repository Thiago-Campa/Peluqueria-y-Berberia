// Crea las tablas y carga los datos iniciales a mano: npm run db:init
// (No es obligatorio: el servidor también lo hace solo en el primer pedido.)
import { pool } from "./store.js";
import { crearEsquema } from "./esquema.js";

try {
  await crearEsquema(pool);
  console.log("Base lista: tablas creadas y datos iniciales cargados.");
} catch (e) {
  console.error("No se pudo conectar a la base:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
