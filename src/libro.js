// Maqueta el texto como un libro: el contenido se reparte en columnas CSS
// (cada columna es una "página") y se desliza a izquierda o derecha.
// En horizontal se ven dos columnas a la vez (doble página).

export class Libro {
  /**
   * @param {HTMLElement} marco    área visible (recorta lo que sobra)
   * @param {HTMLElement} contenido elemento con todo el texto
   */
  constructor(marco, contenido) {
    this.marco = marco;
    this.contenido = contenido;
    this.pliego = 0; // "pliego" = las 1 o 2 páginas que se ven a la vez
    this.columnasPorPliego = 1;
    this.totalColumnas = 1;
    this.paso = 0; // ancho de una columna + separación
    this.marcas = []; // <span data-p> donde empieza cada página del PDF
    this.bloques = []; // párrafos y títulos
    this.alCambiar = () => {};
  }

  /** Coloca el texto nuevo (lista de elementos ya creados). */
  cargar(fragmento) {
    this.contenido.replaceChildren(fragmento);
    const fin = document.createElement('div');
    fin.className = 'fin-libro';
    this.contenido.append(fin);
    this.fin = fin;
    this.marcas = Array.from(this.contenido.querySelectorAll('.marca'));
    this.bloques = Array.from(this.contenido.children).filter((e) => e !== fin);
    this.pliego = 0;
    this.paso = 0;
    this.ancla = null;
  }

  /** Recalcula columnas y páginas (al girar el iPad o cambiar la letra). */
  maquetar() {
    // Punto del texto que se estaba leyendo (guardado antes de que cambie la letra o el tamaño).
    const ancla = this.ancla;
    const ancho = this.marco.clientWidth;
    const alto = this.marco.clientHeight;
    const doble = ancho > alto && ancho >= 600;
    this.columnasPorPliego = doble ? 2 : 1;

    // Margen exterior a cada lado; el hueco entre páginas es el doble,
    // así un pliego completo mide exactamente lo mismo que el marco.
    const margen = Math.round(Math.max(20, Math.min(56, ancho * 0.045)));
    const anchoTexto = ancho - margen * 2;
    const separacion = margen * 2;
    const s = this.contenido.style;
    s.left = margen + 'px';
    s.width = anchoTexto + 'px';
    s.columnCount = String(this.columnasPorPliego);
    s.columnGap = separacion + 'px';
    this.marco.classList.toggle('doble', doble);

    const anchoColumna = (anchoTexto - separacion * (this.columnasPorPliego - 1)) / this.columnasPorPliego;
    this.paso = anchoColumna + separacion;

    this.totalColumnas = Math.max(1, this.columnaDe(this.fin) + 1);
    this.totalPliegos = Math.ceil(this.totalColumnas / this.columnasPorPliego);

    if (ancla) {
      this.ir(Math.floor(this.columnaDe(ancla) / this.columnasPorPliego), false, true);
      return;
    }
    this.ir(Math.min(this.pliego, this.totalPliegos - 1), false);
  }

  /** Columna (página) en la que está un elemento o rango. */
  columnaDe(objetivo) {
    const r = rectInicio(objetivo);
    if (!r) return 0;
    const base = this.contenido.getBoundingClientRect().left;
    return Math.max(0, Math.floor((r.left - base + 1) / this.paso));
  }

  /**
   * @param {number} pliego
   * @param {boolean} animar  deslizar con animación
   * @param {boolean} mantenerAncla  no cambiar el punto de lectura (al remaquetar)
   */
  ir(pliego, animar = true, mantenerAncla = false) {
    const max = Math.max(0, (this.totalPliegos || 1) - 1);
    this.pliego = Math.min(max, Math.max(0, pliego));
    this.contenido.classList.toggle('sin-animar', !animar);
    const desplazamiento = this.pliego * this.columnasPorPliego * this.paso;
    this.contenido.style.transform = `translate3d(${-desplazamiento}px,0,0)`;
    this.alCambiar();
    // Recuerda qué texto está al principio de la página visible.
    if (!mantenerAncla) this.ancla = this.anclaActual();
  }

  siguiente() {
    this.ir(this.pliego + 1);
  }

  anterior() {
    this.ir(this.pliego - 1);
  }

  /** Va al pliego donde empieza una página del PDF. */
  irAPaginaPdf(numero) {
    const marca = this.marcas.find((m) => Number(m.dataset.p) >= numero);
    if (marca) this.ir(Math.floor(this.columnaDe(marca) / this.columnasPorPliego), false);
  }

  irABloque(indice) {
    const bloque = this.bloques[indice];
    if (bloque) this.ir(Math.floor(this.columnaDe(bloque) / this.columnasPorPliego), false);
  }

  /** Primera columna visible ahora mismo. */
  get primeraColumna() {
    return this.pliego * this.columnasPorPliego;
  }

  /**
   * Busca el último elemento de la lista que empieza en una columna <= la primera visible.
   * Búsqueda binaria: los elementos están en orden de lectura.
   */
  ultimoAntesDe(lista) {
    let bajo = 0;
    let alto = lista.length - 1;
    let encontrado = -1;
    const limite = this.primeraColumna;
    while (bajo <= alto) {
      const medio = (bajo + alto) >> 1;
      if (this.columnaDe(lista[medio]) <= limite) {
        encontrado = medio;
        bajo = medio + 1;
      } else {
        alto = medio - 1;
      }
    }
    return encontrado;
  }

  /** Página del PDF que se está leyendo (para guardar el progreso). */
  paginaPdfActual() {
    const i = this.ultimoAntesDe(this.marcas);
    return i >= 0 ? Number(this.marcas[i].dataset.p) : 1;
  }

  bloqueActual() {
    return Math.max(0, this.ultimoAntesDe(this.bloques));
  }

  /**
   * Punto exacto del texto con el que empieza la página visible.
   * Sirve para no perder el sitio al cambiar el tamaño de letra o girar el iPad.
   * Se calcula por posición dentro del texto, así que no depende de la animación.
   */
  anclaActual() {
    if (!this.paso || !this.bloques.length) return null;
    const bloque = this.bloques[this.bloqueActual()];
    const rango = document.createRange();
    rango.selectNodeContents(bloque);
    rango.collapse(true);
    const limite = this.primeraColumna;
    if (this.columnaDe(bloque) >= limite) return rango;

    // El párrafo viene de la página anterior: busca (por mitades) el primer
    // carácter que ya cae en la página visible.
    const textos = [];
    const recorrido = document.createTreeWalker(bloque, NodeFilter.SHOW_TEXT);
    let total = 0;
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
      textos.push({ nodo: n, desde: total });
      total += n.length;
    }
    const enPosicion = (pos) => {
      let i = textos.length - 1;
      while (i > 0 && textos[i].desde > pos) i--;
      const r = document.createRange();
      r.setStart(textos[i].nodo, pos - textos[i].desde);
      return r;
    };
    let bajo = 0;
    let alto = total - 1;
    let mejor = -1;
    while (bajo <= alto) {
      const medio = (bajo + alto) >> 1;
      if (this.columnaDe(enPosicion(medio)) >= limite) {
        mejor = medio;
        alto = medio - 1;
      } else {
        bajo = medio + 1;
      }
    }
    return mejor >= 0 ? enPosicion(mejor) : rango;
  }
}

/** Rectángulo del inicio de un elemento o rango (primer carácter). */
function rectInicio(objetivo) {
  if (objetivo instanceof Range) {
    const r = objetivo.cloneRange();
    const nodo = r.startContainer;
    // Rango al principio de un párrafo: se mide el párrafo.
    if (nodo.nodeType === Node.ELEMENT_NODE) return rectInicio(nodo);
    if (r.startOffset < nodo.length) {
      r.setEnd(nodo, r.startOffset + 1);
    }
    const rects = r.getClientRects();
    if (rects.length) return rects[0];
    return r.getBoundingClientRect();
  }
  // Para un bloque, mide su primer carácter de texto (más fiable en columnas).
  if (objetivo.firstChild && !objetivo.classList.contains('marca')) {
    const recorrido = document.createTreeWalker(objetivo, NodeFilter.SHOW_TEXT);
    const texto = recorrido.nextNode();
    if (texto && texto.length) {
      const r = document.createRange();
      r.setStart(texto, 0);
      r.setEnd(texto, 1);
      const rects = r.getClientRects();
      if (rects.length) return rects[0];
    }
  }
  const rects = objetivo.getClientRects();
  return rects.length ? rects[0] : objetivo.getBoundingClientRect();
}
