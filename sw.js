/* Service worker do Controle de Horas
 * - App shell em cache: abre offline
 * - Navegação: rede primeiro, cache como reserva
 * - Estáticos: cache primeiro, atualiza em segundo plano
 */
const VERSAO = 'v1'
const SHELL = `ch-shell-${VERSAO}`
const RUNTIME = `ch-runtime-${VERSAO}`

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      // addAll falha inteiro se um item falhar; adiciona um a um por segurança
      await Promise.all(
        SHELL_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys()
      await Promise.all(chaves.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegação: rede primeiro, caindo para o index em cache
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const resp = await fetch(request)
          const cache = await caches.open(SHELL)
          cache.put('./index.html', resp.clone())
          return resp
        } catch {
          const cache = await caches.open(SHELL)
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error()
        }
      })(),
    )
    return
  }

  // Estáticos: cache primeiro, atualização em segundo plano
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME)
      const emCache = await cache.match(request)
      const rede = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') cache.put(request, resp.clone())
          return resp
        })
        .catch(() => null)

      if (emCache) {
        rede // dispara atualização sem bloquear
        return emCache
      }
      const resp = await rede
      return resp || new Response('', { status: 504, statusText: 'Offline' })
    })(),
  )
})
