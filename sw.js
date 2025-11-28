/**
 * WYATT XXX COLE - Service Worker
 * PWA Offline Support & Caching
 */

const CACHE_NAME = 'wxxxc-v1';
const STATIC_CACHE = 'wxxxc-static-v1';
const DYNAMIC_CACHE = 'wxxxc-dynamic-v1';

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/gallery.html',
  '/booking.html',
  '/merch.html',
  '/world.html',
  '/contact.html',
  '/terms.html',
  '/privacy.html',
  '/2257.html',
  '/dmca.html',
  '/css/styles.css',
  '/css/effects.css',
  '/js/main.js',
  '/js/effects.js',
  '/images/logo.png',
  '/manifest.json',
  '/offline.html'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.log('[SW] Cache error:', err))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls and external requests
  if (url.pathname.startsWith('/api/') || url.origin !== location.origin) {
    return;
  }

  // For HTML pages - network first, fallback to cache
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clone and cache the response
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(response => response || caches.match('/offline.html'));
        })
    );
    return;
  }

  // For other assets - cache first, fallback to network
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(request)
          .then(fetchResponse => {
            // Don't cache non-successful responses
            if (!fetchResponse || fetchResponse.status !== 200) {
              return fetchResponse;
            }
            // Clone and cache
            const responseClone = fetchResponse.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
            return fetchResponse;
          });
      })
      .catch(() => {
        // Return placeholder for images
        if (request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
          return caches.match('/images/placeholder.png');
        }
      })
  );
});

// Background sync for form submissions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Push notifications
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New update from WXXXC!',
    icon: '/images/icon-192x192.png',
    badge: '/images/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'explore', title: 'View', icon: '/images/check.png' },
      { action: 'close', title: 'Close', icon: '/images/close.png' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('WYATT XXX COLE', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling from main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded');
