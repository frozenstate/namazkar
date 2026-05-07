const CACHE = "namazkar-pwa-v2";
const OLD_CACHES = ["namazkar-pwa-v1"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll([
        "/",
        "/index.html",
        "/styles.css",
        "/app.js",
        "/icons/dark-mode.svg",
        "/icons/mosque.svg",
        "/icons/bell.svg",
        "/icons/bell-slash.svg",
        "/manifest.json",
        "/data/table.json",
        "/data/offset.json"
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames.map(name =>
            OLD_CACHES.includes(name) ? caches.delete(name) : Promise.resolve()
          )
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener("message", async e => {
  if (e.data.type !== "SCHEDULE") return;

  const [table, offsetData] = await Promise.all([
    fetch("/data/table.json").then(r => r.json()),
    fetch("/data/offset.json").then(r => r.json())
  ]);

  const offset = offsetData.cities[e.data.city].offset;

  const now = new Date();
  const key =
    String(now.getDate()).padStart(2, "0") + "-" +
    String(now.getMonth() + 1).padStart(2, "0");

  const times = table.days[key];
  const enabled = e.data.enabledPrayers || {};


  for (const prayer in times) {
    if (!enabled[prayer]) continue;
    const [h, m] = times[prayer].split(":").map(Number);
    const fireAt = new Date();
    fireAt.setHours(h, m + offset, 0, 0);

    // Only show notification if time is very near (≤ 3 seconds)
    if (fireAt > now && fireAt - now < 3_000) {
      self.registration.showNotification(prayer, {
        body: "Namazi Hund Waqt Wot",
        tag: prayer,
        renotify: true
      });
    }
  }
});
