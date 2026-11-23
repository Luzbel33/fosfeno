# Fosfeno · Hydra en vivo

Editor de live coding y sintetizador de video con Hydra. Cada imagen de la salida la produce el JavaScript del sketch. Podés empezar en blanco, editar una pieza existente o generar un nuevo grafo de señales a partir de una semilla.

[Abrir el estudio](https://luzbel33.github.io/fosfeno/index.html?v=2) · [Abrir Glitch River de Flor de Fuego](https://luzbel33.github.io/fosfeno/index.html?sketch_id=flor_2) · [Ver el editor en movimiento](media/fosfeno-demo.mp4)

## Tocar una visual

La salida tiene su propio espacio. El código, la biblioteca y las entradas están al costado en escritorio y debajo en celular. La ventana del proyector recibe el canvas limpio.

1. En **Código**, cambiá un valor. Con **Edición en vivo** encendida, la salida se actualiza tras una pausa breve al escribir. Tocá un literal numérico para afinarlo con el deslizador.
2. Elegí **Espejo X**, **Modular** u otro operador. Se inserta en la cadena que contiene el cursor o en la cadena de salida principal. Las funciones de los espejos aparecen definidas en el propio documento.
3. **Explorar** escribe un nuevo sketch. En **Biblioteca** podés elegir simetría, ingresar una semilla y volver a generar el mismo grafo. El generador combina interferencias, ecos entre fotogramas, inversión de coordenadas, tramas y campos de órbitas. Cada operación queda editable.
4. Para armar una pieza desde cero, elegí **Biblioteca → En blanco**. Escribí `osc(14, 0.08, 1.4).kaleid(5).out(o0)` y tocá **Ejecutar**.
5. **Autopiloto** escribe y ejecuta una semilla nueva en cada intervalo. Tocar el código devuelve el control al operador. El intervalo se elige junto al interruptor.

### Ejecutar por bloques

**Ctrl + Enter** ejecuta la selección o el bloque entre líneas vacías. **Ctrl + Shift + Enter** ejecuta todo. En Mac también funciona ⌘. Las variables y funciones declaradas al nivel superior pueden reutilizarse desde otro bloque. Las funciones que se pasan como parámetros se evalúan durante la animación.

```js
let pliegues = 5

osc(11, 0.06, 1.5).modulate(noise(2, 0.1), 0.25).out(o1)

src(o1)
  .kaleid(() => pliegues)
  .blend(src(o0).scale(1.015), 0.54)
  .out(o0)

render(o0)
```

Probá seleccionar y ejecutar `pliegues = 9`. Podés usar las cuatro entradas `s0…s3`, las cuatro salidas `o0…o3`, secuencias, callbacks, `update`, `speed`, `bpm`, `setFunction` y código asíncrono. Los botones sobre la visual permiten inspeccionar cada buffer. `render()` muestra las cuatro salidas. Si falla la compilación de una cadena, el editor recupera los programas de salida anteriores.

### Biblioteca e intercambio

- **Puntos de partida** incluye el `flor_2` original, patches multibuffer, osciladores, geometrías escritas con GLSL y tratamientos para fuentes en vivo.
- **Comunidad Hydra → Abrir catálogo** lee los ejemplos del repositorio oficial. Buscá por nombre, autor o identificador. Tras la primera descarga, el catálogo queda disponible en ese navegador sin conexión. Algunos sketches pueden requerir sus propias fuentes externas.
- **Guardar** conserva una copia local. También podés importar o descargar JavaScript. El botón **Abrir en Hydra** lleva el código actual al editor oficial en un enlace.
- Los documentos importados, los de la comunidad y los borradores recuperados esperan a que pulses **Ejecutar**. El editor ejecuta JavaScript con las capacidades de la página.

## Señal y proyección

En **Señal → Imagen** conectá una webcam, una ventana, una foto o un video. La entrada queda disponible como `src(s0)`. **Pinceladas** la reconstruye con trazos orientados según los bordes. **Insertar src(s0) en mi mezcla** escribe un blend explícito en el sketch. También podés inicializar las fuentes desde código con la API nativa de Hydra.

En **Audio** podés activar el micrófono, importar pistas o grabar una toma. Cada pista admite bucle, volumen y descarga. Podés superponer varias. La biblioteca se guarda en IndexedDB, en este navegador. Por defecto `a.fft[0]`, `a.fft[1]` y `a.fft[2]` corresponden a graves, medios y agudos. Sin entrada de audio, esas bandas siguen un pulso interno de 130 BPM.

**Proyectar** amplía la salida. Para seguir editando desde la notebook, usá **Señal → Salida → Abrir ventana de salida**, movela al proyector y hacé doble clic. También podés capturarla en OBS. **Ctrl + Shift + H** oculta los controles de la cabina.

## Operación local

Descargá las carpetas y abrí `index.html` o ejecutá `python -m http.server 8000 --bind 127.0.0.1` y abrí `http://localhost:8000`. La edición web usa HTTPS para los permisos de medios. La cabina pública se puede recargar sin conexión después de la primera carga completa. Al publicar cambios, actualizá la versión de caché de `sw.js` y las URLs de recursos de la entrada cuando correspondan.

Se usa el motor **hydra-synth 1.4.0**, CodeMirror 5.65.18 y Acorn 8.15.0, incluidos localmente. Acorn mantiene las declaraciones de nivel superior entre ejecuciones de bloques. Los presets y el generador están en `src/sketches.js`. Para ejecutar las pruebas del evaluador y del generador usá `node --test tests/live-code.test.cjs`.

## Créditos

- Hydra, de Olivia Jack y colaboradores. *Glitch River* es de Flor de Fuego y conserva la atribución del sketch. [Motor distribuido](https://github.com/hydra-synth/hydra-synth/tree/c3ba80bd82f096e0ef7a9b7022e72c04162c25c4) · [Sketch original](https://hydra.ojack.xyz/?sketch_id=flor_2) · [Catálogo de la comunidad](https://github.com/hydra-synth/hydra/blob/main/src/stores/examples.json)
- La mezcla de fuentes toma como referencias modV y projectM. El pincel incremental se inspira en el trabajo de Aaron Hertzmann sobre orientación y escala de los trazos. [modV](https://github.com/vcync/modV) · [projectM](https://github.com/projectM-visualizer/projectm) · [Painterly Rendering](https://mrl.cs.nyu.edu/publications/painterly98/)
- Fosfeno se distribuye bajo GNU AGPL v3. Las bibliotecas del editor y las fuentes conservan sus respectivas licencias. [AGPL](LICENSE) · [CodeMirror](vendor/codemirror/LICENSE) · [Acorn](vendor/acorn/LICENSE) · [Barlow](assets/LICENSE-Barlow.txt) · [Space Mono](assets/LICENSE-SpaceMono.txt)
