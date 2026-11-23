// Bump the asset version when publishing a new edition of the cabina.
const prefix = 'fosfeno-' + new URL(self.registration.scope).pathname + '-'
const cacheName = prefix + 'v2.0.0'
const files = [
  'index.html',
  'style.css?v=2',
  'src/sketches.js?v=2',
  'vendor/acorn/dist/acorn.js',
  'src/engine.js?v=2',
  'src/media.js?v=2',
  'src/app.js?v=2',
  'vendor/dist/hydra-synth.js',
  'vendor/codemirror/lib/codemirror.css',
  'vendor/codemirror/lib/codemirror.js',
  'vendor/codemirror/mode/javascript/javascript.js',
  'vendor/codemirror/addon/edit/matchbrackets.js',
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
  const key =
    req.mode === 'navigate' &&
    [root.pathname, root.pathname + 'index.html'].includes(new URL(req.url).pathname)
      ? new URL('index.html', root).href
      : req.url
  if (!urls.has(key)) return
  event.respondWith(
    caches.open(cacheName).then(async (cache) => (await cache.match(key)) || fetch(req))
  )
})
