// Precios en pesos argentinos (estimados) y duración en minutos (múltiplos de 30).
// Después podés editarlos desde el panel admin.
export const servicios = [
  { id: "degrade", nombre: "Degradé", precio: 12000, duracion: 30, desc: "Fade a máquina con terminación prolija" },
  { id: "degrade-tijera", nombre: "Degradé + tijera", precio: 14000, duracion: 60, desc: "Laterales degradé y parte de arriba a tijera" },
  { id: "tijera", nombre: "Tijera", precio: 12000, duracion: 60, desc: "Corte completo a tijera" },
  { id: "barba", nombre: "Barba", precio: 6000, duracion: 30, desc: "Perfilado y arreglo de barba" },
  { id: "corte-barba", nombre: "Corte + barba", precio: 17000, duracion: 60, desc: "Degradé o tijera, más barba" },
  { id: "completo", nombre: "Completo", precio: 20000, duracion: 90, desc: "Corte, barba, cejas y lavado" },
  { id: "rapado", nombre: "Rapado completo", precio: 8000, duracion: 30, desc: "Rapado parejo a máquina" },
  { id: "tintura", nombre: "Tintura", precio: 30000, duracion: 120, desc: "Color o decoloración" },
  { id: "cejas", nombre: "Perfilado de cejas", precio: 3000, duracion: 30, desc: "Prolijo y natural" },
];
