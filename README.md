# Namaz Kar?

<img src="icons/favicon-round.svg" alt="Namaz Kar logo" width="96" height="96">

Prayer times for the Kashmir Valley based on [the official Meeqat published by Dar-ul-Uloom Rahimiyyah, Bandipur](http://raheemiyyah.com/meeqat-us-salat/). This repo contains a small, offline-capable web app that shows today's prayer times, highlights the next prayer, and supports browser notifications, including Web Push when the backend is configured.

Live deployment: [namazkar.vercel.app](https://namazkar.vercel.app)

**Why this app**
- Because most apps showed incorrect prayer times for the Kashmir Valley, I created a small, lightweight, offline-capable PWA.
- Simple, fast, and mobile-first
- Works offline via a service worker
- Local city offsets supported
- Uses Kaeshir names for prayer times
- Per-prayer notification toggles
- Clean dark/light themes

**Features**
- **Daily timetable:** Renders today's times from [data/table.json](data/table.json) using the DD-MM date key.
- **City offsets:** Applies per-city minute offsets from [data/offset.json](data/offset.json).
- **Next prayer:** Shows the next upcoming prayer with a live countdown.
- **Notifications:** Global enable + per-prayer toggles, with foreground timers and Web Push support for background delivery.
- **Dark mode:** Default dark theme with automatic icon inversion.
- **PWA caching:** Cache-first for assets and data for quick startup.

**Project Structure**
- [index.html](index.html): App markup and layout.
- [styles.css](styles.css): All styling, including themes, icons, and responsive tweaks.
- [app.js](app.js): UI logic, rendering, next-prayer calculation, and notification controls.
- [persist.js](persist.js): Service worker for caching and notification scheduling.
- [manifest.json](manifest.json): PWA metadata.
- [data/table.json](data/table.json): Timetable data, keyed by date (`DD-MM`). Times stored in 24-hour format.
- [data/offset.json](data/offset.json): City list and minute offsets.
- [icons/](icons/): SVG icons (bell, bell-slash, dark-mode, mosque, round favicon, Apple touch icon).
- [api/](api/): Vercel serverless endpoints for VAPID key lookup, Firestore-backed subscription storage, and push delivery.
- [server/push-server.js](server/push-server.js): Local helper script for sending a test push notification.

**Data Format**
- `table.json`
	- Keys: `DD-MM` (e.g., `09-02` for 9 Feb)
	- Values: object of prayer names → time strings in 24-hour `HH:MM`
- `offset.json`
	- `base_city`: default city
	- `cities`: map of city → `{ offset: number }` (minutes; can be negative)

**Display vs Storage**
- Timetable times are stored as 24-hour `HH:MM` in JSON.
- The UI displays times in 12-hour format with AM/PM for readability.

**Notifications**
- Grant permissions via the global bell in the top bar.
- Toggle per-prayer notifications via the bell icon next to each prayer.
- The app uses foreground timers when the page is open and Web Push through the service worker when the backend is configured.
- Permissions or availability differences across browsers may affect behavior; if blocked, you will see a disabled bell icon.

**Push / Backend Setup**
- Generate VAPID keys and add these environment variables in Vercel:

```bash
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

- For Firestore-backed subscription storage, add your Firebase service account JSON as `FIREBASE_SERVICE_ACCOUNT`.
- Add `ADMIN_TOKEN` for the protected push management and scheduler endpoints.
- Firestore stores subscriptions in a `subscriptions` collection.
- To deliver scheduled pushes automatically, call `POST /api/trigger-scheduled` every minute from a cron job or scheduler.
- For a one-off manual push test, save a subscription JSON file from the browser and run `node server/push-server.js ./subscription.json`.

**Offline / PWA**
- Assets and data are cached by [persist.js](persist.js) with a cache-first strategy.
- On updates, you may need a hard refresh to pick up changes:
	- Windows: Ctrl+F5 (or clear site data).
	- Alternatively, open DevTools → Application → Service Workers → Unregister, then reload.

**Quick Start**
- Option 0: Use the live deployment: [namazkar.vercel.app](https://namazkar.vercel.app) (full PWA + notifications)
- Option 1: Open [index.html](index.html) directly (no notifications).
- Option 2: Run a local server (recommended for service worker + notifications and Web Push testing):

```bash
# Node
npx serve .

# Python 3
python -m http.server 8080

# PowerShell (Windows, IIS Express-like via http-server if installed)
# Install once: npm i -g http-server
http-server -p 8080
```

Then visit http://localhost:8080.

**Local Push Testing**
- Web Push requires HTTPS in a real browser context, so use a secure tunnel or deploy preview for smartphone testing.
- If you want to test a push manually from your machine, capture the browser subscription JSON and run:

```bash
export VAPID_PUBLIC_KEY='...'
export VAPID_PRIVATE_KEY='...'
node server/push-server.js ./subscription.json
```

**Development Notes**
- Timetable lookup uses the current date key in `DD-MM`.
- Changing the selected city persists in `localStorage`.
- Per-prayer notification state also persists in `localStorage`.
- Dark mode is the default; toggle via the top-right icon.
- Icons invert automatically in dark mode for visibility.
- The push backend expects `web-push` and `firebase-admin` when the serverless endpoints are deployed.

**Troubleshooting**
- Icons look pale in dark mode: confirmed inversion via `.theme-dark .icon-img` and `.theme-dark .logo`.
- README logo not visible in dark mode: the image now uses `icons/favicon-round.svg`, which has a white background for contrast.
- Notification bells not clickable: ensure permissions are granted; otherwise the icons appear disabled.
- Timetable not updating: verify `data/table.json` has a key for today in `DD-MM` format.
- Changes not visible: perform a hard reload or clear the service worker cache.

**Contributing**
- Issues and PRs are welcome for:
	- Additional cities/offsets
	- UI polish and accessibility
	- Data corrections
	- Performance and caching improvements

**License**
- See [LICENSE](LICENSE).
