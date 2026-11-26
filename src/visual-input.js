function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

function releaseVisual(input) {
  if (!input) return
  stopTracks(input.stream)
  if (input.element instanceof HTMLVideoElement) {
    input.element.pause()
    input.element.srcObject = null
    input.element.removeAttribute('src')
    input.element.load()
  }
  if (input.url) URL.revokeObjectURL(input.url)
}

async function cameraDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'videoinput')
}

async function claimStream(promise, input, signal) {
  const stream = await promise
  // A permission prompt can resolve long after the operator canceled.
  if (signal.aborted) {
    stopTracks(stream)
    signal.throwIfAborted()
  }
  input.stream = stream
}

function cameraError(err) {
  switch (err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permiso de cámara denegado. Habilitá la cámara para este sitio en el navegador, revisá el permiso del sistema y volvé a conectar.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'La cámara elegida no está disponible. Conectala o elegí otra.'
    case 'NotReadableError':
    case 'AbortError':
      return 'La cámara no pudo iniciar. Cerrá otras aplicaciones que la estén usando y reintentá.'
    default:
      return err.message
  }
}

async function acquireCamera(choice, input, signal) {
  if (!window.isSecureContext)
    throw new Error('Abrí Fosfeno por HTTPS o localhost para usar la cámara.')
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error(
      'Este navegador no ofrece acceso a la cámara. Abrí Fosfeno en un navegador con captura de video.'
    )
  const policy = document.permissionsPolicy || document.featurePolicy
  if (policy?.allowsFeature?.('camera') === false)
    throw new Error(
      'La política de permisos de esta página bloquea la cámara. Si Fosfeno está dentro de otro sitio, abrilo en su propia pestaña.'
    )

  function acquire(id) {
    signal.throwIfAborted()
    const video = input.nativeSize ? {} : { width: { ideal: 960 }, height: { ideal: 540 } }
    if (id) video.deviceId = { exact: id }
    return claimStream(navigator.mediaDevices.getUserMedia({ video, audio: false }), input, signal)
  }
  if (typeof choice !== 'number') return acquire(choice)
  if (!Number.isInteger(choice) || choice < 0)
    throw new Error('Usá un índice de cámara entero a partir de 0.')
  let devices = await cameraDevices().catch(() => [])
  if (!devices.some((d) => d.deviceId)) {
    await acquire()
    if (choice === 0) return
    devices = await cameraDevices()
    signal.throwIfAborted()
    if (
      devices[choice]?.deviceId &&
      devices[choice].deviceId === input.stream.getVideoTracks()[0]?.getSettings().deviceId
    )
      return
    stopTracks(input.stream)
    input.stream = null
  }
  if (!devices[choice]?.deviceId) throw new DOMException('Cámara no disponible', 'NotFoundError')
  await acquire(devices[choice].deviceId)
}

async function prepareVisual(input, choice, file, signal) {
  if (file) input.url = URL.createObjectURL(file)
  if (file?.type.startsWith('image/')) {
    const image = new Image()
    image.src = input.url
    await image.decode()
    signal.throwIfAborted()
    input.element = image
    const scale = 1920 / Math.max(image.naturalWidth, image.naturalHeight)
    if (scale < 1) {
      const sheet = document.createElement('canvas')
      sheet.width = Math.max(1, Math.round(image.naturalWidth * scale))
      sheet.height = Math.max(1, Math.round(image.naturalHeight * scale))
      sheet.getContext('2d').drawImage(image, 0, 0, sheet.width, sheet.height)
      input.element = sheet
    }
    return
  }
  const video = document.createElement('video')
  input.element = video
  video.playsInline = video.muted = true
  video.loop = !!file
  if (input.kind === 'camera') {
    if (input.sharedCamera?.readyState === 'live') {
      // The mapper owns this clone. Disconnecting its reference leaves s0 live.
      await claimStream(Promise.resolve(new MediaStream([input.sharedCamera.clone()])), input, signal)
    } else await acquireCamera(choice, input, signal)
  }
  else if (input.kind === 'peer') await claimStream(input.receive(signal), input, signal)
  else if (input.kind === 'screen') {
    if (!navigator.mediaDevices?.getDisplayMedia)
      throw new Error('Este navegador no permite compartir ventanas. Probá desde una computadora.')
    await claimStream(
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: input.captureAudio }),
      input,
      signal
    )
  }
  signal.throwIfAborted()
  if (input.stream) video.srcObject = input.stream
  else video.src = input.url
  await playFirstFrame(video, input.stream?.getVideoTracks()[0], signal)
}

function playFirstFrame(video, track, signal) {
  return new Promise((resolve, reject) => {
    const listeners = new AbortController()
    const options = { signal: listeners.signal }
    const missingFrame = () =>
      finish(new Error('No llegó video de la fuente. Revisala y volvé a conectar.'))
    const timeout = setTimeout(missingFrame, 15000)
    let playing = false
    function finish(error) {
      clearTimeout(timeout)
      listeners.abort()
      if (error) reject(error)
      else resolve()
    }
    function check() {
      if (track?.readyState === 'ended') missingFrame()
      else if (playing && video.videoWidth && video.videoHeight && video.readyState >= 2) finish()
    }
    video.addEventListener('loadeddata', check, options)
    video.addEventListener('resize', check, options)
    track?.addEventListener('ended', missingFrame, options)
    signal.addEventListener('abort', () => finish(signal.reason), options)
    video.play().then(() => {
      playing = true
      check()
    }, finish)
  })
}

// A source owns its pending permission request independently of its live texture.
class VisualInput {
  constructor(bind, changed, report) {
    this.bind = bind
    this.changed = changed
    this.report = report
    this.current = this.pending = null
  }
  cancel() {
    this.pending?.abort()
    this.pending = null
  }
  replace(next) {
    const previous = this.current
    this.bind(next)
    this.current = next
    releaseVisual(previous)
    const track = next?.stream?.getVideoTracks()[0]
    track?.addEventListener(
      'ended',
      () => {
        if (this.current !== next) return
        this.replace(null)
        if (!this.pending)
          this.report('La entrada de video se desconectó. Volvé a conectar o elegí otra.')
      },
      { once: true }
    )
    this.changed(next)
  }
  clear() {
    this.cancel()
    if (this.current) this.replace(null)
    this.report('')
  }
  async prepareReplacement(input, choice, signal, canceled) {
    const prepare = (next, device) =>
      Promise.race([prepareVisual(next, device, next.file, signal), canceled])
    try {
      await prepare(input, choice)
      return
    } catch (err) {
      if (
        signal.aborted ||
        err.name !== 'NotReadableError' ||
        input.stream ||
        input.kind !== 'camera' ||
        this.current?.kind !== 'camera'
      )
        throw err
    }
    // Some mobile devices require closing one lens before opening the other.
    const previous = this.current
    const previousId = previous.stream.getVideoTracks()[0].getSettings().deviceId
    this.replace(null)
    try {
      await prepare(input, choice)
    } catch (err) {
      const deviceFailed = ['NotReadableError', 'NotFoundError', 'OverconstrainedError'].includes(
        err.name
      )
      if (signal.aborted || !previousId || !deviceFailed) throw err
      const restored = { kind: 'camera', params: previous.params, nativeSize: previous.nativeSize }
      try {
        await prepare(restored, previousId)
        signal.throwIfAborted()
        this.replace(restored)
      } catch {
        releaseVisual(restored)
      }
      throw err
    }
  }
  async open(kind, { choice, file, role, params, nativeSize = false, captureAudio = true, receive, sharedCamera } = {}) {
    this.cancel()
    const request = new AbortController()
    const { signal } = request
    const input = { kind, file, role, params, nativeSize, captureAudio, receive, sharedCamera }
    this.pending = request
    this.report(
      kind === 'camera'
        ? 'Conectando cámara… Si el navegador pide permiso, elegí Permitir.'
        : 'Abriendo fuente…'
    )
    let onAbort
    const canceled = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      await this.prepareReplacement(input, choice, signal, canceled)
      signal.throwIfAborted()
      this.replace(input)
      this.pending = null
      this.report('')
      return true
    } catch (err) {
      if (signal.aborted) return false
      this.pending = null
      this.report(kind === 'camera' ? cameraError(err) : err.message)
      throw err
    } finally {
      signal.removeEventListener('abort', onAbort)
      if (this.pending === request) this.pending = null
      if (this.current !== input) releaseVisual(input)
    }
  }
}
