const CACHE = "namazkar-pwa-v3";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/data/table.json",
  "/data/offset.json",
  "/icons/dark-mode.svg",
  "/icons/mosque.svg",
  "/icons/bell.svg",
  "/icons/bell-slash.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/favicon-round.svg",
  "/icons/apple-touch-icon.svg"
];
const CORE_ASSET_SET = new Set(CORE_ASSETS);

function normalizePathFromUrl(urlString) {
  const url = new URL(urlString, self.location.origin);
  return url.pathname;
}

const PRAYER_LABELS = {
  Fajr: "Subah",
  Sunrise: "Zawaal",
  Dhuhr: "Pishan",
  Asr: "Digar",
  Maghrib: "Shaam",
  Isha: "Khoftan"
};

function getPrayerLabel(prayerKey) {
  return PRAYER_LABELS[prayerKey] || prayerKey;
}

function getPrayerNotificationText(prayerKey) {
  const prayerLabel = getPrayerLabel(prayerKey);
  return {
    title: prayerLabel,
    body: `${prayerLabel} waqt wot`
  };
}

function normalizeNotificationUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('/')) {
    try {
      return new URL(text, self.location.origin).toString();
    } catch (err) {
      return '';
    }
  }
  try {
    const u = new URL(text);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch (err) {
    return '';
  }
  return '';
}

self.addEventListener("install", e => {e.waitUntil(
    caches
      .open(CACHE)
      .then(c => {return c.addAll(CORE_ASSETS);
      })
      .then(() => {return self.skipWaiting();
      })
      .catch(err => {
        console.error("Service worker install failed:", err);
        throw err;
      })
  );
});

self.addEventListener("activate", e => {e.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames =>
        Promise.all(cacheNames.map(name => (name !== CACHE ? caches.delete(name) : Promise.resolve())))
      ),
      caches.open(CACHE).then(async cache => {
        const requests = await cache.keys();
        await Promise.all(
          requests.map(request => {
            const path = normalizePathFromUrl(request.url);
            if (!CORE_ASSET_SET.has(path)) {
              return cache.delete(request);
            }
            return Promise.resolve();
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const requestUrl = new URL(e.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const path = requestUrl.pathname;
  if (!CORE_ASSET_SET.has(path)) {
    return;
  }

  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

async function readCachedJson(path) {
  const response = await caches.match(path);
  if (!response) return null;
  try {
    return await response.json();
  } catch (err) {
    return null;
  }
}

self.addEventListener("message", async e => {
  if (e.data.type !== "SCHEDULE") return;

  const [table, offsetData] = await Promise.all([
    readCachedJson("/data/table.json"),
    readCachedJson("/data/offset.json")
  ]);

  if (!table || !table.days || !offsetData || !offsetData.cities) return;

  const city = e.data.city && offsetData.cities[e.data.city] ? e.data.city : (offsetData.base_city || Object.keys(offsetData.cities)[0]);
  const offset = (offsetData.cities[city] && offsetData.cities[city].offset) || 0;

  const now = new Date();
  const key =
    String(now.getDate()).padStart(2, "0") + "-" +
    String(now.getMonth() + 1).padStart(2, "0");

  const times = table.days[key];
  if (!times) return;
  const enabled = e.data.enabledPrayers || {};


  for (const prayer in times) {
    if (!enabled[prayer]) continue;
    const [h, m] = times[prayer].split(":").map(Number);
    const fireAt = new Date();
    fireAt.setHours(h, m + offset, 0, 0);

    // Only show notification if time is very near (≤ 3 seconds)
    if (fireAt > now && fireAt - now < 3_000) {
      const notificationText = getPrayerNotificationText(prayer);
      self.registration.showNotification(notificationText.title, {
        body: notificationText.body,
        tag: prayer,
        renotify: true
      });
    }
  }
});

// Handle incoming push messages from a Push Service (Web Push)
self.addEventListener('push', event => {let payload = { title: 'Namaz Kar', body: 'waqt wot' };
  try {
    if (event.data) {
      payload = event.data.json();}
  } catch (err) {
    // fall back to text
    try { payload = { title: 'Namaz Kar', body: event.data.text() }; } catch (e) {}
  }
  const clickUrl = normalizeNotificationUrl(payload.url);
  const icon = normalizeNotificationUrl(payload.icon) || '/icons/favicon-round.svg';
  const image = normalizeNotificationUrl(payload.image);
  const badge = normalizeNotificationUrl(payload.badge) || '/icons/icon-192.png';
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag || 'namazkar-push',
      renotify: true,
      icon,
      image: image || undefined,
      badge: badge || undefined,
      requireInteraction: payload.requireInteraction === true,
      data: {
        url: clickUrl || ''
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const clickUrl = event.notification && event.notification.data && typeof event.notification.data.url === 'string'
    ? event.notification.data.url.trim()
    : '';

  if (clickUrl) {
    event.waitUntil(clients.openWindow(clickUrl));
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// Optional: handle subscription change (e.g., when push service rotates keys)
self.addEventListener('pushsubscriptionchange', event => {
  // Best-effort: try to resubscribe in the worker so the server gets the new endpoint even if the page is closed.
  event.waitUntil(
    (async () => {
      try {
        const keyResponse = await fetch('/api/vapidPublicKey');
        if (!keyResponse.ok) return;
        const keyData = await keyResponse.json();
        if (!keyData || !keyData.publicKey) return;

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        });

        // Helper to convert ArrayBuffer to base64url format (web-push expects this format)
        function toBase64Url(buffer) {
          if (!buffer) return null;
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          // Use base64url format (URL-safe, no padding): replace +/= with -_
          return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }

        // Explicitly serialize PushSubscription to ensure keys are included in base64url format
        const serializedSub = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: toBase64Url(subscription.getKey('p256dh')),
            auth: toBase64Url(subscription.getKey('auth'))
          }
        };

        await fetch('/api/update-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: serializedSub })
        });

        // Notify any open clients to refresh their local state.
        const all = await clients.matchAll({ includeUncontrolled: true });
        for (const c of all) {
          c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
        }
      } catch (err) {
        // ignore
      }
    })()
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
