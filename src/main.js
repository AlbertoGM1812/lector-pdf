import './estilos.css';
// La versión "legacy" de PDF.js incluye arreglos para navegadores más antiguos,
// como el Safari de iPadOS 17.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import urlTrabajador from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { registerSW } from 'virtual:pwa-register';
import { extraerBloques } from './extraer.js';
import { Libro } from './libro.js';
import { leerProgreso, guardarProgreso, llaveDelLibro } from './progreso.js';

// El "worker" (trabajador) lee el PDF en segundo plano sin congelar la pantalla.
pdfjs.GlobalWorkerOptions.workerSrc = urlTrabajador;

// Service worker: guarda la app para que funcione sin internet.
registerSW({ immediate: true });

const $ = (id) => document.getElementById(id);
const marco = $('marco');
const contenido = $('contenido');
const libro = new Libro(marco, contenido);

// ---------- Preferencias de lectura ----------
const PREF = 'lector-pdf:preferencias';
const prefs = Object.assign(
  { tam: 20, fuente: 'serif', tema: 'dia', color: '', interlineado: 1.5 },
  JSON.parse(localStorage.getItem(PREF) || '{}'),
);

function aplicarPreferencias(remaquetar = true) {
  const raiz = document.documentElement;
  raiz.dataset.tema = prefs.tema;
  raiz.dataset.fuente = prefs.fuente;
  raiz.style.setProperty('--tam-letra', prefs.tam + 'px');
  raiz.style.setProperty('--interlineado', String(prefs.interlineado));
  if (prefs.color) raiz.style.setProperty('--color-texto-libro', prefs.color);
  else raiz.style.removeProperty('--color-texto-libro');

  $('tam-letra').value = prefs.tam;
  $('tam-valor').textContent = prefs.tam + ' px';
  $('interlineado').value = prefs.interlineado;
  $('interlineado-valor').textContent = Number(prefs.interlineado).toFixed(1);
  marcarActivo('opciones-fuente', 'fuente', prefs.fuente);
  marcarActivo('opciones-tema', 'tema', prefs.tema);
  marcarActivo('opciones-color', 'color', prefs.color);
  $('color-letra').value = prefs.color || colorPorDefecto();
  $('color-letra').classList.toggle('activa', !!prefs.color);
  document.querySelector('meta[name="theme-color"]').content =
    getComputedStyle(raiz).getPropertyValue('--fondo').trim() || '#f7f3ea';

  try {
    localStorage.setItem(PREF, JSON.stringify(prefs));
  } catch {}
  if (remaquetar && libroAbierto) libro.maquetar();
}

function colorPorDefecto() {
  return prefs.tema === 'noche' ? '#d8d2c4' : prefs.tema === 'sepia' ? '#4a3b28' : '#1f1d1a';
}

function marcarActivo(idGrupo, atributo, valor) {
  for (const b of $(idGrupo).querySelectorAll('button')) {
    b.classList.toggle('activa', b.dataset[atributo] === valor);
  }
}

$('tam-letra').addEventListener('input', (e) => {
  prefs.tam = Number(e.target.value);
  aplicarPreferencias();
});
$('interlineado').addEventListener('input', (e) => {
  prefs.interlineado = Number(e.target.value);
  aplicarPreferencias();
});
$('opciones-fuente').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  prefs.fuente = b.dataset.fuente;
  aplicarPreferencias();
});
$('opciones-tema').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  prefs.tema = b.dataset.tema;
  aplicarPreferencias(false);
});
$('opciones-color').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  prefs.color = '';
  aplicarPreferencias(false);
});
$('color-letra').addEventListener('input', (e) => {
  prefs.color = e.target.value;
  aplicarPreferencias(false);
});

$('btn-ajustes').addEventListener('click', () => {
  const panel = $('ajustes');
  panel.hidden = !panel.hidden;
  $('btn-ajustes').setAttribute('aria-expanded', String(!panel.hidden));
});

// ---------- Abrir un PDF ----------
let libroAbierto = null; // { llave, tarea }
const selector = $('selector');
const abrirSelector = () => selector.click();
$('btn-abrir').addEventListener('click', abrirSelector);
$('btn-abrir-grande').addEventListener('click', abrirSelector);

selector.addEventListener('change', async () => {
  const archivo = selector.files?.[0];
  selector.value = ''; // para poder volver a elegir el mismo archivo
  if (archivo) await abrirArchivo(archivo);
});

function mostrarEstado(texto) {
  $('estado').textContent = texto;
}

async function abrirArchivo(archivo) {
  $('ajustes').hidden = true;
  mostrarBienvenida(true);
  mostrarEstado('Abriendo «' + archivo.name + '»…');
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (libroAbierto) {
      libroAbierto.tarea.destroy();
      libroAbierto = null;
    }
    const tarea = pdfjs.getDocument({
      data: bytes.slice(), // copia: PDF.js se queda con la suya
      cMapUrl: './cmaps/',
      cMapPacked: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    tarea.onPassword = (responder, motivo) => {
      const clave = prompt(
        motivo === pdfjs.PasswordResponses.INCORRECT_PASSWORD
          ? 'Contraseña incorrecta. Inténtalo de nuevo:'
          : 'Este PDF tiene contraseña:',
      );
      if (clave === null) tarea.destroy();
      else responder(clave);
    };
    const pdf = await tarea.promise;
    const llave = await llaveDelLibro(pdf, bytes);

    const { bloques, hayTexto } = await extraerBloques(pdf, (hechas, total) =>
      mostrarEstado(`Preparando el texto… página ${hechas} de ${total}`),
    );
    if (!hayTexto) {
      tarea.destroy();
      mostrarEstado(
        'Este PDF no tiene texto que se pueda leer (parece escaneado como imagen). ' +
          'Prueba con otro archivo.',
      );
      return;
    }

    const info = await pdf.getMetadata().catch(() => null);
    const titulo = info?.info?.Title?.trim() || archivo.name.replace(/\.pdf$/i, '');
    const idioma = info?.info?.Language;
    contenido.lang = typeof idioma === 'string' && idioma ? idioma : 'es';
    $('titulo').textContent = titulo;
    document.title = titulo + ' · Lector PDF';

    libro.cargar(crearElementos(bloques));
    libroAbierto = { llave, tarea };
    mostrarBienvenida(false);
    await esperarFuentes();
    libro.maquetar();

    const guardado = leerProgreso(llave);
    if (guardado) {
      if (Number.isInteger(guardado.parrafo)) libro.irABloque(guardado.parrafo);
      else libro.irAPaginaPdf(guardado.pagina);
      avisar(`Seguimos donde lo dejaste (página ${guardado.pagina} del PDF).`);
    } else {
      libro.ir(0, false);
    }
  } catch (error) {
    console.error(error);
    mostrarBienvenida(true);
    if (error?.name === 'PasswordException') mostrarEstado('No se abrió: falta la contraseña.');
    else if (error?.name === 'InvalidPDFException') mostrarEstado('Ese archivo no parece un PDF válido.');
    else mostrarEstado('No se pudo abrir el PDF: ' + (error?.message || error));
  }
}

/** Crea los párrafos y títulos en el documento, sin interpretar HTML del PDF. */
function crearElementos(bloques) {
  const fragmento = document.createDocumentFragment();
  for (const bloque of bloques) {
    const el = document.createElement(bloque.tipo === 'h' ? 'h2' : 'p');
    for (const parte of bloque.partes) {
      if (typeof parte === 'string') {
        el.append(parte);
      } else {
        const marca = document.createElement('span');
        marca.className = 'marca';
        marca.dataset.p = String(parte.marca);
        el.append(marca);
      }
    }
    fragmento.append(el);
  }
  return fragmento;
}

function mostrarBienvenida(si) {
  $('bienvenida').hidden = !si;
  contenido.hidden = si;
  $('barra-inferior').hidden = si || !libroAbierto;
  document.body.classList.toggle('leyendo', !si);
}

async function esperarFuentes() {
  try {
    await document.fonts?.ready;
  } catch {}
}

let temporizadorAviso;
function avisar(texto) {
  let aviso = $('aviso');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'aviso';
    document.body.append(aviso);
  }
  aviso.textContent = texto;
  aviso.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), 3000);
}

// ---------- Avance, contador y guardado ----------
const avance = $('avance');
let temporizadorGuardar;

libro.alCambiar = () => {
  if (!libroAbierto) return;
  const n = libro.columnasPorPliego;
  const primera = libro.primeraColumna + 1;
  const ultima = Math.min(primera + n - 1, libro.totalColumnas);
  const porcentaje = Math.round((ultima / libro.totalColumnas) * 100);
  $('contador').textContent =
    (primera === ultima ? `Página ${primera}` : `Páginas ${primera}–${ultima}`) +
    ` de ${libro.totalColumnas} · ${porcentaje}%`;
  avance.max = String(libro.totalPliegos);
  avance.value = String(libro.pliego + 1);
  avance.style.setProperty('--lleno', ((libro.pliego + 1) / libro.totalPliegos) * 100 + '%');

  clearTimeout(temporizadorGuardar);
  temporizadorGuardar = setTimeout(guardarAhora, 400);
};

function guardarAhora() {
  if (!libroAbierto) return;
  guardarProgreso(libroAbierto.llave, libro.paginaPdfActual(), libro.bloqueActual());
}

avance.addEventListener('input', () => libro.ir(Number(avance.value) - 1, false));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') guardarAhora();
});
window.addEventListener('pagehide', guardarAhora);

// ---------- Pasar página: toques, deslizar y teclado ----------
let inicioToque = null;
let fueDeslizamiento = false;

marco.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 1) return (inicioToque = null);
    inicioToque = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    fueDeslizamiento = false;
  },
  { passive: true },
);
marco.addEventListener('touchend', (e) => {
  if (!inicioToque || !libroAbierto) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - inicioToque.x;
  const dy = t.clientY - inicioToque.y;
  inicioToque = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
    fueDeslizamiento = true;
    if (dx < 0) libro.siguiente();
    else libro.anterior();
  }
});

marco.addEventListener('click', (e) => {
  if (!libroAbierto || $('bienvenida').hidden === false) return;
  if (fueDeslizamiento) {
    fueDeslizamiento = false;
    return;
  }
  if (!$('ajustes').hidden) {
    $('ajustes').hidden = true;
    return;
  }
  const r = marco.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  if (x < 0.3) libro.anterior();
  else if (x > 0.7) libro.siguiente();
  else document.body.classList.toggle('sin-barras');
});

document.addEventListener('keydown', (e) => {
  if (!libroAbierto || e.target instanceof HTMLInputElement) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
    e.preventDefault();
    libro.siguiente();
  } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
    e.preventDefault();
    libro.anterior();
  }
});

// Al girar el iPad o cambiar el tamaño de la ventana, se vuelve a maquetar.
let temporizadorMaquetar;
window.addEventListener('resize', () => {
  clearTimeout(temporizadorMaquetar);
  temporizadorMaquetar = setTimeout(() => libroAbierto && libro.maquetar(), 150);
});

aplicarPreferencias(false);
