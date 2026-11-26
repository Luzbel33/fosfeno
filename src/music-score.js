const musicExample = Object.freeze({
  source: `// Prisma nocturno
bpm 128
step 1/8
bombo kick vol=.48: x . x . x . x .
bajo sawtooth vol=.18 gate=.83 cutoff=620: C2 . C2 Eb2 G1 . Bb1 Bb1
cuerdas triangle vol=.13 gate=1.6 attack=.06 release=.28: C4+Eb4+G4 . . . Bb3+D4+F4 . . .
aire hat vol=.12 gate=.36: . x . x . x x x
caja snare vol=.15 gate=.49: . . x . . . x .`,
  visual: `// Prisma nocturno · responde a la partitura de Fosfeno
voronoi(7, .3, .35)
  .modulate(osc(17, .1, 1.4), () => .15 + a.fft[0] * .48)
  .kaleid(6)
  .rotate(() => musicBeat() * .07)
  .color(.45, .7, 1.2)
  .saturate(() => 1.6 + a.fft[1] * 2)
  .blend(src(o0).scale(1.015), .33)
  .out(o0)`
})

const musicWaves = new Set(['sine', 'triangle', 'square', 'sawtooth'])
const musicPercussion = new Set(['kick', 'snare', 'hat'])
const musicParameters = {
  vol:[.27,0,1], gate:[.85,.05,2], attack:[.008,0,.6], release:[.08,0,1.5],
  cutoff:[16000,40,18000], pan:[0,-1,1], pitch:[51,30,140]
}
const musicNoteValues = {C:0,D:2,E:4,F:5,G:7,A:9,B:11}
const musicMaxSourceLength = 24000

class MusicScoreError extends Error {
  constructor(line, column, message) {
    super('Línea ' + line + ', columna ' + column + ' · ' + message)
    this.line = line
    this.column = column
  }
}

function musicFrequency(note) {
  const match = /^([A-Ga-g])([#b]?)([0-8])$/.exec(note)
  if (!match) return null
  const [,name,modifier,octave] = match
  const semitones = musicNoteValues[name.toUpperCase()] + (modifier === '#' ? 1 : modifier === 'b' ? -1 : 0)
  return 440 * 2 ** ((semitones + (Number(octave)+1)*12 - 69)/12)
}

function parseMusicScore(source) {
  if (typeof source !== 'string' || source.length > musicMaxSourceLength)
    throw new MusicScoreError(1,1,'La partitura es demasiado larga.')
  const tracks = []
  const names = new Set(), directives = new Set()
  let bpm = 128, subdivision = 8, length = null
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const text = raw.split('//',1)[0].trim()
    if (!text) continue
    const error = (message, token = text) => {
      throw new MusicScoreError(index+1,Math.max(0,raw.indexOf(token))+1,message)
    }
    const separator = text.indexOf(':')
    if (separator === -1) {
      const [key,value,...extra] = text.split(/\s+/)
      if (!['bpm','step','length'].includes(key)) error('Definí una pista con nombre, instrumento y «:».')
      if (!value || extra.length || directives.has(key)) error('Usá «' + key + '» una vez y con un valor.',key)
      directives.add(key)
      if (key === 'step') {
        if (!/^1\/(1|2|4|8|12|16|24|32)$/.test(value)) error('El paso tiene forma 1/8 o 1/16.',value)
        subdivision = Number(value.slice(2))
      } else {
        const n = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : 0
        if (key === 'bpm') {
          if (n<20 || n>300) error('El tempo va de 20 a 300 BPM.',value)
          bpm = n
        } else {
          if (!Number.isInteger(n) || n<1 || n>256) error('La duración va de 1 a 256 pasos.',value)
          length = n
        }
      }
      continue
    }
    const [name,instrument,...options] = text.slice(0,separator).trim().split(/\s+/)
    if (!/^[\p{L}\p{N}_-]+$/u.test(name) || names.has(name)) error('Dale a la pista un nombre único y sin espacios.',name)
    if (!musicWaves.has(instrument) && !musicPercussion.has(instrument))
      error('Elegí sine, triangle, square, sawtooth, kick, snare o hat.',instrument)
    names.add(name)
    const config = Object.fromEntries(Object.entries(musicParameters).map(([k,p])=>[k,p[0]]))
    if (instrument==='hat') config.cutoff=7300
    if (instrument==='snare') config.cutoff=1950
    const specified = new Set()
    for (const option of options) {
      const match = /^(\w+)=(-?(?:\d*\.\d+|\d+))$/.exec(option)
      if (!match || !Object.hasOwn(musicParameters,match[1])) error('Parámetro desconocido. Usá, por ejemplo, vol=.2.',option)
      const [,key,value] = match, [,min,max] = musicParameters[key]
      if (key==='pitch' && instrument!=='kick') error('pitch ajusta la frecuencia final del bombo.',option)
      if (specified.has(key) || Number(value)<min || Number(value)>max) error(key + ' admite un valor entre ' + min + ' y ' + max + '.',option)
      config[key] = Number(value)
      specified.add(key)
    }
    const pattern = text.slice(separator+1).trim()
    if (!pattern) error('Agregá notas, golpes o silencios.')
    const steps = pattern.split(/\s+/).filter(token=>token!=='|')
    if (!steps.length || steps.length>256) error('Una pista admite de 1 a 256 pasos.')
    const percussion = musicPercussion.has(instrument)
    const events = steps.map(token=>{
      if (token==='.' || token==='-') return null
      if (percussion) {
        if (token==='x' || token==='X') return {accent:token==='X' ? 1 : .75}
        error('La percusión usa x, X o un punto para el silencio.',token)
      }
      const frequencies = token.split('+').map(musicFrequency)
      if (frequencies.length>8 || frequencies.some(frequency=>frequency===null))
        error('Escribí una nota como C4 o un acorde como C4+Eb4+G4.',token)
      return {frequencies}
    })
    tracks.push({ name, instrument, ...config, events })
  }
  if (!tracks.length) throw new MusicScoreError(1,1,'Agregá al menos una pista, por ejemplo «bajo sine: C2 .».')
  return { bpm, subdivision, length: length ?? Math.max(...tracks.map(track=>track.events.length)), tracks }
}

function validMusicDraft(draft) {
  return !!draft && typeof draft.source==='string' && draft.source.length<=musicMaxSourceLength && typeof draft.sync==='boolean'
}

if (typeof module !== 'undefined' && module.exports) module.exports = {parseMusicScore,validMusicDraft,musicExample}
