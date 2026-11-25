import { useEffect, useState } from "react";

// Ventana para confirmar antes de borrar, modificar, agregar o cancelar algo
export default function Confirmar({ titulo, texto, boton = "Confirmar", cancelar = "Cancelar", peligro, onResp }) {
  useEffect(() => {
    const tecla = (e) => e.key === "Escape" && onResp(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  return (
    <div className="modal" role="presentation" onClick={() => onResp(false)}>
      <div className="modal__caja" role="alertdialog" aria-modal="true" aria-labelledby="conf-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="conf-t">{titulo}</h2>
        {texto && <p>{texto}</p>}
        <div className="modal__acc">
          <button className="btn btn--sm btn--ghost" autoFocus onClick={() => onResp(false)}>{cancelar}</button>
          <button className={`btn btn--sm${peligro ? " btn--rojo" : ""}`} onClick={() => onResp(true)}>{boton}</button>
        </div>
      </div>
    </div>
  );
}

// pedir({ titulo, texto, ... }) abre la ventana y devuelve una promesa con true o false.
// Hay que dibujar {ventana} en algún lado del componente.
export function useConfirmar() {
  const [conf, setConf] = useState(null);
  const pedir = (datos) => new Promise((res) => setConf({ ...datos, res }));
  const responder = (v) => { conf.res(v); setConf(null); };
  return [pedir, conf && <Confirmar {...conf} onResp={responder} />];
}
