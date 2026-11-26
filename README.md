# Fosfeno 3.1.3 · Hydra en vivo

Editor de live coding y sintetizador de video con Hydra. El JavaScript del sketch genera la imagen base. Los sectores opcionales componen sus efectos encima de esa salida. Podés empezar en blanco, editar una pieza existente o generar un nuevo grafo de señales a partir de una semilla.

Al entrar sin un enlace de sketch, Fosfeno genera una pieza con una semilla aleatoria. La semilla aparece en el nombre y en el código. Los borradores se conservan y los enlaces identificados recuperan su pieza. *MULTIVERSE*, de e_e (@eerie_ear), queda en la Biblioteca con el código y la atribución originales. [Abrir el mismo sketch en Hydra](https://hydra.ojack.xyz/?sketch_id=eerie_ear_0) · [Comparación en navegador y límites](docs/paridad-hydra.md)

[Abrir el estudio](https://luzbel33.github.io/fosfeno/abrir.html?v=3.1.3) · [Abrir Mapeo](https://luzbel33.github.io/fosfeno/abrir.html?v=3.1.3&mode=mapeo) · [Abrir Glitch River de Flor de Fuego](https://luzbel33.github.io/fosfeno/abrir.html?v=3.1.3&sketch_id=flor_2) · [Ver el editor en movimiento](media/fosfeno-demo.mp4)

## Tocar una visual

Abrí **Pila** para ver la composición. **Toda la visual** contiene el fondo Hydra y lo que se aplica en pantalla completa. Cada sector reúne sus propias capas, fuentes y efectos. Tocá el nombre de una foto, un loop o un operador para ver sus controles. **Mover a…** muestra los destinos compatibles, incluida **Nueva capa** cuando corresponde. **Quitar** actúa sobre el elemento seleccionado. Podés ocultar el fondo para ver qué aportan las otras capas y volver a mostrarlo durante la sesión.

En escritorio podés cerrar cualquiera de los paneles con su **×** y recuperar espacio para la visual. **Pila**, **Código**, **Biblioteca**, **Imagen** y **Audio** abren la herramienta correspondiente. En el teléfono, **Cerrar panel** devuelve el espacio al monitor.

En **Pila**, tocá **+ Sector**, elegí una forma y arrastrá sobre la visual. Tocá **Edición en vivo** para pasar a **Edición manual**. Podés preparar un traslado, reordenar efectos o quitar una capa mientras el proyector sigue mostrando la composición anterior. **Enviar a salida** aplica los cambios. Las cámaras y el audio conectados siguen en vivo. Arrastrá la división para repartir el espacio entre la visual y las herramientas. Con teclado, enfocá la división y usá las flechas.

**Ampliar** te deja mirar la composición en la misma ventana. **Volver a editar** o **Esc** recupera la pestaña y el tamaño que estabas usando. **Proyectar** abre una ventana aparte para el público.

1. En **Código**, cambiá un valor. **Edición en vivo** empieza encendida y recuerda tu elección. La salida se actualiza tras una pausa breve al escribir. Tocá un literal numérico para afinarlo con el deslizador.
2. Elegí un sector o **Toda la visual** y tocá **+ Efecto**. Buscá un operador o mezclá una pieza de la Biblioteca. La pila muestra qué está en salida, pausado o pendiente. Al elegir un efecto podés cambiar sus parámetros, alternar su visibilidad, moverlo o quitarlo.
3. **Nueva semilla** genera una visual en la selección. **Editar**, a su lado, abre el número y la simetría. Guardá ambos para recuperar el mismo código Hydra. Con el fondo quitado, la semilla se agrega como efecto independiente. En **Mapeo** esos controles están al pie del lienzo. Si la edición en vivo está apagada, **Enviar a salida** proyecta la semilla preparada.
4. Para iniciar una sesión vacía, elegí **Pila → Nueva → Empezar en blanco**. La salida pasa a negro, incluso en modo manual. Los sketches, las composiciones y los loops guardados siguen en la biblioteca. Para cambiar sólo el fondo, usá **De fondo** junto al nombre de un sketch. **Mezclar** lo combina con lo que ya está en la selección. Las semillas ofrecen las mismas dos opciones.
5. **Autopiloto** escribe y ejecuta una semilla nueva en cada intervalo. Tocar el código devuelve el control al operador. El intervalo se elige junto al interruptor.

### Usar una escultura de Blender

En Blender, elegí **Archivo → Exportar → glTF 2.0 → glTF Binary (.glb)**. Incluí las texturas dentro del archivo y desactivá la compresión Draco. En Fosfeno, **Imagen → Archivo** conecta el modelo a s0. Desde **Pila** podés cargarlo en un sector y en **Mapeo → Archivo** podés colocarlo directamente sobre la superficie. Probá con el [Nudo de cobre](media/modelos/nudo-de-cobre.glb).

Al seleccionar el modelo, abrí **Orientación y movimiento** para encuadrarlo, girarlo o asignarle una trayectoria. **Ortográfica** mantiene las líneas paralelas y **Perspectiva** agranda las partes cercanas a la cámara. Los proyectos conservan el archivo original y su configuración. La animación se controla desde Fosfeno. Los clips propios de Blender quedan fuera de la reproducción. El visor local usa Three.js r187 y su GLTFLoader. [Código de Three.js](https://github.com/mrdoob/three.js/tree/r187) · [Licencia MIT](vendor/three/LICENSE)

### Leer, ajustar y ejecutar código

**Código** sigue la selección de la pila. El selector de destino indica qué estás leyendo y permite pasar del fondo al sketch de una capa, a un operador o a sus definiciones. Con el fondo vacío, elegí la visual mezclada para editar su propio programa. En Mapeo, **Ver definición** muestra los datos del objeto. Si una cara o un recorte usa Hydra, **Código de origen** lleva a su señal. **Volver a Mapeo** recupera la superficie.

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

En **Visuales**, tocá **Editar** en la ficha o hacé clic derecho y elegí **Editar parámetros**. Para retocar una instancia que ya está en la mezcla, elegila en la **Pila** del Estudio o de Mapeo. En vivo, cada deslizador cambia esa instancia mientras ves la composición. En modo manual, usá **Preparar cambios** y luego **Enviar a salida**. Una visual que todavía está en la biblioteca se puede probar en la miniatura antes de asignarla. **Guardar variante** crea una copia.

La línea **Destino** indica dónde se usará la próxima pieza. **Visuales** permite buscar sketches propios, preinstalados y del catálogo por nombre o autor. En **Semillas** podés escribir enteros largos y decimales con signo, coma o punto. `-012,3750` y `-12.375` recuperan la misma visual con la misma simetría. **Aleatoria** sortea otro número. Después podés aplicarlo al destino o mezclarlo. **Loops** muestra la colección de videos. **Proyectos** guarda e importa composiciones y operadores.

- **Mezclar** alterna un sketch en toda la visual o en el sector seleccionado. El control debajo de la pieza regula su intensidad. Cada mezcla tiene sus propios buffers Hydra, incluido el feedback. Los sectores leen las entradas s0 a s3. Los sketches que abren dispositivos o cargan recursos de manera asíncrona se ejecutan desde el código principal.
- En **Visuales de la biblioteca** están el `flor_2` original, patches multibuffer, osciladores, geometrías escritas con GLSL y tratamientos para fuentes en vivo.
- **Comunidad Hydra → Abrir catálogo** lee los ejemplos del repositorio oficial. Sin conexión usa la copia guardada o los 58 ejemplos incluidos. Buscá por nombre, autor o identificador. Un enlace con `?sketch_id=` puede abrir cualquiera de los ejemplos incluidos. Los enlaces con `?code=` cargan el código en el editor y esperan a que pulses **Ejecutar**.
- **Guardar** conserva una copia local. También podés importar o descargar JavaScript. El botón **Abrir en Hydra** lleva el código actual al editor oficial en un enlace.
- Los enlaces con JavaScript y los archivos importados requieren una primera ejecución explícita. Una edición posterior de un borrador local previamente activado puede volver a proyectarse en vivo.

## Señal y proyección

En **Imagen**, **Webcam** pide acceso a la cámara predeterminada. Abrí la cabina por HTTPS o localhost y permití el acceso en el navegador. Podés elegir cualquier cámara que el navegador identifique en el panel. En algunos equipos los nombres aparecen después de dar permiso. La vista previa confirma qué cámara llega a `s0`. **Desconectar cámara** libera la pista.

Con **Toda la visual** como destino, **Mezclar al conectar** agrega una fuente a la pila. Se mezcla al 65 % sobre un fondo visible y ocupa el cuadro completo al ocultar o quitar el fondo. **Ver sólo la fuente** oculta el fondo y conserva su código. Si tu sketch ya usa `s0`, la conexión automática respeta esa ruta. **Mezclar con el sketch** agrega la fuente a la pila de forma explícita.

Para proyectar una cámara sólo dentro de una figura, elegí la capa de ese sector y asignale **s0**. **Quitar** sobre la fuente retira esa ruta. El dispositivo sigue disponible para otras capas y para el código hasta que lo desconectes. Una foto, un video o un loop asignado como archivo viaja con su capa y mantiene su reproductor al moverlo, aunque después conectes otra cosa a `s0`. Desde código, `await s1.initCam(0)` conecta la primera cámara a `s1` y `s1.clear()` la libera. Los índices empiezan en cero y las cuatro entradas admiten cámaras.

En **Audio** podés activar el micrófono, importar pistas o grabar una toma. Cada pista admite bucle, volumen y descarga. Podés superponer varias. La biblioteca se guarda en IndexedDB, en este navegador. Hydra arranca con cuatro bandas en `a.fft` y un tempo de 30 BPM. Usá `a.setBins(n)`, `a.settings[i]`, `a.setSmooth(v)`, `a.setCutoff(v)` y `a.setScale(v)` para ajustar la respuesta. En reposo las bandas arrancan en cero. Para generar un ritmo de forma explícita, activá **Pulso interno sin audio** y ajustá **Tempo**. Una entrada activa tiene prioridad incluso durante sus silencios.

Para usar p5 como entrada, creá `p = new P5()`, dibujá en `p`, conectá `s1.init({src: p.canvas})` y ejecutá `src(s1).out()`. Para recibir video de otra instancia de Hydra, usá `s0.initStream("nombre")`. En la emisora, `pb.setName("nombre")` habilita compartir el canvas por WebRTC. `pb.list()` abre el descubrimiento de pares y `pb.disconnect()` cierra la conexión de Fosfeno. Para una sala propia, ejecutá primero `pb.connect(urlDelServidor, nombreDeSala)` en las dos instancias.

En Windows, conectá el proyector y usá **Win + P → Extender**. Tocá **Proyectar** en Estudio o Mapeo. Si el navegador detecta pantallas extendidas y admite administración de ventanas, el primer toque pide permiso. Con un solo monitor externo, Fosfeno lleva la salida allí e intenta ponerla en pantalla completa. Con varios destinos posibles, elegí uno por nombre en la cabina. **Elegir pantalla…** permite cambiar esa elección, que queda guardada en este navegador. **Ubicar a mano** desactiva la colocación automática.

Podés abrir Mapeo y preparar la mesa mientras la salida del Estudio sigue en vivo. Al tocar **Proyectar** desde Mapeo, la misma ventana pasa a mostrar el mapa. Al cerrar Mapeo, esa ventana vuelve al Estudio. Si abriste la ventana por primera vez desde Mapeo, se cierra junto con esa sesión.

Si aparece una sola pantalla, revisá la conexión y seleccioná **Extender** en Windows. Si el navegador carece de la API o denegaste el permiso, arrastrá la salida al escritorio extendido. Si abrió la salida como pestaña de la cabina, arrastrá esa pestaña fuera de la ventana para separarla. Hacé doble clic en la imagen pública cuando el navegador requiera un gesto para entrar en pantalla completa, o para salir de ella. [Administración de pantallas](https://developer.chrome.com/docs/capabilities/web-apis/window-management) · [Permiso de pantalla completa automática en Chrome](https://developer.chrome.com/release-notes/127?hl=en)

La ventana pública arranca con la imagen sola. Para una presentación de live coding, activá **Proyectar código** en el selector de salida o en **Ajustes de salida**. Se muestra el texto que estás editando, incluso antes de ejecutarlo. Apagá el control para volver a la imagen limpia.

**Pinceladas** reconstruye la imagen de entrada con trazos orientados según los bordes. Podés ajustar grosor, velocidad y definición final. En el sentido normal, al 100 % llega a la imagen original. **A la inversa** parte de la imagen original y la simplifica. Con la definición al 0 % termina en dos tonos.

### Música programable

**Crear música** está en **Código** y **Audio**. Escribí una pista por línea, con notas como `C2`, acordes como `C4+Eb4+G4`, silencios `.` y golpes `x`. Ajustá `bpm`, `step`, instrumento, `vol`, `gate`, `attack`, `release`, `cutoff` y `pan`. **Reproducir** hace sonar la partitura. **Aplicar música** toma cambios válidos en el próximo pulso. Si hay un error, la partitura que ya suena sigue tocando.

El sintetizador usa Web Audio. Hydra recibe la música en `a.fft`, además de las demás entradas activas. `musicBeat()` da la posición de la partitura en pulsos y **Tempo Hydra** sincroniza el BPM del sketch. La guía incluye **Prisma nocturno**, con partitura y visual que podés copiar por separado. **Guardar borrador** guarda la partitura localmente. Las composiciones `.fosfeno` incluyen la partitura y **Descargar partitura** genera un `.fosmus` editable aparte.

### Mapeo con proyector

Al abrir **Mapeo**, la mesa empieza en **Lienzo**, con el pincel listo y la señal del Estudio apagada. Podés dibujar, agregar fotos o loops y abrir la salida directamente. Una sesión nueva permite recuperar un mapa guardado con **Recuperar mapa**. Alternar entre las mesas conserva el trabajo de la sesión.

Con **Línea**, arrastrá para una recta o tocá varios puntos y elegí **Finalizar**. Para cerrar el contorno, tocá el primer punto o elegí **Cerrar contorno**. Mantené Mayús para alinear tramos a 45° y usá Esc para cancelar el trazado. Para corregir una línea, seleccionala en **Editar trazos → Editar puntos**.

Si querés pintar sobre una referencia física, elegí **Conectar cámara** o cargá una **Foto de referencia**. Mapeo puede reutilizar la cámara activa del Estudio cuando se lo pedís. **Superficie** muestra la referencia con tus trazos, **Lienzo** permite seguir editando con la referencia oculta y **Composición** muestra la mezcla. Elegí formato y usá **Calibrar** cuando quieras alinear la proyección con la superficie. Marcá los centros de las cuatro cruces en orden y recalibrá si movés el equipo. La flecha junto a **Proyectar** permite elegir pantalla. Estudio y Mapeo recuerdan la misma elección.

En **Pila de proyección → Objetos del mapa**, elegí un objeto para editar su posición, nombre, opacidad y orden. Las fotos, los videos y los loops admiten recorte rectangular u ovalado. **Cambiar archivo** y **Cambiar por loop** conservan la colocación. En un grupo de trazos, **Editar trazos** permite seleccionar y quitar un trazo individual. Con **Copiar a un sector Hydra… → Crear sector oculto**, podés preparar efectos sobre una copia y seguir trabajando con el original. Al copiar trazos, el sector recibe una imagen transparente.

**Muestras** suma uno de tres diseños de trazos editables al lienzo. Conserva tus objetos y la calibración, y **Deshacer** retira la muestra completa. Desde el selector también podés descargar cada diseño como `.fosmap`.

En **Forma → Cubo 3D / Pirámide 3D**, tocá una cara en el lienzo o elegila en la pila. **Todas** aplica el mismo material a la figura completa. Podés pintar cada cara con un color, un archivo, un loop o la señal en vivo de Hydra. Al elegir un sector como material se usa el recorte correspondiente de la composición Hydra. En **Orientación y movimiento**, los tres ejes ajustan la pose. Activá **Continua** para elegir eje y velocidad de giro, o elegí una trayectoria y ajustá su recorrido y duración. Los materiales y el movimiento se guardan con el mapa.

En la **Pila de proyección**, **Estudio Hydra** muestra el fondo, los sectores y sus capas. Seleccioná un sector o una capa y abrí **Añadir efecto** o **Biblioteca**. Los botones marcados indican qué está activo en ese destino. Podés buscar un operador Hydra por nombre, por ejemplo `hue`, mezclar varios sketches o elegir **Cambiar fuente** para cargar un archivo. Al tocar la fila de un efecto aparecen los controles para ajustarlo, moverlo, pausarlo o quitarlo.

La barra de arriba conserva la misma sesión al pasar a **Código**, **Audio**, **Biblioteca** o **Pila**. Tocá **Mapeo** para volver a la superficie. **Sólo sectores** envía las formas con sus transparencias, **Con fondo** suma el sketch completo y **Apagado** deja los objetos del mapa. **Apagón** pone en negro la salida. **Proyectar código** muestra el texto que estás editando.

**Guardar mapa** guarda una copia local. **Recuperar mapa** carga su código y sus sectores junto al pincel y la calibración. **Descargar** genera un `.fosmap` con el código, los sectores, sus archivos, los trazos y la calibración. **Importar** permite abrirlo en otra computadora. Volvé a conectar las cámaras y las entradas en vivo al recuperar un mapa.

La calibración corrige la perspectiva de una superficie plana usando cuatro puntos. Varios recortes pueden ocupar zonas de esa superficie. Cada cara con una profundidad distinta requiere su propia calibración. Este modo tampoco mide profundidad ni sigue objetos que se mueven.

### Sectores

**Libre** sigue el recorrido del puntero. Seleccioná un sector en la lista o sobre la imagen. **Código** en la fila edita ese sector. **Biblioteca** e **Imagen** trabajan sobre el sector seleccionado. **Toda la visual** apunta a la imagen base. Los sectores de adelante aparecen arriba y el ojo alterna su visibilidad.

**Código** abre el programa del elemento seleccionado. Con un sector o grupo activo podés recorrer sus capas, sketches de biblioteca y operadores desde el selector de arriba. **Fondo** abre el sketch global, incluso cuando lo quitaste para trabajar sólo con capas. Los cambios de código pertenecen a esa instancia y respetan **Edición en vivo** o **Enviar a salida**. Las fuentes, los pinceles y las formas nativas muestran su configuración en JSON. La flecha de descarga guarda el programa o la configuración que tenés delante. Desde un objeto de Mapeo, **Volver a Mapeo** te devuelve al lienzo.

Arrastrá desde el interior de un sector para moverlo. **Deformar** edita sus puntos. **Estilo** permite activar un relleno y un borde por separado, elegir sus colores o escribirlos en hexadecimal y ajustar el grosor del borde.

Con **+ Capa**, agregá una imagen, código o una cadena de efectos independiente dentro del mismo contorno. Desplegá el sector para ver cada fuente por nombre y los efectos de cada capa. Tocá un nombre para editar sus parámetros. Las flechas cambian el orden dentro de la pila. **Mover a…** permite trasladar, por ejemplo, la fuente de pantalla completa a **Rectángulo → Nueva capa**. El archivo sigue reproduciéndose dentro del rectángulo y el resto del escenario vuelve a mostrar el fondo.

En Estudio y Mapeo, **Buscar en pila…** acepta nombres de sectores y archivos, tipos de fuente y efectos. Por ejemplo, `loop` muestra cada clip con su capa y sector. Al borrar la búsqueda o tocar **Esc** volvés a la selección y el plegado anteriores. La flecha junto al sector permite plegarlo y leer qué contiene.

Con **Agrupar**, marcá dos o más capas del mismo sector y elegí **Crear grupo**. Seleccioná el grupo para aplicar una cadena al resultado combinado de sus capas. **Desagrupar capas** conserva sus miembros. Sobre el lienzo o en la pila, el clic derecho, **Acciones** o **Mayús + F10** abren las operaciones disponibles para esa selección. **Ctrl+D** duplica, **Ctrl+C** y **Ctrl+V** copian y pegan en la sesión, **Ctrl+Z** deshace y **Ctrl+Mayús+Z** o **Ctrl+Y** rehace. **Atajos de teclado**, al pie del menú, muestra las teclas de cada vista. En macOS usá ⌘.

**Imagen** abre las fuentes del sector, incluido el sketch, s0, sus fotos o sus videos. **+ Efecto** abre la paleta y la búsqueda de operadores Hydra. En **Edición manual**, las guías muestran el dibujo preparado y **Enviar a salida** muestra los cambios pendientes desde cualquier herramienta.

**Deformar** muestra los puntos del contorno. Arrastrá un punto para cambiarlo, un borde para agregar un vértice o el interior para mover toda la forma. La **Opacidad** y los parámetros de los efectos pertenecen al sector seleccionado. **Guardar sectores** actualiza la copia local de los sectores y sus archivos. **Recuperar guardados** vuelve a cargarla.

**Grabar loop** captura hasta 30 segundos de la salida o del sector seleccionado con sus efectos. **Guardar loop** termina antes. **Mis loops** abre **Biblioteca → Loops**. Desde una capa, **Loop** abre un selector que conserva el destino mientras elegís. **Ver** reproduce una vista previa. **Usar** asigna el video guardado e **Importar y usar** permite abrir un archivo nuevo en ese destino. La grabación queda en este navegador. **Descargar** guarda una copia para otra cabina.

Los GIF se animan como archivo visual en el Estudio, en los sectores y en los objetos de Mapeo. También podés importarlos a **Loops**, previsualizarlos y reutilizarlos. Los archivos portátiles conservan el GIF original. El decodificador incluido para uso sin conexión es [omggif 1.0.10](https://github.com/deanm/omggif), licencia MIT.

### Llevar una creación a otra cabina

En **Biblioteca → Proyectos**, **Guardar composición** crea una versión con el nombre del editor en IndexedDB. Lleva el código completo, los sectores, las capas, sus parámetros, el archivo visual de `s0` y los medios locales asignados a la pila. También conserva la salida elegida, el tempo, el pulso, el pincel y la sensibilidad. Las pistas de audio, las cámaras y los recursos externos del código se vuelven a conectar en destino.

Al activar proyectos anteriores, Fosfeno puede reconstruir la mezcla que antes insertaba el panel. Si el proyecto guardó esa opción y hay una única cadena de salida sin realimentación con el sufijo exacto `.blend(src(s0), 0.65)` antes de `.out()`, la mezcla pasa a ser una fuente movible cuando coincide con la salida seleccionada. El formato anterior guardaba el fragmento sin indicar quién lo escribió, así que una cadena idéntica escrita a mano también coincide. Otras transformaciones de `s0` siguen en el código del usuario. La activación conserva el archivo original.

Abrí el nombre, elegí **Descargar** y llevá el archivo `.fosfeno` en un USB. En otra cabina, **Importar archivo** lo agrega a su biblioteca. **Activar** ejecuta una composición y cambia la proyección. En un operador individual, **Insertar** lo suma al código respetando el modo de edición en vivo. Cada guardado crea una copia independiente. La descarga JavaScript sigue disponible desde el editor.


## Operación local

Descargá las carpetas y abrí `index.html` o ejecutá `python -m http.server 8000 --bind 127.0.0.1` y abrí `http://localhost:8000`. La edición web usa HTTPS para los permisos de medios. La cabina pública se puede recargar sin conexión después de la primera carga completa. Al publicar cambios, actualizá la versión de caché de `sw.js` y las URLs de recursos de la entrada cuando correspondan.

Se usa el motor **hydra-synth 1.4.0**, CodeMirror 5.65.18 y Acorn 8.15.0, incluidos localmente. Acorn mantiene las declaraciones de nivel superior entre ejecuciones de bloques. Los presets y el generador están en `src/sketches.js`. Para ejecutar las pruebas del evaluador, el generador, el audio y el ciclo de conexión de cámaras usá `node --test`. Las pruebas de cámara de esta suite usan dispositivos simulados.

## Créditos

- Hydra, de Olivia Jack y colaboradores. *Glitch River* es de Flor de Fuego y conserva la atribución del sketch. [Motor distribuido](https://github.com/hydra-synth/hydra-synth/tree/c3ba80bd82f096e0ef7a9b7022e72c04162c25c4) · [Sketch original](https://hydra.ojack.xyz/?sketch_id=flor_2) · [Catálogo de la comunidad](https://github.com/hydra-synth/hydra/blob/main/src/stores/examples.json)
- La mezcla de fuentes toma como referencias modV y projectM. El pincel incremental se inspira en el trabajo de Aaron Hertzmann sobre orientación y escala de los trazos. [modV](https://github.com/vcync/modV) · [projectM](https://github.com/projectM-visualizer/projectm) · [Painterly Rendering](https://mrl.cs.nyu.edu/publications/painterly98/)
- El código de Fosfeno se distribuye bajo GNU AGPL v3. Los sketches del catálogo oficial, entre ellos *MULTIVERSE* y *Glitch River*, conservan la atribución de cada artista y la licencia CC BY-NC-SA 4.0. El uso comercial de esas piezas requiere permiso adicional del titular. [Licencia del código](LICENSE) · [Licencia del catálogo](https://creativecommons.org/licenses/by-nc-sa/4.0/)
- Las dependencias y las tipografías conservan sus licencias. [p5.js](vendor/p5/LICENSE) · [Dependencias de Patch Bay](vendor/patch-bay/THIRD-PARTY.txt) · [js-beautify](vendor/beautify/LICENSE) · [CodeMirror](vendor/codemirror/LICENSE) · [Acorn](vendor/acorn/LICENSE) · [Barlow](assets/LICENSE-Barlow.txt) · [Space Mono](assets/LICENSE-SpaceMono.txt)
