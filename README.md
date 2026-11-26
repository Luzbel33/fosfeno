# Fosfeno · Hydra en vivo

Editor de live coding y sintetizador de video con Hydra. El JavaScript del sketch genera la imagen base. Los sectores opcionales componen sus efectos encima de esa salida. Podés empezar en blanco, editar una pieza existente o generar un nuevo grafo de señales a partir de una semilla.

Al entrar sin un enlace de sketch, Fosfeno genera una pieza con una semilla aleatoria. La semilla aparece en el nombre y en el código. Los borradores se conservan y los enlaces identificados recuperan su pieza. *MULTIVERSE*, de e_e (@eerie_ear), queda en la Biblioteca con el código y la atribución originales. [Abrir el mismo sketch en Hydra](https://hydra.ojack.xyz/?sketch_id=eerie_ear_0) · [Comparación en navegador y límites](docs/paridad-hydra.md)

[Abrir el estudio](https://luzbel33.github.io/fosfeno/abrir.html?v=2.19) · [Abrir Glitch River de Flor de Fuego](https://luzbel33.github.io/fosfeno/abrir.html?v=2.19&sketch_id=flor_2) · [Ver el editor en movimiento](media/fosfeno-demo.mp4)

## Tocar una visual

En pantallas amplias, **Sectores** aparece en la barra cuando el panel izquierdo está cerrado. Usá la **×** del panel para cerrarlo. **Código**, **Biblioteca**, **Imagen** y **Audio** abren su herramienta a la derecha. En el teléfono en vertical, la herramienta se abre arriba del monitor. Usá **Cerrar panel** para recuperar la vista grande.

En **Sectores**, tocá **Nuevo sector**, elegí una forma y arrastrá sobre la visual. Las herramientas se abren debajo del sector que dibujaste. Tocá **Edición en vivo** para pasar a **Edición manual**. **Enviar a salida** aparece cuando hay cambios preparados. **Grabar loop** está junto a **Proyectar** en pantallas amplias y al inicio de los controles de edición en pantallas chicas. Arrastrá la división para repartir el espacio. Con teclado, enfocá la división y usá las flechas.

**Ampliar** te deja mirar la composición en la misma ventana. **Volver a editar** o **Esc** recupera la pestaña y el tamaño que estabas usando. **Proyectar** abre una ventana aparte con la imagen limpia.

1. En **Código**, cambiá un valor. **Edición en vivo** empieza encendida y recuerda tu elección. La salida se actualiza tras una pausa breve al escribir. Tocá un literal numérico para afinarlo con el deslizador.
2. Elegí un sector o **Toda la visual** y tocá **+ Efecto** en su fila. Buscá un operador o mezclá una pieza de la Biblioteca. La cadena muestra qué está en salida, pausado o pendiente. Pausar conserva el ajuste. Las flechas cambian el orden y **×** quita el efecto.
3. **Explorar** escribe un nuevo sketch. En **Biblioteca** podés elegir simetría, ingresar una semilla y volver a generar el mismo grafo. El generador combina interferencias, ecos entre fotogramas, inversión de coordenadas, tramas y campos de órbitas. Cada operación queda editable.
4. Para armar una pieza desde cero, elegí **Biblioteca → En blanco**. Escribí `osc(14, 0.08, 1.4).kaleid(5).out(o0)`; en edición en vivo se proyecta al escribir.
5. **Autopiloto** escribe y ejecuta una semilla nueva en cada intervalo. Tocar el código devuelve el control al operador. El intervalo se elige junto al interruptor.

### Leer, ajustar y ejecutar código

El **?** junto al nombre del sketch abre **Comentarios por línea**. Podés mostrarlos mientras editás y copiar el código con una guía numerada para consultarla o llevarla a una IA. Las anotaciones son locales. El texto del editor y la atribución del original se conservan.

La búsqueda en **+ Efecto** incluye fuentes, transformaciones y mezclas de Hydra. En **Código**, **Editar operadores del código** muestra las llamadas del sketch con su línea, argumentos y valores predeterminados. Podés escribir un número, una secuencia o una expresión como `() => time * 0.2`. **Guardar este operador** guarda una copia con sus argumentos. Para los operadores que dependen de variables propias del sketch, guardá la composición completa.

**Ctrl + Enter** ejecuta la línea del cursor. **Alt + Enter** ejecuta el bloque entre líneas vacías y **Ctrl + Shift + Enter** ejecuta todo. El botón **Bloque** también admite una selección. La ejecución al escribir se activa con **Edición en vivo**. Podés comentar con **Ctrl + /**, formatear con **Ctrl + Shift + F** y descargar el fotograma y el código con **Ctrl + Shift + S**. Fosfeno también admite ⌘ como modificador. Las variables y funciones declaradas al nivel superior pueden reutilizarse desde otro bloque.

Cuando abrís Fosfeno por HTTP o HTTPS, **Ejecutar** o **Ctrl + Shift + Enter** guarda el código de una ejecución exitosa en la dirección de esa pestaña. **Atrás** y **Adelante** recuperan y ejecutan los pasos de esa sesión. Podés copiar la dirección para llevar el código a otra pestaña, donde queda listo para ejecutar a mano. Ejecutar una línea, tocar un parámetro o escribir en vivo mantiene la dirección actual.

```js
let pliegues = 5

osc(11, 0.06, 1.5).modulate(noise(2, 0.1), 0.25).out(o1)

src(o1)
  .kaleid(() => pliegues)
  .blend(src(o0).scale(1.015), 0.54)
  .out(o0)

render(o0)
```

Probá seleccionar y ejecutar `pliegues = 9`. Podés usar las cuatro entradas `s0…s3`, las cuatro salidas `o0…o3`, secuencias, callbacks, `update`, `speed`, `bpm`, `setFunction` y código asíncrono. El selector **Principal · o0** permite inspeccionar una salida o verlas juntas en mosaico. `render()` muestra las cuatro salidas. Si falla la compilación de una cadena, el editor recupera los programas de salida anteriores.

### Biblioteca e intercambio

- **Mezclar** alterna un sketch en toda la visual o en el sector seleccionado. El control debajo de la pieza regula su intensidad. Cada mezcla tiene sus propios buffers Hydra, incluido el feedback. Los sectores leen las entradas s0 a s3. Los sketches que abren dispositivos o cargan recursos de manera asíncrona se ejecutan desde el código principal.
- **Puntos de partida** incluye el `flor_2` original, patches multibuffer, osciladores, geometrías escritas con GLSL y tratamientos para fuentes en vivo.
- **Comunidad Hydra → Abrir catálogo** lee los ejemplos del repositorio oficial. Sin conexión usa la copia guardada o los 58 ejemplos incluidos. Buscá por nombre, autor o identificador. Un enlace con `?sketch_id=` puede abrir cualquiera de los ejemplos incluidos. Los enlaces con `?code=` cargan el código en el editor y esperan a que pulses **Ejecutar**.
- **Guardar** conserva una copia local. También podés importar o descargar JavaScript. El botón **Abrir en Hydra** lleva el código actual al editor oficial en un enlace.
- Los enlaces con JavaScript y los archivos importados requieren una primera ejecución explícita. Una edición posterior de un borrador local previamente activado puede volver a proyectarse en vivo.

## Señal y proyección

En **Imagen**, **Webcam** pide acceso a la cámara predeterminada. Abrí la cabina por HTTPS o localhost y permití el acceso en el navegador. Podés elegir cualquier cámara que el navegador identifique en el panel. En algunos equipos los nombres aparecen después de dar permiso. La vista previa confirma qué cámara llega a `s0`. **Desconectar entrada** libera la cámara.

**Mezclar al conectar** inserta la entrada de cámara, ventana o archivo en el sketch. **Mezclar con el sketch** puede volver a agregarla y **Ver sólo la fuente** abre una cadena Hydra editable dedicada a la entrada. Para usar la cámara sólo dentro de un sector, conectala allí o desactivá la mezcla automática en el panel. **Pinceladas** reconstruye la entrada con trazos orientados según los bordes. También podés usar una ventana, foto o video. Desde código, `await s1.initCam(0)` conecta la primera cámara a `s1` y `s1.clear()` la libera. Los índices empiezan en cero y las cuatro entradas admiten cámaras.

En **Audio** podés activar el micrófono, importar pistas o grabar una toma. Cada pista admite bucle, volumen y descarga. Podés superponer varias. La biblioteca se guarda en IndexedDB, en este navegador. Hydra arranca con cuatro bandas en `a.fft` y un tempo de 30 BPM. Usá `a.setBins(n)`, `a.settings[i]`, `a.setSmooth(v)`, `a.setCutoff(v)` y `a.setScale(v)` para ajustar la respuesta. En reposo las bandas arrancan en cero. Para generar un ritmo de forma explícita, activá **Pulso interno sin audio** y ajustá **Tempo**. Una entrada activa tiene prioridad incluso durante sus silencios.

Para usar p5 como entrada, creá `p = new P5()`, dibujá en `p`, conectá `s1.init({src: p.canvas})` y ejecutá `src(s1).out()`. Para recibir video de otra instancia de Hydra, usá `s0.initStream("nombre")`. En la emisora, `pb.setName("nombre")` habilita compartir el canvas por WebRTC. `pb.list()` abre el descubrimiento de pares y `pb.disconnect()` cierra la conexión de Fosfeno. Para una sala propia, ejecutá primero `pb.connect(urlDelServidor, nombreDeSala)` en las dos instancias.

**Proyectar** abre una segunda ventana que contiene únicamente el video de la composición. Movela al proyector y hacé doble clic para ponerla en pantalla completa. La cabina conserva el editor y las guías. En una sola pantalla usá **Imagen → Salida → Pantalla completa**.

**Desconectar cámara** libera la entrada. En **Sectores**, **Quitar del sector** vuelve al sketch y **Desconectar entrada s0** apaga la fuente compartida. Las pinceladas tienen grosor, velocidad y definición final. En el sentido normal, al 100 % llegan a la imagen original. **A la inversa** parte de la imagen original y la simplifica. Con la definición al 0 % termina en dos tonos.

### Mapeo con proyector

**Mapeo** activa la salida calibrada en el mismo Estudio. En **Superficie y pincel**, elegí **Abrir proyector**, mové la ventana a la pantalla extendida y hacé doble clic para mostrarla completa. Con una cámara fija apuntando a la misma superficie, elegí el formato y tocá **Calibrar**. Marcá los centros de las cuatro cruces en orden, en la cámara o en una foto que las muestre. Recalibrá si movés el equipo o cambiás el tamaño de la salida.

**Sectores y efectos** usa el editor del Estudio. Dibujá sectores libres, triángulos y otras formas en **Nuevo sector**. En cada capa podés combinar operadores, código, biblioteca, archivos, señal y pinceladas. **Referencia** muestra la cámara o foto sobre la visual de edición. En **Superficie y pincel** podés enviar la visual completa, sólo los sectores visibles o pintar por separado. **Editar como sector** lleva un recorte de foto, video o loop al editor Hydra para aplicarle efectos. **Apagón** deja la salida en negro. **Estudio Hydra** sale de Mapeo.

**Guardar mapa** guarda una copia local. **Recuperar mapa** carga su código y sus sectores junto al pincel y la calibración. **Descargar** genera un `.fosmap` con el código, los sectores, sus archivos, los trazos y la calibración. **Importar** permite abrirlo en otra computadora. Volvé a conectar las cámaras y las entradas en vivo al recuperar un mapa.

La calibración corrige la perspectiva de una superficie plana usando cuatro puntos. Varios recortes pueden ocupar zonas de esa superficie. Cada cara con una profundidad distinta requiere su propia calibración. Este modo tampoco mide profundidad ni sigue objetos que se mueven.

### Sectores

**Libre** sigue el recorrido del puntero. Seleccioná un sector en la lista o sobre la imagen. **Código** en la fila edita ese sector. **Biblioteca** e **Imagen** trabajan sobre el sector seleccionado. **Toda la visual** apunta a la imagen base. Los sectores de adelante aparecen arriba y el ojo alterna su visibilidad.

Arrastrá desde el interior de un sector para moverlo. **Deformar** edita sus puntos. **Estilo** permite activar un relleno y un borde por separado, elegir sus colores o escribirlos en hexadecimal y ajustar el grosor del borde.

Con **+ Capa**, agregá una imagen, código o una cadena de efectos independiente dentro del mismo contorno. Desplegá el sector en la pila para ver cada fuente por nombre y los efectos de cada capa. El ojo alterna la visibilidad y el punto junto a un efecto lo pausa. Tocá un nombre para editar su origen o sus parámetros en la selección. Las flechas cambian el orden de la capa.

Con **Agrupar**, marcá dos o más capas del mismo sector y elegí **Crear grupo**. Seleccioná el grupo para aplicar una cadena al resultado combinado de sus capas. **Desagrupar capas** conserva sus miembros. El lienzo y la pila admiten **Ctrl+C** y **Ctrl+V** para copiar y pegar dentro de la sesión, **Ctrl+Z** para deshacer y **Ctrl+Mayús+Z** o **Ctrl+Y** para rehacer. En macOS usá ⌘.

**Imagen** abre las fuentes del sector, incluido el sketch, s0, sus fotos o sus videos. **+ Efecto** abre la paleta y la búsqueda de operadores Hydra. En **Edición manual**, las guías muestran el dibujo preparado y **Enviar a salida** muestra los cambios pendientes desde cualquier herramienta.

**Deformar** muestra los puntos del contorno. Arrastrá un punto para cambiarlo, un borde para agregar un vértice o el interior para mover toda la forma. La **Opacidad** y los parámetros de los efectos pertenecen al sector seleccionado. **Guardar sectores** actualiza la copia local de los sectores y sus archivos. **Recuperar guardados** vuelve a cargarla.

**Grabar loop** captura hasta 30 segundos de la salida o del sector seleccionado con sus efectos. **Guardar loop** termina antes. Tocá **Ver loop** en la confirmación para ir a esa grabación o **Mis loops** junto al botón de grabar para abrir la lista. **Usar** carga el video en el destino indicado arriba de la lista, sea toda la visual o la capa seleccionada en Sectores. Las grabaciones quedan en el mismo navegador y dirección de Fosfeno. **Descargar** guarda una copia que podés llevar a otra cabina con **Importar video**.

### Llevar una creación a otra cabina

En **Biblioteca → Creaciones portátiles**, **Guardar actual** crea una versión con el nombre del editor en IndexedDB. Lleva el código completo, las capas de biblioteca, los sectores dibujados, sus parámetros, el archivo visual de s0 y las fotos o videos locales de los sectores. También conserva la salida elegida, el tempo, el pulso, el pincel y la sensibilidad. La biblioteca de pistas de audio, las cámaras y las URLs externas del código se vuelven a conectar en destino.

Abrí el nombre, elegí **Descargar** y llevá el archivo `.fosfeno` en un USB. En otra cabina, **Importar archivo** lo agrega a su biblioteca. **Activar** ejecuta una composición y cambia la proyección. En un operador individual, **Insertar** lo suma al código respetando el modo de edición en vivo. Cada guardado crea una copia independiente. La descarga JavaScript sigue disponible desde el editor.


## Operación local

Descargá las carpetas y abrí `index.html` o ejecutá `python -m http.server 8000 --bind 127.0.0.1` y abrí `http://localhost:8000`. La edición web usa HTTPS para los permisos de medios. La cabina pública se puede recargar sin conexión después de la primera carga completa. Al publicar cambios, actualizá la versión de caché de `sw.js` y las URLs de recursos de la entrada cuando correspondan.

Se usa el motor **hydra-synth 1.4.0**, CodeMirror 5.65.18 y Acorn 8.15.0, incluidos localmente. Acorn mantiene las declaraciones de nivel superior entre ejecuciones de bloques. Los presets y el generador están en `src/sketches.js`. Para ejecutar las pruebas del evaluador, el generador, el audio y el ciclo de conexión de cámaras usá `node --test`. Las pruebas de cámara de esta suite usan dispositivos simulados.

## Créditos

- Hydra, de Olivia Jack y colaboradores. *Glitch River* es de Flor de Fuego y conserva la atribución del sketch. [Motor distribuido](https://github.com/hydra-synth/hydra-synth/tree/c3ba80bd82f096e0ef7a9b7022e72c04162c25c4) · [Sketch original](https://hydra.ojack.xyz/?sketch_id=flor_2) · [Catálogo de la comunidad](https://github.com/hydra-synth/hydra/blob/main/src/stores/examples.json)
- La mezcla de fuentes toma como referencias modV y projectM. El pincel incremental se inspira en el trabajo de Aaron Hertzmann sobre orientación y escala de los trazos. [modV](https://github.com/vcync/modV) · [projectM](https://github.com/projectM-visualizer/projectm) · [Painterly Rendering](https://mrl.cs.nyu.edu/publications/painterly98/)
- El código de Fosfeno se distribuye bajo GNU AGPL v3. Los sketches del catálogo oficial, incluida la pieza inicial, conservan la atribución de cada artista y la licencia CC BY-NC-SA 4.0. El uso comercial de esas piezas requiere permiso adicional del titular. [Licencia del código](LICENSE) · [Licencia del catálogo](https://creativecommons.org/licenses/by-nc-sa/4.0/)
- Las dependencias y las tipografías conservan sus licencias. [p5.js](vendor/p5/LICENSE) · [Dependencias de Patch Bay](vendor/patch-bay/THIRD-PARTY.txt) · [js-beautify](vendor/beautify/LICENSE) · [CodeMirror](vendor/codemirror/LICENSE) · [Acorn](vendor/acorn/LICENSE) · [Barlow](assets/LICENSE-Barlow.txt) · [Space Mono](assets/LICENSE-SpaceMono.txt)
