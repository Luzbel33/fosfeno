// Nickname broadcasts follow Hydra's pb-live protocol. The signalling connection
// is lazy and the outgoing canvas is attached only when a sketch calls setName.
class HydraRoom {
  constructor(canvas, onDisconnect) {
    this.canvas = canvas
    this.onDisconnect = onDisconnect
    this.names = new Map()
  }
  connect(server, room = 'iclc') {
    if (this.client) {
      if (server && (server !== this.server || room !== this.room))
        throw new Error('Ejecutá pb.disconnect() antes de cambiar de sala.')
      return this.client
    }
    this.server = server || 'https://api.hydrasynth.xyz'
    this.room = room
    const client = new HydraPatchBay.default({ server: this.server, room })
    this.client = client
    client.on('new peer', (id) => {
      if (typeof id !== 'string') return
      if (!this.names.has(id)) this.names.set(id, id)
      this.announce()
      client.emit('names')
    })
    client.on('broadcast', (message) => {
      if (message?.type !== 'update-nick' || typeof message.nick !== 'string') return
      this.names.set(message.id, message.nick)
      client.emit('names')
    })
    client.on('ready', () => this.announce())
    return client
  }
  announce(previous) {
    if (this.nick)
      this.client.broadcast({
        type: 'update-nick',
        id: this.client.id,
        nick: this.nick,
        previous
      })
  }
  setName(nick) {
    if (typeof nick !== 'string' || !nick.trim()) throw new Error('Elegí un nombre para la señal.')
    const client = this.connect()
    if (!client.stream) client.stream = this.canvas.captureStream(25)
    const previous = this.nick
    this.nick = nick
    this.announce(previous)
  }
  list() {
    this.connect()
    return Array.from(this.names.values())
  }
  receive(nick, signal) {
    const client = this.connect()
    return new Promise((resolve, reject) => {
      let peer
      const cleanup = () => {
        clearTimeout(timer)
        client.off('names', findPeer)
        client.off('stream', incoming)
        client.off('leaving', cancel)
        signal.removeEventListener('abort', cancel)
      }
      const cancel = () => {
        cleanup()
        reject(new Error('Se canceló la conexión de red.'))
      }
      const incoming = (id, stream) => {
        if (id !== peer) return
        cleanup()
        resolve(stream.clone())
      }
      const findPeer = () => {
        if (peer) return
        peer = Array.from(this.names).find(([id, name]) => name === nick || id === nick)?.[0]
        if (!peer) return
        const stream = client.rtcPeers[peer]?.stream
        if (stream?.active) incoming(peer, stream)
        else client.initConnectionFromId(peer)
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('No llegó la señal «' + nick + '». Revisá el nombre, la sala y el servidor.'))
      }, 15000)
      client.on('names', findPeer)
      client.on('stream', incoming)
      client.on('leaving', cancel)
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
      else findPeer()
    })
  }
  disconnect() {
    if (!this.client) return
    this.client.emit('leaving')
    this.onDisconnect()
    this.client.stream?.getTracks().forEach((track) => track.stop())
    this.client.removeAllListeners()
    this.client._destroy()
    this.client = null
    this.nick = null
    this.names.clear()
  }
}
