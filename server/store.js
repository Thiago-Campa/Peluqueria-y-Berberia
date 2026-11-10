// Guarda datos en Upstash Redis (Vercel) y, si no está configurado, en un archivo local (data/db.json).
import { Redis } from "@upstash/redis";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const enNube = Boolean(redis);

// ----- modo local: un solo archivo -----
const ARCHIVO = new URL("../data/db.json", import.meta.url);
const leerTodo = async () => { try { return JSON.parse(await readFile(ARCHIVO, "utf8")); } catch { return {}; } };

export const get = async (clave, base) => {
  const v = redis ? await redis.get(clave) : (await leerTodo())[clave];
  return v ?? base;
};

export const set = async (clave, valor) => {
  if (redis) return redis.set(clave, valor);
  const todo = await leerTodo();
  todo[clave] = valor;
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(ARCHIVO, JSON.stringify(todo));
};

// ----- un pedido a la vez, para que dos personas no reserven el mismo horario -----
let cola = Promise.resolve();
export const exclusivo = async (fn) => {
  if (!redis) { const r = cola.then(fn); cola = r.catch(() => {}); return r; }
  const yo = randomUUID();
  let tomado = false;
  for (let i = 0; i < 40 && !tomado; i++) {
    tomado = (await redis.set("lock:turnos", yo, { nx: true, ex: 10 })) === "OK";
    if (!tomado) await new Promise((ok) => setTimeout(ok, 150));
  }
  if (!tomado) throw new Error("El sistema está ocupado, probá de nuevo.");
  try { return await fn(); }
  finally { if ((await redis.get("lock:turnos")) === yo) await redis.del("lock:turnos"); }
};
