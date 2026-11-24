// Optional network QA. The relay listens only on loopback and uses no STUN/TURN.
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const { chromium } = require('playwright')
const SocketIO = require('socket.io')

async function main() {
  const local = process.env.FOSFENO_URL || 'http://127.0.0.1:8736/'
  const official = process.argv.includes('--official')
  const shim = process.argv.includes('--process-shim')
  const relay = http.createServer()
  const io = SocketIO(relay)
  const peers = new Map()
  io.on('connection', (socket) => {
    let id
    socket.on('join', (room, info) => {
      id = info.uuid
      const existing = Array.from(peers.keys())
      peers.set(id, socket)
      socket.emit('ready', { peers: existing, servers: [] })
      socket.broadcast.emit('new peer', id)
    })
    socket.on('broadcast', (message) => socket.broadcast.emit('broadcast', message))
    socket.on('message', (message) => peers.get(message.id)?.emit('message', { ...message, id }))
    socket.on('disconnect', () => peers.delete(id))
  })
  await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve))
  const server = 'http://127.0.0.1:' + relay.address().port
  let browser
  try {
    browser = await chromium.launch({
      channel: 'chromium',
      args: ['--use-fake-device-for-media-stream', '--use-angle=d3d11', '--enable-unsafe-swiftshader']
    })
    const open = async (reference) => {
      const context = await browser.newContext({
        serviceWorkers: 'block',
        permissions: ['local-network-access']
      })
      await context.route('https://api.hydrasynth.xyz/**', (route) => route.abort())
      await context.routeWebSocket('wss://api.hydrasynth.xyz/**', (socket) => socket.close())
      const page = await context.newPage()
      page.on('pageerror', (err) => console.error(reference ? 'Hydra' : 'Fosfeno', err.message))
      await page.goto(reference ? 'https://hydra.ojack.xyz/?sketch_id=eerie_ear_0' : local)
      await page.waitForFunction(() => window.cm && window.hydraSynth && window.pb)
      if (reference && shim) {
        const source = fs.readFileSync(require.resolve('process/browser.js'), 'utf8')
        await page.addScriptTag({
          content:
            'window.process=(()=>{const module={exports:{}};' + source + ';return module.exports})()'
        })
      }
      await page.evaluate(
        ({ reference, server }) => {
          if (reference) {
            const original = pb
            original._destroy()
            const next = new original.constructor()
            next.init(hydraSynth.captureStream, { server, room: 'qa' })
            for (const input of hydraSynth.s) input.pb = next
          } else pb.connect(server, 'qa')
        },
        { reference, server }
      )
      return page
    }
    const operator = await open(false)
    const other = await open(official)
    await other.waitForFunction(() => pb.client?.signaller.connected || pb.nick)
    const run = async (page, code) => {
      await page.evaluate((code) => {
        cm.setValue(code)
        cm.focus()
      }, code)
      await page.keyboard.press('Control+Shift+Enter')
    }
    await run(other, "solid(.1,.8,.2).out();pb.setName('qa-green')")
    await operator.waitForFunction(() => pb.list().includes('qa-green'))
    await run(operator, "s0.initStream('qa-green');src(s0).out()")
    await operator.waitForFunction(
      () => {
        const rgb = hydraSynth.regl.read({ framebuffer: o0.getCurrent(), width: 1, height: 1 })
        return s0.src?.videoWidth && rgb[1] > 160 && rgb[0] < 60
      },
      null,
      { timeout: 20000 }
    )
    await run(operator, "solid(.88,.08,.12).out();pb.setName('qa-red')")
    await other.waitForFunction(() => pb.list().includes('qa-red'))
    await run(other, "s1.initStream('qa-red');src(s1).out()")
    await other.waitForFunction(
      () => {
        const rgb = hydraSynth.regl.read({ framebuffer: o0.getCurrent(), width: 1, height: 1 })
        return s1.src?.videoWidth && rgb[0] > 165 && rgb[1] < 70
      },
      null,
      { timeout: 20000 }
    )
    assert.ok(
      await operator.evaluate(() => {
        pb.disconnect()
        return pb.client === null && s0.src === null
      })
    )
    console.log('Both colours received and decoded over loopback WebRTC.', { official, shim })
  } finally {
    await browser?.close()
    await new Promise((resolve) => io.close(resolve))
  }
}
main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
