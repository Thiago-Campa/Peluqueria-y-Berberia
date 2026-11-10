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
