import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Las contraseñas de los clientes se guardan con hash (scrypt + sal), nunca en texto plano
export const hashClave = (clave) => {
  const sal = randomBytes(16).toString("hex");
  return `${sal}:${scryptSync(clave, sal, 64).toString("hex")}`;
};

export const claveOk = (clave, guardado = "") => {
  const [sal, hash] = guardado.split(":");
  if (!sal || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(clave, sal, 64);
  return a.length === b.length && timingSafeEqual(a, b);
};
