// Bump the asset version when publishing a new edition of the cabina.
const prefix = 'fosfeno-' + new URL(self.registration.scope).pathname + '-'
const cacheName = prefix + 'v3.1.11'
const files = [
  'index.html',
  'abrir.html',
  'mapeo.html',
  'style.css?v=3.1.9',
  'mapping.css?v=3.1',
  'src/mapping.js?v=3.1.2',
  'src/mapping-samples.mjs?v=3.1',
  'media/mapas/iris-de-marea.fosmap',
  'media/mapas/umbral-de-ambar.fosmap',
  'media/mapas/deriva-abisal.fosmap',
  'media/mapas/iris-de-marea.webp',
  'media/mapas/umbral-de-ambar.webp',
  'media/mapas/deriva-abisal.webp',
  'src/mapping-output.mjs?v=3.1',
  'src/mapping-warp.mjs?v=3.1',
  'src/mapping-transform.mjs?v=3.1',
  'src/mapping-solids.mjs?v=3.1',
  'src/mapping-solid-ui.mjs?v=3.1',
  'src/mapping-project.mjs?v=3.1',
  'src/pose-3d.mjs?v=3.1',
  'src/model-source.mjs?v=3.1',
  'media/modelos/nudo-de-cobre.glb',
  'vendor/three/three-gltf-0.187.0.min.mjs',
  'src/studio-storage.js?v=3.1',
  'src/sketches.js?v=3.1',
  'vendor/acorn/dist/acorn.js',
  'src/engine.js?v=3.1',
  'src/media.js?v=3.1',
  'src/music.css?v=3.1',
  'src/music-score.js?v=3.1',
  'src/music.js?v=3.1',
  'vendor/omggif/omggif.js',
  'src/gif-input.js?v=3.1',
  'src/visual-input.js?v=3.1',
  'src/stack.css?v=3.1',
  'src/editor-menu.js?v=3.1.4',
  'src/studio-stack.js?v=3.1',
  'src/projector-display.js?v=3.1',
  'src/projector-code.js?v=3.1',
  'src/app.js?v=3.1.11',
  'src/score-tools.js?v=3.1',
  'src/sectors.js?v=3.1',
  'src/sector-program.js?v=3.1',
  'src/sector-history.js?v=3.1.4',
  'src/loops.js?v=3.1',
  'src/layout.js?v=3.1',
  'src/compositions.js?v=3.1',
  'src/code-guide.js?v=3.1',
  'src/context-code.js?v=3.1.2',
  'src/operator-editor.js?v=3.1',
  'src/visual-parameters.js?v=3.1',
  'src/visual-preview.js?v=3.1',
  'src/visual-inspector.js?v=3.1.2',
  'vendor/dist/hydra-synth.js?v=2.3',
  'vendor/p5/p5.min.js',
  'vendor/p5/hydra-wrapper.js',
  'vendor/patch-bay/client.js',
  'src/network.js?v=3.1',
  'vendor/hydra-gallery/examples.js',
  'vendor/codemirror/lib/codemirror.css',
  'vendor/codemirror/lib/codemirror.js',
  'vendor/codemirror/mode/javascript/javascript.js',
  'vendor/codemirror/addon/edit/matchbrackets.js',
  'vendor/codemirror/addon/comment/comment.js',
  'vendor/beautify/beautify.min.js',
  'assets/fosfeno-icon.png?v=3.1.11',
  'assets/apple-touch-icon.png?v=3.1.11',
  'boot.css?v=3.1.10',
  'assets/barlow-condensed-bold.ttf',
  'assets/space-mono.ttf',
  'LICENSE',
  'vendor/LICENSE',
  'vendor/acorn/LICENSE',
  'vendor/beautify/LICENSE',
  'vendor/codemirror/LICENSE',
  'vendor/p5/LICENSE',
  'vendor/patch-bay/THIRD-PARTY.txt',
  'vendor/three/LICENSE',
  'assets/LICENSE-Barlow.txt',
  'assets/LICENSE-SpaceMono.txt'
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
  const entry = path === root.pathname ? 'index.html' : path.slice(root.pathname.length)
  const documentRequest = req.mode === 'navigate' && path.startsWith(root.pathname) &&
    ['index.html', 'abrir.html', 'mapeo.html'].includes(entry)
  if (documentRequest) {
    const fallback = async () => {
      const cache = await caches.open(cacheName)
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
