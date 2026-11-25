export const peso = (n) =>
  Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const fechaCorta = (iso) => iso.split("-").reverse().join("/");
export const nombreCompleto = (p) => `${p.nombre} ${p.apellido}`.trim();

export const aMin = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
export const aHora = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Todos los turnos de un bloque horario, ej. 09:00, 09:30 ... 11:30
export const generarSlots = (bloque, paso = 30) => {
  const fin = aMin(bloque.hasta);
  const slots = [];
  for (let m = aMin(bloque.desde); m < fin; m += paso) slots.push({ hora: aHora(m), min: m, fin });
  return slots;
};

// "Faltan 3 días", "Faltan 5 h 20 min", "Faltan 12 min"
export const cuantoFalta = (ms) => {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min >= 2 * 1440) return `Faltan ${Math.floor(min / 1440)} días`;
  if (min >= 1440) { const h = Math.floor((min % 1440) / 60); return h ? `Falta 1 día y ${h} h` : "Falta 1 día"; }
  if (min >= 60) return `Faltan ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return min === 1 ? "Falta 1 minuto" : `Faltan ${min} min`;
};

// 60 → "una hora", 120 → "2 horas", 45 → "45 minutos"
export const anticipoTexto = (min) => (min === 60 ? "una hora" : min % 60 === 0 ? `${min / 60} horas` : `${min} minutos`);

export const horarioTexto = (bloques) => bloques.map((b) => `de ${b.desde} a ${b.hasta}`).join(" y ");

// Dice si la peluquería está abierta en este momento
export const estadoLocal = (bloques, cerrados) => {
  const d = new Date();
  if (cerrados.includes(d.getDay())) return { abierto: false, texto: "Hoy está cerrado" };
  const ahora = d.getHours() * 60 + d.getMinutes();
  const rangos = bloques.map((b) => [aMin(b.desde), aMin(b.hasta)]);
  const actual = rangos.find(([a, b]) => ahora >= a && ahora < b);
  if (actual) return { abierto: true, texto: `Abierto ahora, hasta las ${aHora(actual[1])}` };
  const proximo = rangos.find(([a]) => a > ahora);
  return { abierto: false, texto: proximo ? `Cerrado ahora, abrimos a las ${aHora(proximo[0])}` : "Cerrado por hoy" };
};
