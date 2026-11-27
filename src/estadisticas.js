// Racha de días seguidos leyendo y contador de páginas leídas.
// Se guarda en el almacenamiento local: { dias: { 'AAAA-MM-DD': páginas }, total }.
// Un día cuenta para la racha si ese día pasaste al menos MINIMO_PAGINAS páginas nuevas.

const CLAVE = 'lector-pdf:estadisticas';
export const MINIMO_PAGINAS = 1;

function leer() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE));
    if (datos && typeof datos === 'object') return { dias: datos.dias || {}, total: datos.total || 0 };
  } catch {}
  return { dias: {}, total: 0 };
}

/** Fecha local del iPad en formato AAAA-MM-DD (no la hora UTC). */
export function claveDia(fecha = new Date()) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function sumarPaginas(cuantas) {
  if (!(cuantas > 0)) return;
  const datos = leer();
  const hoy = claveDia();
  datos.dias[hoy] = (datos.dias[hoy] || 0) + cuantas;
  datos.total += cuantas;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {}
}

/** @returns {{ racha: number, hoy: number, total: number, rachaHoy: boolean }} */
export function resumen() {
  const { dias, total } = leer();
  const cuenta = (fecha) => (dias[claveDia(fecha)] || 0) >= MINIMO_PAGINAS;
  const dia = new Date();
  const rachaHoy = cuenta(dia);
  // Si hoy todavía no has leído, la racha sigue viva desde ayer.
  if (!rachaHoy) dia.setDate(dia.getDate() - 1);
  let racha = 0;
  while (cuenta(dia)) {
    racha++;
    dia.setDate(dia.getDate() - 1);
  }
  return { racha, hoy: dias[claveDia()] || 0, total, rachaHoy };
}
