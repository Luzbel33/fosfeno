// Match Gallery.setSketch, including its license line and final newline.
function gallerySketch(row) {
  const license = '// licensed with CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/'
  const raw = decodeURIComponent(atob(row.code))
  const comments = raw.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line.startsWith('//') && line !== license)
    .map((line) => line.slice(2).trim())
  return {
    id: row.sketch_id,
    name: comments[0]?.slice(0, 85) || row.sketch_id,
    group: [comments[1]?.slice(0, 45), row.sketch_id].filter(Boolean).join(' · '),
    code: raw.includes(license) ? raw : license + '\n' + raw + '\n'
  }
}
const HYDRA_GALLERY = HYDRA_EXAMPLES.map(gallerySketch)
// These are editable starting scores. No visual is drawn downstream of the operator's .out().
const SKETCHES = [
  { ...HYDRA_GALLERY.find((s) => s.id === 'eerie_ear_0'), name: 'MULTIVERSE', group: 'e_e · @eerie_ear' },
  {
    id: 'nacar',
    name: 'Nácar en fuga',
    group: 'Interferencia',
    code: `// Nácar en fuga
// Subí los pliegues para multiplicar los reflejos.
const pliegues = 5
const pulso = () => 0.06 + a.fft[0] * 0.16

osc(7, 0.08, 0.7)
  .modulate(noise(2.4, 0.18), 0.64)
  .rotate(0.3, 0.035)
  .out(o1)

osc(68, -0.045, 1.28)
  .modulateRotate(src(o1), 2.8)
  .kaleid(pliegues)
  .modulate(noise(2, 0.11), pulso)
  .modulate(src(o0), 0.003)
  .mult(osc(6, 0.04, 1.6).rotate(1.2), 0.72)
  .color(1.14, 0.73, 1.1)
  .blend(src(o0).scale(1.014), 0.45)
  .out(o0)

render(o0)`
  },
  { ...HYDRA_GALLERY.find((s) => s.id === 'flor_2'), name: 'Glitch River', group: 'Flor de Fuego' },
  {
    id: 'abismo',
    name: 'Abismo logarítmico',
    group: 'Coordenadas',
    code: `// La distancia se convierte en profundidad. Probá otros radios.
setFunction({
  name: 'pozo', type: 'coord',
  inputs: [{ name: 'giro', type: 'float', default: 0.24 }],
  glsl: \`vec2 p = (_st - 0.5) * vec2(resolution.x/resolution.y, 1.);
    float z = -log(max(length(p), 0.001));
    return vec2(atan(p.y, p.x)/6.28318 + z*giro, z*0.42 - time*0.07);\`
})

osc(26, 0.035, 1.6)
  .modulate(noise(4, 0.18), 0.20)
  .mult(shape(4, 0.58, 0.16).repeat(9, 4), 0.78)
  .pozo(() => 0.20 + 0.09 * Math.sin(time * 0.19))
  .blend(src(o0).scale(1.02), 0.38)
  .out(o0)`
  },
  {
    id: 'placas',
    name: 'Placas de Chladni',
    group: 'Geometría',
    code: `// Dos modos de vibración dibujan líneas nodales.
setFunction({
  name: 'placa', type: 'src',
  inputs: [{name:'m',type:'float',default:5}, {name:'n',type:'float',default:3}],
  glsl: \`vec2 p = (_st-0.5)*3.14159*2.;
    float f = sin(m*p.x)*sin(n*p.y) + cos(time*.31)*sin(n*p.x)*sin(m*p.y);
    vec3 c = .5+.5*cos(vec3(.4,2.4,4.4)+4.*f+time*.12);
    return vec4(c*(.12+.88*exp(-5.*abs(f))),1.);\`
})

placa(() => 4 + Math.sin(time * 0.21), 3)
  .modulateRotate(noise(2, 0.08), 0.33)
  .blend(src(o0).scale(1.006), 0.52)
  .out(o0)`
  },
  {
    id: 'eco',
    name: 'Cámara de ecos',
    group: 'Feedback',
    code: `// o1 guarda la chispa; o0 la propaga a través del tiempo.
shape(3, 0.19, 0.018)
  .diff(shape(3, 0.17, 0.012))
  .rotate(0, 0.16)
  .scrollX(() => 0.12 * Math.sin(time * 0.31))
  .mult(osc(14, 0.08, 1.7))
  .out(o1)

src(o0).scale(1.016).rotate(0.019)
  .modulate(noise(3, 0.08), 0.009)
  .brightness(-0.019)
  .add(src(o1).kaleid(5), 0.85)
  .out(o0)`
  },
  {
    id: 'cintas',
    name: 'Cintas de moiré',
    group: 'Interferencia',
    code: `// Dos tramas rivales producen una tercera que parece despegarse.
const trama = (n, giro) => osc(n, 0.025, 1.45)
  .rotate(giro).modulate(noise(2.6, 0.1), 0.28)

trama(69, 0.35)
  .diff(trama(71, () => 0.42 + Math.sin(time * 0.15) * 0.12))
  .modulateScale(gradient(0.17), 0.9)
  .saturate(1.9)
  .out(o0)`
  },
  {
    id: 'cristal',
    name: 'Cristal blando',
    group: 'Simetría',
    code: `// Cada celda dobla los planos de su vecina.
voronoi(7, 0.28, 0.45)
  .modulateScale(osc(4, 0.06), 0.43)
  .out(o2)

osc(24, 0.05, 1.8)
  .modulate(src(o2), () => 0.22 + a.fft[0] * 0.4)
  .kaleid([3, 5, 7, 5].smooth(0.8).fast(0.12))
  .diff(src(o2).rotate(0.7).color(0.42, 0.42, 0.42))
  .blend(src(o0).scale(1.012), 0.52)
  .out(o0)`
  },
  {
    id: 'reaccion',
    name: 'Reacción en cadena',
    group: 'Feedback',
    code: `// Las membranas nacen del error entre generaciones.
noise(3.1, 0.13)
  .sub(noise(3.1, 0.13).scrollX(0.014))
  .contrast(7)
  .mult(osc(9, 0.07, 1.8))
  .out(o1)

src(o0).modulateRotate(src(o1), 0.056)
  .scale(1.008).color(0.985, 0.973, 0.993)
  .diff(src(o1).kaleid(4).color(0.36, 0.36, 0.36))
  .out(o0)`
  },
  {
    id: 'sutura',
    name: 'Sutura magnética',
    group: 'Geometría',
    code: `// Rotá dos campos a velocidades opuestas.
osc(80, 0.03, 0.8)
  .modulateScale(osc(3, 0.12).rotate(1.57), 1.1)
  .rotate(0.1, 0.02)
  .out(o1)

src(o1)
  .modulateRotate(src(o1).rotate(1.57), 1.8)
  .diff(src(o1).scale(0.97).color(0.52, 0.52, 0.52))
  .color(0.5, 0.94, 1.3)
  .rotate(0, -0.022)
  .out(o0)`
  },
  {
    id: 's0',
    name: 'Espejo de la pista',
    group: 'Entrada s0',
    source: true,
    code: `// Conectá una foto, video o webcam en Señal → Imagen.
src(s0).saturate(1.5).contrast(1.12).out(o1)

src(o1).kaleid(4)
  .modulateRotate(src(o1), () => 0.3 + a.fft[0])
  .blend(src(o0).scale(1.018), 0.48)
  .out(o0)

render(o0)`
  },
  {
    id: 'tinta',
    name: 'Tinta transmitida',
    group: 'Entrada s0',
    source: true,
    code: `// En Señal → Imagen elegí Pinceladas para repintar s0.
src(s0)
  .diff(src(s0).scrollX(0.008))
  .contrast(3).out(o1)

src(s0).modulate(src(o1), 0.16)
  .mult(osc(7, 0.07, 1.4), 0.36)
  .add(src(o1).color(0.2, 1.2, 1.1), 0.28)
  .blend(src(o0).scale(1.007), 0.33)
  .out(o0)`
  },
  {
    id: 'matriz',
    name: 'Matriz de cuatro',
    group: 'Ruteo',
    code: `// Escuchá el proceso mirando los cuatro buffers a la vez.
osc(18, 0.06, 1.55).out(o0)
noise(3, 0.18).modulate(src(o0), 0.12).out(o1)
src(o0).modulateRotate(src(o1), 2.6).out(o2)
src(o2).kaleid(6).blend(src(o3).scale(1.022), 0.63).out(o3)

render() // Cambiá a render(o3) para proyectar la mezcla.`
  }
]

const MIRRORS = {
  espejoX:
    "setFunction({name:'espejoX', type:'coord', inputs:[], glsl:'return vec2(abs(_st.x-0.5)*2.0, _st.y);'})",
  espejoY:
    "setFunction({name:'espejoY', type:'coord', inputs:[], glsl:'return vec2(_st.x, abs(_st.y-0.5)*2.0);'})"
}
const OPERATORS = [
  ['Espejo X', '.espejoX()', 'Refleja de izquierda a derecha', 'espejoX'],
  ['Espejo Y', '.espejoY()', 'Refleja de arriba abajo', 'espejoY'],
  ['Caleidoscopio', '.kaleid(6)', 'Forma seis sectores simétricos'],
  ['Teselar', '.repeat(3, 2)', 'Repite la imagen en una grilla'],
  ['Girar', '.rotate(0, 0.08)', 'Rota la imagen con el tiempo'],
  ['Modular', '.modulate(noise(3, 0.14), 0.16)', 'Deforma la imagen con ruido'],
  ['Realimentar', '.blend(src(o0).scale(1.012), 0.55)', 'Mezcla un eco del cuadro anterior'],
  ['Interferencia', '.diff(osc(27, 0.05, 1.3).rotate(0.76))', 'Cruza la imagen con franjas'],
  ['Graves', '.scale(() => 1 + a.fft[0] * 0.30)', 'Hace zoom según el audio'],
  ['Mouse', '.rotate(() => mouse.x / width * 1.5)', 'Gira al mover el puntero'],
  ['Cruzar s0', '.blend(src(s0), 0.52)', 'Mezcla la cámara, foto o video'],
  ['Posterizar', '.posterize(7, 0.7)', 'Reduce los tonos de color']
]

// Generate the actual orbit-trap source into the score. It travels with the .js
// and can be edited, re-registered or removed in any Hydra editor.
function orbitInk(rounds, radius) {
  return [
    'setFunction({',
    "  name: 'tintaOrbital', type: 'src',",
    "  inputs: [{name:'zoom',type:'float',default:2.3},",
    "           {name:'torsion',type:'float',default:0.38}],",
    '  glsl: `vec2 p=(_st-.5)*zoom*vec2(resolution.x/resolution.y,1.);',
    '    float d=2., peso=0., fase=0.;',
    '    for(int i=0;i<' + rounds + ';i++){',
    '      float n=float(i);',
    '      float a=torsion+.12*sin(time*.16+n);',
    '      p=mat2(cos(a),sin(a),-sin(a),cos(a))*abs(p);',
    '      p=p/clamp(dot(p,p),.30,1.65)-vec2(.91,.64+.1*sin(time*.20));',
    '      float arco=abs(length(p)-' + radius.toFixed(3) + ');',
    '      if(arco<d){d=arco;fase=n*.63+atan(p.y,p.x);}',
    '      peso+=exp(-arco*7.)*.13;',
    '    }',
    '    vec3 luz=.54+.46*cos(fase+time*.11+vec3(.28,2.3,4.65));',
    '    vec3 c=luz*(.12*peso+exp(-d*38.)+.34*exp(-abs(d-.056)*110.));',
    '    return vec4(c+vec3(.48,.36,.25)*exp(-d*170.),1.);`',
    '})'
  ].join('\n')
}

// A seed builds a signal graph, not an image. Its parameters and routing are the exported score.
function growSketch(seed, symmetry = 'libre') {
  let v = seed >>> 0
  const random = () => {
    v = (Math.imul(1664525, v) + 1013904223) >>> 0
    return v / 4294967296
  }
  const pick = (items) => items[Math.floor(random() * items.length)]
  const num = (lo, hi) => Number((lo + (hi - lo) * random()).toFixed(3))
  const int = (lo, hi) => Math.floor(num(lo, hi + 0.999))
  const source = () =>
    pick([
      'osc(' + int(8, 46) + ', ' + num(-0.09, 0.12) + ', ' + num(0.6, 2.1) + ')',
      'voronoi(' + int(3, 13) + ', ' + num(0.08, 0.6) + ', ' + num(0.18, 0.85) + ')',
      'noise(' + num(1.4, 5.8) + ', ' + num(0.07, 0.29) + ')',
      'shape(' +
        int(3, 9) +
        ', ' +
        num(0.27, 0.59) +
        ', ' +
        num(0.03, 0.32) +
        ').repeat(' +
        int(2, 5) +
        ', ' +
        int(2, 5) +
        ')'
    ])
  const transform = () =>
    pick([
      '.modulateRotate(' + source() + ', ' + num(0.4, 3.3) + ')',
      '.modulateScale(' + source() + ', ' + num(0.23, 1.5) + ')',
      '.modulate(' + source() + ', ' + num(0.09, 0.4) + ')',
      '.rotate(' + num(-0.6, 0.6) + ', ' + num(-0.08, 0.08) + ')'
    ])
  const fold = symmetry === 'libre' ? pick(['radial', 'x', 'y', 'ninguna']) : symmetry
  const mirror = fold === 'x' ? 'espejoX' : fold === 'y' ? 'espejoY' : null
  const lines = ['// Semilla ' + (seed >>> 0) + ' · ' + fold, 'speed = ' + num(0.55, 1.1)]
  if (mirror) lines.push('', MIRRORS[mirror])
  lines.push('', source(), '  ' + transform(), '  .out(o1)', '')
  const topology = int(0, 4)
  if (topology === 0) {
    lines.push(
      '// Trama de fase',
      'osc(' + int(12, 88) + ', ' + num(-0.095, 0.08) + ', ' + num(0.85, 2.2) + ')'
    )
    lines.push(
      '  .' +
        pick(['modulate', 'modulateRotate', 'modulateScale']) +
        '(src(o1), ' +
        num(0.28, 1.9) +
        ')'
    )
  } else if (topology === 1) {
    lines.push(
      '// La diferencia entre fotogramas siembra el eco.',
      'src(o1).diff(src(o1).scrollX(' + num(0.005, 0.04) + '))',
      '  .contrast(' + num(2.1, 5.6) + ').mult(osc(' + int(12, 55) + ', 0.06, 1.6))',
      '  .add(src(o2).scale(' +
        num(1.005, 1.025) +
        ').rotate(' +
        num(-0.023, 0.023) +
        '), ' +
        num(0.65, 0.9) +
        ')'
    )
  } else if (topology === 2) {
    lines.push(
      '// Inversión iterada. Cada vuelta vuelve a plegar el espacio.',
      'setFunction({',
      "  name: 'planoInverso', type: 'coord',",
      "  inputs: [{name:'fase', type:'float', default:0}],",
      '  glsl: \`vec2 p=(_st-.5)*vec2(resolution.x/resolution.y,1.)*' + num(1.1, 2.9).toFixed(3) + ';',
      '    for(int i=0;i<' + int(3, 6) + ';i++){',
      '      p=abs(p)/clamp(dot(p,p),0.24,1.85)-vec2(' + num(0.58, 1.18) + ',' + num(0.41, 0.96) + ');',
      '      p+=0.075*vec2(sin(fase),cos(fase+float(i)));',
      '    } return p*.38+.5;\`',
      '})',
      '',
      'osc(' + int(10, 42) + ', ' + num(0.015, 0.08) + ', ' + num(0.9, 1.8) + ')',
      '  .modulate(src(o1), ' + num(0.06, 0.22) + ')',
      '  .planoInverso(() => time * ' + num(0.09, 0.32) + ')'
    )
  } else if (topology === 3) {
    lines.push(
      '// Interferencia entre dos retículas.',
      'const reticula = (n, angulo) => osc(n, ' + num(0.01, 0.08) + ', ' + num(0.9, 2.1) + ')',
      '  .rotate(angulo).modulate(src(o1), ' + num(0.08, 0.29) + ')',
      '',
      'reticula(' + int(46, 100) + ', ' + num(-0.6, 0.6) + ')',
      '  .diff(reticula(' +
        int(44, 99) +
        ', () => ' +
        num(0.2, 0.8) +
        ' + Math.sin(time * 0.2) * 0.14))'
    )
  } else {
    lines.push(
      orbitInk(int(4, 7), num(0.37, 0.83)),
      '',
      'tintaOrbital(' + num(1.6, 3.1) + ', () => ' + num(0.18, 0.53) + ' + a.fft[1] * 0.09)'
    )
  }
  if (random() > 0.35) lines.push('  ' + transform())
  if (mirror) lines.push('  .' + mirror + '()')
  if (fold === 'radial') lines.push('  .kaleid(' + int(3, 10) + ')')
  lines.push('  .out(o2)', '', 'src(o2)')
  lines.push('  .' + pick(['sub', 'mult', 'add']) + '(' + source() + ', ' + num(0.24, 0.69) + ')')
  const tint = pick([[1.25, .59, .85], [.58, .94, 1.28], [1.3, .98, .48], [.82, .62, 1.28], [.8, 1.22, .72]])
  const hue = num(-.5, .5), drift = num(.008, .034) * pick([-1, 1])
  lines.push(
    '  .color(' + tint.join(', ') + ')',
    '  .hue(() => ' + hue + ' + time * (' + drift + '))',
    '  .rotate(0, ' + num(.02, .066) * pick([-1, 1]) + ')',
    '  .scale(() => 1 + a.fft[0] * ' + num(0.035, 0.15) + ')',
    '  .blend(src(o0).scale(' +
      num(1.004, 1.029) +
      ').rotate(' +
      num(-0.016, 0.016) +
      '), ' +
      num(0.31, 0.65) +
      ')',
    '  .out(o0)',
    '',
    'render(o0)'
  )
  return lines.join('\n')
}

SKETCHES.push({
  id: 'orbital',
  name: 'Telar orbital',
  group: 'Fractales',
  code: [
    '// Los arcos nacen de invertir un plano y plegarlo de nuevo.',
    'const sectores = 5',
    'const escala = 2.1',
    'const torsion = () => 0.36 + a.fft[1] * 0.12',
    '',
    'prepararTinta()',
    '',
    'tintaOrbital(escala, torsion)',
    '  .kaleid(sectores)',
    '  .modulate(noise(2.2, 0.08), 0.075)',
    '  .blend(src(o0).scale(1.012), 0.36)',
    '  .out(o0)',
    '',
    '// Podés cambiar la ecuación y volver a ejecutar todo.',
    'function prepararTinta() {',
    orbitInk(6, 0.63)
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n'),
    '}'
  ].join('\n')
})
