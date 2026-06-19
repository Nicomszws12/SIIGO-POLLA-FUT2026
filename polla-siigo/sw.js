const CACHE_NAME = 'polla-cache-v2'; // Se incrementa la versión para forzar la actualización
const APP_SHELL = [
  '/',
  'index.html',
  'app.html',
  'tabla.html',
  'cuentas.html',
  'reglas.html',
  'lobby.html',
  'admin.html',
  'sala-admin.html',
  'css/estilos.css',
  'js/config.js',
  'js/fixture.js',
  'js/utils.js',
  'js/store.js',
  'js/puntos.js',
  'js/api-futbol.js',
  'js/email.js',
  'js/ia.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cacheando el app shell');
        return cache.addAll(APP_SHELL);
      })
      .catch(error => {
        console.error('Service Worker: Falló el cacheo inicial', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Limpiando cache antiguo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Si está en caché, lo devuelve. Si no, lo busca en la red.
      return response || fetch(event.request).then(networkResponse => {
        // Clona la respuesta para poder guardarla en caché y devolverla al navegador.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          // Solo guarda en caché las peticiones GET de nuestro propio dominio.
          if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
            cache.put(event.request, responseToCache);
          }
        });
        return networkResponse;
      }).catch(error => {
        // Manejar errores de red (offline)
        console.log('Service Worker: Fetch fallido; el usuario podría estar offline.', error);
      });
    })
  );
});