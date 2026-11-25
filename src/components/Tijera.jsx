// Tijerita animada para las esperas cortas (reservar, cancelar, cargar tus turnos).
// Con className="tijera--gira" además da vueltas.
export default function Tijera({ className = "" }) {
  return (
    <svg className={`tijera ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <g className="hoja hoja--a">
        <path className="tijera__filo" d="M50 56 L50 8 Q49.6 3.5 46.8 6.8 Q42.6 28 43.6 50 Z" />
        <path className="tijera__mango" d="M50 50 L58.5 72" />
        <circle className="tijera__mango" cx="61.5" cy="80" r="9" />
      </g>
      <g className="hoja hoja--b">
        <path className="tijera__filo" d="M50 56 L50 8 Q50.4 3.5 53.2 6.8 Q57.4 28 56.4 50 Z" />
        <path className="tijera__mango" d="M50 50 L41.5 72" />
        <circle className="tijera__mango" cx="38.5" cy="80" r="9" />
      </g>
      <circle className="tijera__eje" cx="50" cy="50" r="4.5" />
    </svg>
  );
}
