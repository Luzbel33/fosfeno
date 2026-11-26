const assert = require('node:assert/strict')
const { test } = require('node:test')
const { parseMusicScore, validMusicDraft, musicExample } = require('../src/music-score.js')

test('partitura: frecuencias, acordes, acentos, silencios y parámetros editables', () => {
  const parsed = parseMusicScore(`bpm 153.5
step 1/12
length 15
bajo triangle vol=.23 gate=1.15 attack=.05 release=.2 cutoff=880 pan=-.3: A4 C4+Eb4+G4 .
bombo kick pitch=62: x | X .`)
  assert.deepEqual([parsed.bpm,parsed.subdivision,parsed.length],[153.5,12,15])
  assert.equal(parsed.tracks[0].events[0].frequencies[0],440)
  const chord = parsed.tracks[0].events[1].frequencies
  assert.deepEqual(chord.map(Math.round),[262,311,392])
  assert.equal(parsed.tracks[0].events[2],null)
  assert.equal(parsed.tracks[0].pan,-.3)
  assert.equal(parsed.tracks[0].cutoff,880)
  assert.equal(parsed.tracks[1].pitch,62)
  assert.deepEqual(parsed.tracks[1].events,[{accent:.75},{accent:1},null])
  assert.equal(parseMusicScore(musicExample.source).tracks.length,5)
})

test('errores de sintaxis, parámetros y notas señalan línea y columna', () => {
  for (const [source,location] of [
    ['bpm 10\nbass sine: C2', 'Línea 1, columna 5'],
    ['bpm 120\nstep 1/7\nbass sine: C2', 'Línea 2, columna 6'],
    ['bpm 120\nbass sine vol=2: C2', 'Línea 2, columna 11'],
    ['bpm 120\nbass sine: Z9', 'Línea 2, columna 12'],
    ['bpm 120\nsnare snare: C2', 'Línea 2, columna 14']
  ]) assert.throws(()=>parseMusicScore(source),error=>error.message.startsWith(location))
  assert.equal(validMusicDraft({source:'bpm 120\ntrabajo aún en curso',sync:false}),true)
  assert.equal(validMusicDraft({source:'x',sync:'true'}),false)
})
