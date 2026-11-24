const hydraExplanations = {
  osc:'Genera franjas. La frecuencia cambia su densidad y sync su desplazamiento.',
  shape:'Dibuja un polígono. Ajustá sus lados, radio y suavidad del borde.',
  solid:'Genera un color uniforme con canales rojo, verde, azul y alfa.',
  noise:'Genera ruido continuo. La escala cambia el tamaño de las manchas.',
  voronoi:'Distribuye celdas alrededor de puntos móviles.', gradient:'Crea una rampa de color.',
  src:'Lee la imagen de la entrada o salida indicada.', out:'Escribe la cadena en un buffer. Sin argumento usa o0.',
  render:'Elige qué buffer se muestra. Sin argumento presenta los cuatro.',
  blend:'Mezcla dos imágenes según la proporción indicada.', layer:'Superpone la segunda imagen usando su transparencia.',
  diff:'Muestra la diferencia de color entre dos imágenes.', add:'Suma el color de otra imagen.', sub:'Resta el color de otra imagen.',
  mult:'Multiplica los canales de color de ambas imágenes.', mask:'Usa la luminosidad de otra imagen como transparencia.',
  rotate:'Gira las coordenadas. El primer valor es el ángulo y el segundo, la velocidad.',
  scale:'Cambia el tamaño. Por encima de 1 acerca la imagen.', kaleid:'Pliega el plano en sectores simétricos.',
  repeat:'Repite la imagen en filas y columnas.', repeatX:'Repite la imagen horizontalmente.', repeatY:'Repite la imagen verticalmente.',
  pixelate:'Reduce el detalle a una grilla de bloques.', scrollX:'Desplaza horizontalmente la imagen.', scrollY:'Desplaza verticalmente la imagen.',
  scroll:'Desplaza las coordenadas en ambos ejes.', modulate:'Usa otra imagen para desplazar las coordenadas de esta.',
  modulateRotate:'Usa otra imagen para variar el giro.', modulateScale:'Usa otra imagen para variar el tamaño.',
  modulateKaleid:'Usa otra imagen para variar los pliegues.', modulatePixelate:'Usa otra imagen para cambiar el tamaño de los bloques.',
  modulateRepeat:'Usa otra imagen para variar la repetición.', modulateHue:'Desplaza las coordenadas según las diferencias de color.',
  color:'Ajusta cada canal de color.', colorama:'Redistribuye el color entre canales.', hue:'Rota los tonos.',
  invert:'Invierte el color según la intensidad.', saturate:'Ajusta la saturación.', brightness:'Ajusta el brillo.',
  contrast:'Ajusta el contraste.', posterize:'Reduce la cantidad de niveles de color.',
  thresh:'Separa claros y oscuros a partir de un umbral.', luma:'Vuelve transparentes las zonas por debajo del umbral.',
  shift:'Desplaza los valores de los canales.', setFunction:'Registra una función GLSL para usarla en las cadenas Hydra.',
  setResolution:'Fija el ancho y el alto del render.', initCam:'Conecta una cámara a esta entrada.',
  initScreen:'Conecta una captura de pantalla.', sin:'Calcula una onda senoidal.', cos:'Calcula una onda cosenoidal.'
}
function describeScoreLine(line) {
  const s = line.trim()
  if (!s || s.startsWith('//')) return ''
  const names = [...s.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)].map(m=>m[1])
  const notes = [...new Set(names.filter(n=>Object.hasOwn(hydraExplanations,n)))].map(n=>hydraExplanations[n])
  const declaration = s.match(/^(?:const |let |var )?([A-Za-z_$][\w$]*)\s*=(?!=)/)
  if (declaration) notes.unshift('Define '+declaration[1]+(s.includes('=>') ? ' como una función.' : ' con el valor de la expresión.'))
  const fn = s.match(/^function\s+(\w+)/)
  if (fn) notes.unshift('Define la función '+fn[1]+' para usarla desde otras líneas.')
  if (/\ba\.fft\[\d+\]/.test(s)) notes.push('La banda de audio '+s.match(/a\.fft\[(\d+)\]/)[1]+' modifica el valor en vivo.')
  if (/\btime\b/.test(s)) notes.push('time varía en segundos mientras corre la visual.')
  if (notes.length) return notes.join(' ')
  if (/^[)\]},;]+$/.test(s)) return 'Cierra la expresión o el bloque anterior.'
  if (/^return\b/.test(s)) return 'Devuelve el resultado de esta expresión a quien llamó la función.'
  if (/^(vec[234]|float|int|mat[234])\s+(\w+)/.test(s)) return 'Calcula '+s.match(/^\w+\s+(\w+)/)[1]+' dentro del shader de cada píxel.'
  if (/^(name|type|inputs|glsl)\s*:/.test(s)) return 'Configura '+s.split(':')[0]+' del operador personalizado.'
  if (/^(for|while)\b/.test(s)) return 'Repite el bloque según la condición escrita.'
  if (/^if\b/.test(s)) return 'Ejecuta el bloque cuando se cumple la condición.'
  if (names.length) return 'Llama a '+[...new Set(names)].join(', ')+' con las expresiones entre paréntesis.'
  return 'Esta línea forma parte de la expresión que la rodea.'
}
class CodeGuide {
  constructor(editor) {
    this.editor = editor
    this.widgets = []
    const button = document.getElementById('lineGuide')
    button.onclick = () => {
      this.on = !this.on
      button.setAttribute('aria-pressed',!!this.on)
      this.paint()
      document.getElementById('helpDialog').close()
    }
    editor.on('changes',() => {
      clearTimeout(this.timer)
      if (this.on) this.timer = setTimeout(()=>this.paint(),150)
    })
  }
  paint() {
    this.editor.operation(()=>{
      this.widgets.forEach(widget=>widget.clear())
      this.widgets = []
      if (!this.on) return
      this.editor.eachLine(line=>{
        const note = describeScoreLine(line.text)
        if (!note) return
        const el = document.createElement('div')
        el.className='line-note'; el.textContent='// '+note
        this.widgets.push(this.editor.addLineWidget(line,el,{coverGutter:false}))
      })
    })
  }
  annotatedCopy() {
    const notes = this.editor.getValue().split('\n').flatMap((line,i)=>{
      const note = describeScoreLine(line)
      return note ? ['// '+(i+1)+' · '+note] : []
    })
    return this.editor.getValue()+'\n\n// Guía de líneas · Fosfeno\n'+notes.join('\n')
  }
}
