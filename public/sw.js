importScripts('/src/js/idb.js');
importScripts('/src/js/utility.js');

// Cambiar la versión cada que se modifique un archivo de STATIC_ASSETS
var CACHE_STATIC_NAME = "static-v20";
var CACHE_DYNAMIC_NAME = "dynamic-v2";

// Deben coincidir exactamente con las URLs que pide index.html
var STATIC_ASSETS = [
    '/',
    // Sin .html: Cloudflare redirige /offline.html a /offline y una respuesta
    // redirigida no se puede usar para una navegación
    '/offline',
    '/manifest.json',
    '/help/',
    '/src/css/help.css',
    '/src/images/icons/icon-192x192.png',
    '/src/images/icons/icon-512x512.png',
    '/src/js/app.js',
    '/src/js/feed.js',
    '/src/js/idb.js',
    '/src/js/utility.js',
    '/src/css/app.css',
    '/src/css/feed.css',
    '/src/images/main-image.jpg',
    '/src/images/img.jpg',
    POST_IMAGE,
    'https://fonts.googleapis.com/css?family=Roboto:400,700',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.min.js'
];

self.addEventListener('install', function (event) {
    console.log('[Install]', event);
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
            .then(function (cache) {
                return cache.addAll(STATIC_ASSETS);
            })
    );
});

self.addEventListener("activate", function (event) {
    console.log(" [Service Worker] Activating Service Worker...", event);
    event.waitUntil(
        caches.keys().then(function (keyList) {
            return Promise.all(
                keyList.map(function (key) {
                    if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
                        console.log(" [Service Worker] Removing old cache...", key);
                        return caches.delete(key);
                    }
                }),
            );
        }).then(function () {
            return self.clients.claim();
        }),
    );
});

self.addEventListener("fetch", function (event) {
    // Los POST no pasan por la caché; los encolados los envía el evento sync
    if (event.request.method !== 'GET') {
        return;
    }

    if (event.request.url.indexOf(POSTS_URL) > -1) {
        // Red primero, y se guardan los posts en IndexedDB para verlos offline
        event.respondWith(
            fetch(event.request).then(function (res) {
                var copy = res.clone();
                clearAllData('posts')
                    .then(function () {
                        return copy.json();
                    })
                    .then(function (data) {
                        return Promise.all(data.map(function (post) {
                            return writeData('posts', post);
                        }));
                    });
                return res;
            }),
        );
    } else {
        event.respondWith(
            caches.match(event.request).then(function (response) {
                if (response) {
                    return response;
                } else {
                    return fetch(event.request)
                        .then(function (res) {
                            return caches.open(CACHE_DYNAMIC_NAME).then(function (cache) {
                                cache.put(event.request.url, res.clone());
                                return res;
                            });
                        })
                        .catch(function (err) {
                            return caches.open(CACHE_STATIC_NAME).then(function (cache) {
                                return cache.match("/offline");
                            });
                        });
                }
            }),
        );
    }
});

// Se dispara al recuperar la conexión si hay posts encolados
self.addEventListener('sync', function (event) {
    console.log('[Service Worker] Background sync', event);
    if (event.tag === SYNC_TAG) {
        event.waitUntil(
            syncPendingPosts()
                .then(function (result) {
                    return self.clients.matchAll().then(function (clients) {
                        if (result.sent > 0) {
                            clients.forEach(function (client) {
                                client.postMessage({type: 'posts-synced'});
                            });
                        }
                        // Con la página abierta, ella reintenta. Sin páginas abiertas se
                        // rechaza para que el navegador vuelva a disparar el sync más tarde.
                        if (result.pending > 0 && clients.length === 0) {
                            throw new Error('Quedaron ' + result.pending + ' post(s) sin enviar');
                        }
                    });
                })
        );
    }
});
