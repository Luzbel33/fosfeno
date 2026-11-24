// Bump the asset version when publishing a new edition of the cabina.
const prefix = 'fosfeno-' + new URL(self.registration.scope).pathname + '-'
const cacheName = prefix + 'v2.0.17.1'
const files = [
  'index.html',
  'abrir.html',
  'style.css?v=2.17',
  'src/sketches.js?v=2.16',
  'vendor/acorn/dist/acorn.js',
  'src/engine.js?v=2.16',
  'src/media.js?v=2.16',
  'src/visual-input.js?v=2.4',
  'src/app.js?v=2.17',
  'src/score-tools.js?v=2.16',
  'src/sectors.js?v=2.17',
  'src/sector-program.js?v=2.16',
  'src/loops.js?v=2.17',
  'src/layout.js?v=2.17',
  'src/compositions.js?v=2.16',
  'src/code-guide.js?v=2.16',
  'src/operator-editor.js?v=2.16',
  'vendor/dist/hydra-synth.js?v=2.3',
  'vendor/p5/p5.min.js',
  'vendor/p5/hydra-wrapper.js',
  'vendor/patch-bay/client.js',
  'src/network.js',
  'vendor/hydra-gallery/examples.js',
  'vendor/codemirror/lib/codemirror.css',
  'vendor/codemirror/lib/codemirror.js',
  'vendor/codemirror/mode/javascript/javascript.js',
  'vendor/codemirror/addon/edit/matchbrackets.js',
  'vendor/codemirror/addon/comment/comment.js',
  'vendor/beautify/beautify.min.js',
  'assets/mark.svg',
  'assets/barlow-condensed-bold.ttf',
  'assets/space-mono.ttf'
]
const urls = new Set(files.map((path) => new URL(path, self.registration.scope).href))
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) =>
        cache.addAll(
          files.map((file) => new Request(new URL(file, self.registration.scope), { cache: 'reload' }))
        )
      )
      .then(() => self.skipWaiting())
  )
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith(prefix) && name !== cacheName)
          .map((name) => caches.delete(name))
      )
      await self.clients.claim()
    })()
  )
})
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const root = new URL(self.registration.scope)
  const path = new URL(req.url).pathname
  const documentRequest = req.mode === 'navigate' &&
    [root.pathname,root.pathname+'index.html',root.pathname+'abrir.html'].includes(path)
  if (documentRequest) {
    const fallback = async () => {
      const cache = await caches.open(cacheName)
      const entry = path===root.pathname+'abrir.html' ? 'abrir.html' : 'index.html'
      return await cache.match(new URL(entry,root).href) || Response.error()
    }
    // The HTML picks the versioned bundle. Keep the complete cached edition
    // for offline boot, and use the server's current entry when connected.
    event.respondWith(fetch(req,{cache:'no-cache'}).then(response=>response.ok ? response : fallback(),fallback))
    return
  }
  const key=req.url
  if (!urls.has(key)) return
  event.respondWith(
    caches.open(cacheName).then(async (cache) => (await cache.match(key)) || fetch(req))
  )
})
