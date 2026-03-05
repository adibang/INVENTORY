const CACHE_NAME = 'muda-cache-v1';
const urlsToCache = [
  '/beta/',
  '/beta/index.html',
  '/beta/relasi.html',
  '/beta/pembelian.html',
  '/beta/laporan.html',
  '/beta/master-data.html',
  '/beta/admin-panel.html',
  '/beta/manifest.json',
  '/beta/icons/72.png',
  '/beta/icons/96.png',
  '/beta/icons/128.png',
  '/beta/icons/144.png',
  '/beta/icons/152.png',
  '/beta/icons/192.png',
  '/beta/icons/384.png',
  '/beta/icons/512.png',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install event: membuka cache dan menambahkan semua aset ke dalamnya
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event: membersihkan cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: melayani dari cache, atau mengambil dari jaringan lalu menyimpannya
self.addEventListener('fetch', (event) => {
  // Abaikan request selain GET
  if (event.request.method !== 'GET') return;

  // Abaikan request ke IndexedDB atau API internal browser
  if (event.request.url.startsWith('chrome-extension://') || 
      event.request.url.includes('extension') ||
      event.request.url.includes('browser-sync')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Jika ditemukan di cache, kembalikan
        if (response) {
          return response;
        }

        // Jika tidak, lakukan fetch ke jaringan
        return fetch(event.request).then(
          (networkResponse) => {
            // Validasi response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone response karena akan digunakan dua kali
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // Simpan aset yang baru diambil ke dalam cache
                // Hanya cache file dari domain sendiri atau CDN yang diizinkan
                const requestUrl = new URL(event.request.url);
                if (requestUrl.origin === location.origin || 
                    requestUrl.hostname === 'cdn.jsdelivr.net') {
                  cache.put(event.request, responseToCache);
                }
              });

            return networkResponse;
          }
        ).catch((error) => {
          console.log('Fetch failed; returning offline page instead.', error);
          // Opsional: Tampilkan halaman offline kustom
          return new Response('Anda sedang offline. Silakan periksa koneksi internet Anda.', {
            status: 200,
            statusText: 'OK',
            headers: new Headers({
              'Content-Type': 'text/html; charset=utf-8'
            })
          });
        });
      })
  );
});

// Background sync untuk transaksi offline (fitur opsional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
});

// Fungsi untuk melakukan sync transaksi yang disimpan saat offline
async function syncTransactions() {
  try {
    // Buka database
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('POSKasirDB', 20);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Ambil transaksi pending dari IndexedDB
    const tx = db.transaction('pendingTransactions', 'readonly');
    const store = tx.objectStore('pendingTransactions');
    const pendingTransactions = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Di sini Anda bisa menambahkan logika untuk mengirim transaksi ke server jika ada.
    console.log('Sinkronisasi transaksi pending:', pendingTransactions);

    // Setelah berhasil, Anda bisa menghapusnya dari IndexedDB atau menandai sebagai sudah disinkron.
    // (Implementasi tergantung pada kebutuhan backend)

  } catch (error) {
    console.error('Gagal melakukan sinkronisasi:', error);
  }
}

// PUSH notification handler (jika diperlukan di masa depan)
self.addEventListener('push', (event) => {
  const title = 'MUDA';
  const options = {
    body: event.data ? event.data.text() : 'Ada update terbaru dari aplikasi',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
