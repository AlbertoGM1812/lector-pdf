// Extrae el texto de un PDF y lo convierte en "bloques" (párrafos y títulos)
// que después se maquetan con el estilo que elija el usuario.
//
// Un PDF no guarda párrafos: guarda trozos de texto con una posición (x, y)
// en la página. Aquí se juntan esos trozos en líneas, y las líneas en párrafos,
// mirando el espacio entre líneas, la sangría y dónde termina cada línea.

/**
 * @typedef {{ tipo: 'p' | 'h', partes: Array<string | { marca: number }> }} Bloque
 *  - tipo 'p' = párrafo, 'h' = título.
 *  - partes: texto y "marcas" que indican dónde empieza cada página del PDF.
 */

/**
 * Recorre todas las páginas del PDF y devuelve la lista de bloques.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {(hechas: number, total: number) => void} [alAvanzar]
 * @returns {Promise<{ bloques: Bloque[], hayTexto: boolean }>}
 */
export async function extraerBloques(pdf, alAvanzar) {
  const paginas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const contenido = await pagina.getTextContent();
    paginas.push(agruparLineas(contenido.items));
    pagina.cleanup();
    alAvanzar?.(n, pdf.numPages);
  }
  quitarEncabezadosYPies(paginas);
  const hayTexto = paginas.some((lineas) => lineas.length > 0);
  return { bloques: construirBloques(paginas), hayTexto };
}

/** Tamaño de letra aproximado de un trozo de texto. */
function tamano(item) {
  const [, , c, d] = item.transform;
  return Math.hypot(c, d) || item.height || 10;
}

/**
 * Junta los trozos de texto de una página en líneas.
 * @returns {{ texto: string, x0: number, x1: number, y: number, tam: number }[]}
 */
function agruparLineas(items) {
  const lineas = [];
  let actual = null;

  const cerrar = () => {
    if (actual && actual.texto.trim()) {
      actual.texto = actual.texto.replace(/\s+/g, ' ').trim();
      lineas.push(actual);
    }
    actual = null;
  };

  for (const item of items) {
    if (typeof item.str !== 'string') continue; // contenido marcado, no es texto
    const texto = item.str;
    const x = item.transform[4];
    const y = item.transform[5];
    const tam = tamano(item);
    const ancho = item.width || 0;

    if (texto.length > 0) {
      if (actual) {
        const dy = Math.abs(y - actual.y);
        const mismaLinea =
          (dy <= actual.tam * 0.5 && x >= actual.x1 - actual.tam) ||
          // números pequeños elevados (notas al pie) dentro de la misma línea
          (tam < actual.tam * 0.85 && dy < actual.tam && x >= actual.x1 - actual.tam * 0.5);
        if (!mismaLinea) cerrar();
      }
      if (!actual) {
        actual = { texto: '', x0: x, x1: x, y, tam };
      }
      const hueco = x - actual.x1;
      const necesitaEspacio =
        actual.texto.length > 0 &&
        hueco > actual.tam * 0.15 &&
        !/\s$/.test(actual.texto) &&
        !/^\s/.test(texto);
      actual.texto += (necesitaEspacio ? ' ' : '') + texto;
      actual.x1 = Math.max(actual.x1, x + ancho);
      if (tam > actual.tam && texto.trim()) {
        actual.tam = tam;
        actual.y = y;
      }
    }
    if (item.hasEOL) cerrar();
  }
  cerrar();
  return lineas;
}

/** Normaliza una línea para comparar encabezados que se repiten (sin números). */
function normalizar(texto) {
  return texto.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

const SOLO_NUMERO = /^[\s#\-–—|.·•]*$|^[\s\-–—]*(página|pág\.?|page|p\.)?\s*#(\s*(de|of|\/)\s*#)?[\s\-–—]*$|^[\s\-–—]*[ivxlcdm]+[\s\-–—]*$/i;

/**
 * Quita números de página y encabezados/pies que se repiten en muchas páginas
 * (por ejemplo el título del libro arriba de cada página).
 */
function quitarEncabezadosYPies(paginas) {
  // Cuenta cuántas veces aparece cada línea en los bordes (arriba / abajo).
  const conteo = new Map();
  for (const lineas of paginas) {
    const bordes = new Set();
    for (const linea of extremos(lineas)) bordes.add(normalizar(linea.texto));
    for (const clave of bordes) conteo.set(clave, (conteo.get(clave) || 0) + 1);
  }
  const minimo = Math.max(3, paginas.length * 0.25);

  for (const lineas of paginas) {
    // Dos vueltas: tras quitar el número de página puede quedar el encabezado.
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      for (const linea of extremos(lineas)) {
        const clave = normalizar(linea.texto);
        const esNumero = SOLO_NUMERO.test(clave);
        const seRepite = (conteo.get(clave) || 0) >= minimo && clave.length < 120;
        if (esNumero || seRepite) {
          const i = lineas.indexOf(linea);
          if (i >= 0) lineas.splice(i, 1);
        }
      }
    }
  }
}

/**
 * Devuelve las líneas más altas y las más bajas de la página
 * (puede haber varias a la misma altura, como fecha a la izquierda y título al centro).
 */
function extremos(lineas) {
  if (lineas.length === 0) return [];
  let maxY = -Infinity;
  let minY = Infinity;
  for (const l of lineas) {
    maxY = Math.max(maxY, l.y);
    minY = Math.min(minY, l.y);
  }
  return lineas.filter((l) => l.y >= maxY - l.tam * 0.5 || l.y <= minY + l.tam * 0.5);
}

/** Valor que más se repite (moda) de una lista de números redondeados. */
function moda(valores, pesos) {
  const cuenta = new Map();
  valores.forEach((v, i) => {
    const r = Math.round(v * 2) / 2;
    cuenta.set(r, (cuenta.get(r) || 0) + (pesos ? pesos[i] : 1));
  });
  let mejor = 0;
  let max = -1;
  for (const [v, c] of cuenta) {
    if (c > max) {
      max = c;
      mejor = v;
    }
  }
  return mejor;
}

function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor(orden.length * p))];
}

/** Convierte las líneas de todas las páginas en párrafos y títulos. */
function construirBloques(paginas) {
  const todas = paginas.flat();
  if (todas.length === 0) {
    return [{ tipo: 'p', partes: paginas.map((_, i) => ({ marca: i + 1 })) }];
  }
  // Tamaño de letra del texto normal: el que más caracteres tiene.
  const tamCuerpo = moda(
    todas.map((l) => l.tam),
    todas.map((l) => l.texto.length),
  );

  const bloques = [];
  let parrafo = null;
  let anterior = null; // línea anterior del mismo párrafo
  let marcasPendientes = [];

  const ponerMarcas = (bloque) => {
    for (const m of marcasPendientes) bloque.partes.push({ marca: m });
    marcasPendientes = [];
  };

  paginas.forEach((lineas, indice) => {
    marcasPendientes.push(indice + 1);
    if (lineas.length === 0) return;

    // Medidas de esta página: margen izquierdo, borde derecho e interlineado.
    const cuerpo = lineas.filter((l) => Math.abs(l.tam - tamCuerpo) <= tamCuerpo * 0.15);
    const base = cuerpo.length >= 3 ? cuerpo : lineas;
    const margenIzq = percentil(base.map((l) => l.x0), 0.1);
    const bordeDer = percentil(base.map((l) => l.x1), 0.9);
    const saltos = [];
    for (let i = 1; i < base.length; i++) {
      const dy = base[i - 1].y - base[i].y;
      if (dy > 0 && dy < tamCuerpo * 4) saltos.push(dy);
    }
    const interlineado = saltos.length ? percentil(saltos, 0.5) : tamCuerpo * 1.2;
    let primeraDePagina = true;

    for (const linea of lineas) {
      const esTitulo = linea.tam >= tamCuerpo * 1.25 && linea.texto.length < 200;

      if (esTitulo) {
        const ultimo = bloques[bloques.length - 1];
        const sigueTitulo =
          ultimo && ultimo.tipo === 'h' && parrafo === null && anterior && !primeraDePagina &&
          anterior.y - linea.y < linea.tam * 2;
        if (sigueTitulo) {
          ultimo.partes.push(' ' + linea.texto);
        } else {
          const titulo = { tipo: 'h', partes: [] };
          ponerMarcas(titulo);
          titulo.partes.push(linea.texto);
          bloques.push(titulo);
        }
        parrafo = null;
        anterior = linea;
        primeraDePagina = false;
        continue;
      }

      let nuevo = parrafo === null;
      if (!nuevo && anterior) {
        const sangria =
          linea.x0 > margenIzq + tamCuerpo * 0.8 && linea.x0 < margenIzq + tamCuerpo * 6;
        const anteriorCorta =
          anterior.x1 < bordeDer - tamCuerpo * 2.5 && /[.!?:;»"”’)]$/.test(anterior.texto);
        if (primeraDePagina) {
          // Cambio de página: el párrafo sigue salvo que haya sangría o
          // la última línea de la página anterior terminara el párrafo.
          nuevo = sangria || anteriorCorta;
        } else {
          const hueco = anterior.y - linea.y;
          nuevo = hueco > interlineado * 1.5 || sangria || anteriorCorta;
        }
      }

      if (nuevo) {
        parrafo = { tipo: 'p', partes: [] };
        ponerMarcas(parrafo);
        parrafo.partes.push(linea.texto);
        bloques.push(parrafo);
      } else {
        ponerMarcas(parrafo);
        unirLinea(parrafo, linea.texto);
      }
      anterior = linea;
      primeraDePagina = false;
    }
  });

  // Páginas vacías al final: sus marcas van en un bloque vacío.
  if (marcasPendientes.length) {
    const fin = { tipo: 'p', partes: [] };
    ponerMarcas(fin);
    bloques.push(fin);
  }
  return bloques;
}

/** Añade una línea al párrafo, quitando el guion de corte de palabra si hace falta. */
function unirLinea(parrafo, texto) {
  const partes = parrafo.partes;
  // Busca el último trozo de texto (puede haber marcas de página en medio).
  let i = partes.length - 1;
  while (i >= 0 && typeof partes[i] !== 'string') i--;
  const previo = i >= 0 ? partes[i] : '';

  if (/[\p{L}]-$/u.test(previo) && /^\p{Ll}/u.test(texto)) {
    // "pala-" + "bra" → "palabra"
    partes[i] = previo.slice(0, -1);
    partes.push(texto);
  } else if (previo.endsWith('­')) {
    partes[i] = previo.slice(0, -1);
    partes.push(texto);
  } else {
    partes.push(' ' + texto);
  }
}
