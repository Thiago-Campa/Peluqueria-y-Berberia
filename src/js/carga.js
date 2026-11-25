// Saca la pantalla de carga (está en index.html) con la animación de la tijera cortando la pantalla.
// Se queda al menos MINIMO ms para que la animación se llegue a ver aunque los datos lleguen al toque.
const MINIMO = 1100;
const SALIDA = 1200; // lo que dura la animación de salida (ver .carga--fuera en index.html)

export function quitarCarga() {
  const el = document.getElementById("carga");
  if (!el || el.dataset.saliendo) return;
  el.dataset.saliendo = "1";

  // Se espera a las tipografías (máximo 2,5 s) para que la página no "salte" al aparecer
  const fuentes = Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]);
  fuentes.then(() => {
    setTimeout(() => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return el.remove();
      // La misma tijera de la ruedita es la que cruza la pantalla
      const tijera = el.querySelector(".carga__tijera");
      el.querySelector(".carga__cortadora")?.appendChild(tijera.cloneNode(true));
      el.classList.add("carga--fuera");
      setTimeout(() => el.remove(), SALIDA);
    }, Math.max(0, MINIMO - performance.now()));
  });
}
