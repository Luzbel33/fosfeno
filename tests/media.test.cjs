const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function load(file, name, globals = {}) {
  const code = fs.readFileSync(path.join(__dirname, '../src', file + '.js'), 'utf8')
  return vm.runInNewContext(code + '\n' + name, globals)
}

test('idle FFT is zero, the optional pulse follows tempo, and silent audio takes priority', () => {
  const SoundDesk = load('media', 'SoundDesk')
  const desk = new SoundDesk(
    () => {},
    () => {}
  )
  for (const seconds of [0, 0.25, 0.5, 1.9]) {
    assert.deepEqual([...desk.sample(seconds, 130, 1, 1)], [0, 0, 0])
  }
  const slow = desk.sample(0.5, 60, 1, 10, true)[0]
  const fast = desk.sample(0.5, 120, 1, 10, true)[0]
  assert.ok(fast > slow)
  assert.deepEqual([...desk.sample(1, 130, 1, 0.016)], [0, 0, 0])
  desk.micStream = {}
  desk.context = { sampleRate: 48000 }
  desk.analyser = { fftSize: 2048, getByteFrequencyData: (data) => data.fill(0) }
  desk.bins = new Uint8Array(1024)
  assert.deepEqual([...desk.sample(0.5, 120, 1, 1, true)], [0, 0, 0])
  desk.analyser.getByteFrequencyData = (data) => data.fill(255)
  assert.ok(desk.sample(0.5, 120, 1, 1).every((v) => v > 0.9))
})

class Video extends EventTarget {
  videoWidth = 640
  videoHeight = 480
  readyState = 2
  async play() {}
  pause() {}
  load() {}
  removeAttribute() {}
}

test('playback must deliver a decoded frame before committing a camera', async () => {
  const playFirstFrame = load('visual-input', 'playFirstFrame', {
    AbortController,
    setTimeout,
    clearTimeout
  })
  const video = new Video()
  video.videoWidth = 0
  video.readyState = 1
  const request = new AbortController()
  let ready = false
  const firstFrame = playFirstFrame(video, null, request.signal).then(() => {
    ready = true
  })
  await new Promise(setImmediate)
  assert.equal(ready, false)
  video.videoWidth = 640
  video.readyState = 2
  video.dispatchEvent(new Event('loadeddata'))
  await firstFrame
  assert.equal(ready, true)
})

function camera(id) {
  const track = Object.assign(new EventTarget(), {
    readyState: 'live',
    getSettings: () => ({ deviceId: id }),
    stop() {
      this.readyState = 'ended'
    }
  })
  return { track, getTracks: () => [track], getVideoTracks: () => [track] }
}

function setup(mediaDevices, bind = () => {}) {
  const history = []
  const VisualInput = load('visual-input', 'VisualInput', {
    HTMLVideoElement: Video,
    window: { isSecureContext: true },
    document: { createElement: () => new Video() },
    navigator: { mediaDevices },
    DOMException,
    AbortController,
    setTimeout,
    clearTimeout
  })
  const input = new VisualInput(
    bind,
    () => {},
    (message) => history.push(message)
  )
  return { input, history }
}

test('numeric camera selection obtains permission before resolving a redacted index', async () => {
  const first = camera('front'),
    second = camera('back')
  const requests = []
  const { input } = setup({
    enumerateDevices: async () =>
      (requests.length ? ['front', 'back'] : ['']).map((deviceId) => ({
        kind: 'videoinput',
        deviceId
      })),
    getUserMedia: async ({ video, audio }) => {
      assert.equal(audio, false)
      requests.push(video.deviceId?.exact)
      return video.deviceId ? second : first
    }
  })
  await input.open('camera', { choice: 1 })
  assert.deepEqual(requests, [undefined, 'back'])
  assert.equal(first.track.readyState, 'ended')
  assert.equal(input.current.stream, second)
  await assert.rejects(input.open('camera', { choice: 9 }), { name: 'NotFoundError' })
  assert.equal(input.current.stream, second)
  input.clear()
  assert.equal(second.track.readyState, 'ended')
})

test('a canceled permission request settles immediately and releases its late grant', async () => {
  let release
  const late = camera('late'),
    newer = camera('selected')
  const { input } = setup({
    getUserMedia: ({ video }) =>
      video.deviceId
        ? Promise.resolve(newer)
        : new Promise((r) => {
            release = r
          })
  })
  const first = input.open('camera')
  await input.open('camera', { choice: 'selected' })
  await first
  release(late)
  await new Promise(setImmediate)
  assert.equal(late.track.readyState, 'ended')
  assert.equal(input.current.stream, newer)
  input.clear()
})

test('a failed GPU upload releases the candidate and keeps the live camera', async () => {
  const old = camera('ok'),
    rejected = camera('bad')
  const { input } = setup(
    {
      getUserMedia: async ({ video }) => (video.deviceId ? rejected : old)
    },
    (next) => {
      if (next?.stream === rejected) throw new Error('texture failed')
    }
  )
  await input.open('camera')
  await assert.rejects(input.open('camera', { choice: 'bad' }), /texture failed/)
  assert.equal(rejected.track.readyState, 'ended')
  assert.equal(old.track.readyState, 'live')
  assert.equal(input.current.stream, old)
  input.clear()
})

test('exclusive hardware retries a switch and restores the former camera if the retry fails', async () => {
  for (const canSwitch of [false, true]) {
    const streams = [],
      attempts = []
    const { input, history } = setup({
      getUserMedia: async ({ video }) => {
        const id = video.deviceId.exact
        attempts.push(id)
        if (id === 'B' && (!canSwitch || streams.some((s) => s.track.readyState === 'live')))
          throw new DOMException('busy', 'NotReadableError')
        const stream = camera(id)
        streams.push(stream)
        return stream
      }
    })
    await input.open('camera', { choice: 'A' })
    const switching = input.open('camera', { choice: 'B' })
    if (canSwitch) await switching
    else await assert.rejects(switching, { name: 'NotReadableError' })
    assert.deepEqual(attempts, canSwitch ? ['A', 'B', 'B'] : ['A', 'B', 'B', 'A'])
    assert.equal(streams[0].track.readyState, 'ended')
    assert.equal(input.current.stream.track.getSettings().deviceId, canSwitch ? 'B' : 'A')
    input.current.stream.track.dispatchEvent(new Event('ended'))
    assert.equal(input.current, null)
    assert.match(history.at(-1), /desconectó/)
  }
})
