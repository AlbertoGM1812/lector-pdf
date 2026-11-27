# Lector PDF

Aplicación web progresiva (PWA: una página web que se puede instalar en la pantalla
de inicio y usar sin internet) para leer PDFs en el iPad como si fueran un libro.

- Saca el texto del PDF y lo vuelve a maquetar con tu letra, tamaño y colores.
- En horizontal muestra dos páginas a la vez; en vertical, una.
- Barra de avance, contador de páginas, fondos Día / Sepia / Noche, tamaño,
  tipo y color de letra, e interlineado.
- Los PDFs **no** se guardan en la app: se abren desde la app Archivos cada vez.
  Solo se guarda el progreso en el almacenamiento local del navegador:
  `{ llave, pagina, parrafo, fecha }`.
  - `llave`: el ID del documento que trae el PDF (`pdf.fingerprints[0]`); si no tiene,
    un hash SHA-256 de los bytes del archivo.
  - `pagina`: página del PDF original en la que vas.
  - `parrafo`: número de párrafo, para volver al punto exacto aunque cambies la letra.
- Pantalla de inicio con tus lecturas recientes (título, página y porcentaje). Al tocar
  un libro se abre Archivos para elegirlo otra vez, porque el PDF no se guarda.
- Racha de días seguidos leyendo (un día cuenta si pasas al menos una página nueva) y
  contador de páginas leídas hoy y en total.
- Solo funciona con PDFs que tienen texto. Los escaneados (fotos de páginas) no se pueden leer.

## Cómo usarla en el ordenador

Necesitas [Node.js](https://nodejs.org) instalado.

```powershell
npm install
npm run dev
```

Abre la dirección que aparece en la línea `Local:` (http://localhost:5173).

## Cómo probarla en el iPad por Wi-Fi

1. El ordenador y el iPad deben estar en la **misma red Wi-Fi**.
2. En el ordenador ejecuta `npm run dev`. Vite muestra una línea `Network:` con una
   dirección como `http://10.31.65.105:5173/`.
3. La primera vez, Windows puede preguntar si Node.js puede usar la red:
   marca **Redes privadas** y pulsa **Permitir**.
4. En el iPad abre Safari y escribe esa dirección `Network:`.
5. Toca **Abrir PDF** y elige un archivo en la app Archivos.

Por Wi-Fi la app se puede usar, pero el modo sin internet todavía no funciona:
Safari solo lo permite en páginas seguras (`https://`). Eso se prueba cuando la app esté
publicada en GitHub Pages.

## Publicar en GitHub Pages

El archivo `.github/workflows/publicar.yml` compila y publica la app cada vez que
se sube algo a la rama `main`. Hay que activar Pages una vez en GitHub:
**Settings → Pages → Source: GitHub Actions**. La app quedará en
`https://albertogm1812.github.io/lector-pdf/`.

Después, en el iPad: abre esa dirección en Safari → botón **Compartir** →
**Añadir a pantalla de inicio**. Ábrela una vez con internet y desde entonces
funciona sin conexión.

## Comandos

| Comando           | Qué hace                                              |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo (también accesible por Wi-Fi) |
| `npm run build`   | Compila la versión final en la carpeta `dist/`         |
| `npm run preview` | Sirve la versión de `dist/` para probarla             |

## Archivos principales

- `src/extraer.js`: convierte el texto del PDF en párrafos y títulos.
- `src/libro.js`: reparte el texto en páginas (columnas) y las pasa.
- `src/progreso.js`: guarda y lee el progreso, y calcula la llave del libro.
- `src/main.js`: conecta botones, ajustes y gestos.
- `src/estilos.css`: colores y diseño.
