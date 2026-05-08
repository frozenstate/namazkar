let timetable, cities;
let selectedCity;
let enabledPrayers = {};
let cityNames = [];
let isInteractingWithCityResults = false;

const PRAYER_LABELS = {
  "Fajr": "Subah",
  "Sunrise": "Zawaal",
  "Dhuhr": "Pishan",
  "Asr": "Digar",
  "Maghrib": "Shaam",
  "Isha": "Khoftan"
};

const timesDiv = document.getElementById("times");
const cityPicker = document.getElementById("cityPicker");
const citySearch = document.getElementById("citySearch");
const cityResults = document.getElementById("cityResults");
// topbar elements
const currentDateEl = document.getElementById("current-date");
const currentTimeEl = document.getElementById("current-time");
const notifyGlobal = document.getElementById("notifyGlobal");
const nextNameEl = document.getElementById("next-name");
const nextTimeEl = document.getElementById("next-time");
const nextCountdownEl = document.getElementById("next-countdown");
const themeToggle = document.getElementById("themeToggle");
const offsetText = document.getElementById("offset-text");
const toastContainer = document.getElementById("toast-container");

function updateNotifyIconState() {
  if (!notifyGlobal) return;
  const supported = "Notification" in window;
  if (!supported) {
    notifyGlobal.classList.add("disabled");
    notifyGlobal.classList.remove("enabled");
    notifyGlobal.title = "Notifications not supported";
    notifyGlobal.setAttribute("aria-disabled", "true");
    const img = notifyGlobal.querySelector('.icon-img');
    if (img) img.src = 'icons/bell-slash.svg';
    return;
  }
  const perm = Notification.permission;
  const isEnabled = perm === "granted";
  notifyGlobal.classList.toggle("disabled", !isEnabled);
  notifyGlobal.classList.toggle("enabled", isEnabled);
  notifyGlobal.title = isEnabled ? "Notifications enabled" : "Enable notifications";
  notifyGlobal.setAttribute("aria-disabled", isEnabled ? "false" : "true");
  const img = notifyGlobal.querySelector('.icon-img');
  if (img) img.src = isEnabled ? 'icons/bell.svg' : 'icons/bell-slash.svg';

  // Also log service worker status for debugging
  if (isEnabled && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      console.log("Service worker status: active and ready");
    }).catch(err => {
      console.warn("Service worker not ready:", err);
    });
  }
}

function loadEnabledPrayers() {
  try {
    const raw = localStorage.getItem("prayerNotifications");
    enabledPrayers = raw ? JSON.parse(raw) : {};
  } catch (e) {
    enabledPrayers = {};
  }
}

function saveEnabledPrayers() {
  localStorage.setItem("prayerNotifications", JSON.stringify(enabledPrayers));
}

async function loadData() {
  loadEnabledPrayers();
  try {
    timetable = await fetch("data/table.json").then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}: Failed to load table.json`);
      return r.json();
    });

    if (!timetable || !timetable.days) {
      throw new Error("Invalid table.json structure: missing days");
    }

    cities = await fetch("data/offset.json").then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}: Failed to load offset.json`);
      return r.json();
    });

    if (!cities || !cities.cities) {
      throw new Error("Invalid offset.json structure: missing cities");
    }
  } catch (err) {
    console.error("Error loading data:", err);
    showToast(`Error: ${err.message}. Retrying...`, 4000);
    setTimeout(loadData, 3000);
    return;
  }

  selectedCity =
    localStorage.getItem("city") || (cities?.base_city || Object.keys(cities.cities)[0]);
  if (!cities.cities[selectedCity]) {
    selectedCity = cities.base_city || Object.keys(cities.cities)[0];
  }

  initTheme();
  populateCities();
  renderTimes();
  updateDayContext();
}

function populateCities() {
  cityNames = Object.keys(cities.cities);
  updateSelectedCityPlaceholder();
  bindCitySearch();
  renderCityResults(citySearch?.value || "", false);
}

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

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreCity(query, city) {
  if (!query) return 0;
  const normalizedQuery = normalizeText(query);
  const normalizedCity = normalizeText(city);
  if (normalizedCity === normalizedQuery) return 10000;

  let score = 0;
  if (normalizedCity.startsWith(normalizedQuery)) score += 5000;

  const containsIndex = normalizedCity.indexOf(normalizedQuery);
  if (containsIndex >= 0) score += 3000 - containsIndex;

  let cityIndex = 0;
  let hits = 0;
  for (const char of normalizedQuery) {
    cityIndex = normalizedCity.indexOf(char, cityIndex);
    if (cityIndex === -1) return -1;
    hits += 1;
    cityIndex += 1;
  }

  return score + (hits * 25) - normalizedCity.length;
}

function getMatchingCities(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    return cityNames.slice();
  }

  return cityNames
    .map(city => ({ city, score: scoreCity(trimmed, city) }))
    .filter(entry => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.city.localeCompare(b.city))
    .map(entry => entry.city);
}

function updateSelectedCityPlaceholder() {
  if (citySearch && document.activeElement !== citySearch) {
    citySearch.value = "";
    citySearch.placeholder = selectedCity || "Search regions";
    citySearch.dataset.currentCity = selectedCity || "";
  }
}

function closeCityResults() {
  if (cityResults) {
    cityResults.classList.remove("open");
    cityResults.innerHTML = "";
  }
}

function openCityResults() {
  if (cityResults) cityResults.classList.add("open");
}

function selectCity(city) {
  if (!city || city === selectedCity || !cities.cities[city]) {
    closeCityResults();
    if (citySearch) citySearch.blur();
    isInteractingWithCityResults = false;
    return;
  }

  selectedCity = city;
  localStorage.setItem("city", selectedCity);
  updateSelectedCityPlaceholder();
  renderTimes();
  scheduleNotifications();
  renderCityResults("", false);
  if (citySearch) {
    citySearch.value = "";
    citySearch.blur();
  }
  isInteractingWithCityResults = false;
  closeCityResults();
}

function renderCityResults(query, shouldOpen = true) {
  if (!cityResults) return;

  const matchingCities = getMatchingCities(query);
  cityResults.innerHTML = "";

  if (!matchingCities.length) {
    const empty = document.createElement("div");
    empty.className = "city-empty";
    empty.textContent = "No matching regions";
    cityResults.appendChild(empty);
    if (shouldOpen) openCityResults();
    return;
  }

  matchingCities.slice(0, 10).forEach(city => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "city-result";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(city === selectedCity));
    item.dataset.city = city;
    let startX = 0;
    let startY = 0;
    let moved = false;
    item.innerHTML = `
      <span class="city-result-name">${city}</span>
      ${city === selectedCity ? '<span class="city-result-current">Current</span>' : ''}
    `;
    item.addEventListener("pointerdown", event => {
      isInteractingWithCityResults = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
    });
    item.addEventListener("pointermove", event => {
      if (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8) {
        moved = true;
      }
    });
    item.addEventListener("pointerup", event => {
      if (!moved) {
        event.preventDefault();
        selectCity(city);
      } else {
        isInteractingWithCityResults = false;
      }
    });
    item.addEventListener("pointercancel", () => {
      isInteractingWithCityResults = false;
    });
    cityResults.appendChild(item);
  });

  if (shouldOpen) openCityResults();
}

function bindCitySearch() {
  if (!citySearch || !cityResults) return;

  citySearch.addEventListener("focus", () => {
    citySearch.value = "";
    citySearch.placeholder = "";
    renderCityResults("", true);
  });

  citySearch.addEventListener("click", () => {
    renderCityResults(citySearch.value, true);
  });

  citySearch.addEventListener("input", () => {
    renderCityResults(citySearch.value);
  });

  citySearch.addEventListener("keydown", event => {
    const firstResult = cityResults.querySelector(".city-result");
    if (event.key === "Enter") {
      event.preventDefault();
      if (firstResult) {
        selectCity(firstResult.dataset.city);
      }
    }
    if (event.key === "Escape") {
      updateSelectedCityPlaceholder();
      closeCityResults();
      citySearch.blur();
    }
  });

  citySearch.addEventListener("blur", () => {
    if (isInteractingWithCityResults) return;
    updateSelectedCityPlaceholder();
    closeCityResults();
  });

  document.addEventListener("click", event => {
    if (cityPicker && !cityPicker.contains(event.target)) {
      updateSelectedCityPlaceholder();
      closeCityResults();
    }
  });
}

function todayKey() {
  const d = new Date();
  return String(d.getDate()).padStart(2, "0") + "-" +
         String(d.getMonth() + 1).padStart(2, "0");
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(h, m + minutes, 0, 0);
  return date.toTimeString().slice(0, 5);
}

function formatTime12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const hour12 = (h % 12) || 12;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function showToast(message, duration = 3000) {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function renderTimes() {
  if (!timetable || !timetable.days || !cities || !cities.cities) {
    timesDiv.innerHTML = "<p class='error'>Unable to load prayer times. Please refresh the page.</p>";
    return;
  }

  const key = todayKey();
  const baseTimes = timetable.days[key];
  if (!baseTimes) {
    timesDiv.innerHTML = "<p class='error'>No prayer times available for today.</p>";
    return;
  }

  const offset = cities.cities[selectedCity].offset;

  if (offsetText) {
    offsetText.textContent = `${offset >= 0 ? "+" : ""}${offset} min`;
  }

  timesDiv.innerHTML = "";
  for (const prayer in baseTimes) {
    const adjusted24 = addMinutes(baseTimes[prayer], offset);
    const adjusted = formatTime12(adjusted24);
    const prayerLabel = getPrayerLabel(prayer);
    const row = document.createElement("div");
    row.className = "time";
    row.dataset.prayer = prayer;
    const permGranted = ("Notification" in window) && Notification.permission === "granted";
    const isOn = !!enabledPrayers[prayer];
    const classes = ["icon-button", "prayer-notify"]; 
    if (!permGranted) classes.push("disabled");
    else if (!isOn) classes.push("muted");
    const iconSrc = !permGranted ? 'icons/bell-slash.svg' : (isOn ? 'icons/bell.svg' : 'icons/bell-slash.svg');
    row.innerHTML = `
      <span class="name">
        <button type="button" class="${classes.join(" ")}" data-prayer="${prayer}" aria-pressed="${isOn}">
          <img class="icon-img" src="${iconSrc}" alt="Prayer notify" width="18" height="18" />
        </button>
        <strong>${prayerLabel}</strong>
      </span>
      <span class="time-value">${adjusted}</span>`;
    timesDiv.appendChild(row);
  }
  updateNextPrayer();
}

function enableAllPrayers() {
  const key = todayKey();
  const baseTimes = timetable && timetable.days && timetable.days[key];
  if (!baseTimes) return;
  for (const prayer in baseTimes) {
    enabledPrayers[prayer] = true;
  }
  saveEnabledPrayers();
  updateRowBellStates();
}

function updateRowBellStates() {
  const permGranted = ("Notification" in window) && Notification.permission === "granted";
  const buttons = timesDiv.querySelectorAll(".prayer-notify");
  buttons.forEach(btn => {
    const prayer = btn.getAttribute("data-prayer");
    const isOn = !!enabledPrayers[prayer];
    btn.classList.toggle("disabled", !permGranted);
    if (permGranted) {
      btn.classList.toggle("muted", !isOn);
    } else {
      btn.classList.remove("muted");
    }
    btn.setAttribute("aria-pressed", String(isOn));
    const img = btn.querySelector('.icon-img');
    if (img) img.src = !permGranted ? 'icons/bell-slash.svg' : (isOn ? 'icons/bell.svg' : 'icons/bell-slash.svg');
  });
}

function parseTimeToDate(timeStr, offsetMin, baseDate = new Date()) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m + offsetMin, 0, 0);
  return d;
}


function formatCountdown(ms) {
  if (ms <= 0) return "Now";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  return `${m}m ${String(s).padStart(2,'0')}s`;
}

function updateDayContext() {
  const now = new Date();
  const isPhone = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  const dateOpts = isPhone ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const dateFmt = new Intl.DateTimeFormat(undefined, dateOpts);
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  if (currentDateEl) currentDateEl.textContent = dateFmt.format(now);
  if (currentTimeEl) currentTimeEl.textContent = timeFmt.format(now);
}

function findNextPrayer() {
  const key = todayKey();
  const baseTimes = timetable.days[key];
  const offset = cities.cities[selectedCity].offset;
  const now = new Date();
  let next = null;
  for (const prayer in baseTimes) {
    const at = parseTimeToDate(baseTimes[prayer], offset);
    if (at > now && (!next || at < next.at)) {
      const t24 = addMinutes(baseTimes[prayer], offset);
      next = { key: prayer, name: getPrayerLabel(prayer), at, timeStr: formatTime12(t24) };
    }
  }
  if (next) return next;
  // fallback to tomorrow's first
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tkey = String(tomorrow.getDate()).padStart(2, "0") + "-" + String(tomorrow.getMonth() + 1).padStart(2, "0");
  const tTimes = timetable.days[tkey];
  if (!tTimes) return null;
  let first = null;
  for (const prayer in tTimes) {
    const at = parseTimeToDate(tTimes[prayer], offset, tomorrow);
    if (!first || at < first.at) {
      const t24 = addMinutes(tTimes[prayer], offset);
      first = { key: prayer, name: getPrayerLabel(prayer), at, timeStr: formatTime12(t24) };
    }
  }
  return first;
}

function updateNextPrayer() {
  const next = findNextPrayer();
  if (!next) return;
  if (nextNameEl) nextNameEl.textContent = next.name;
  if (nextTimeEl) nextTimeEl.textContent = next.timeStr;
  const ms = next.at - new Date();
  if (nextCountdownEl) nextCountdownEl.textContent = formatCountdown(ms);
  // highlight row
  const prev = timesDiv.querySelector('.time.next');
  if (prev) prev.classList.remove('next');
  const row = timesDiv.querySelector(`.time[data-prayer="${next.key}"]`);
  if (row) row.classList.add('next');
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("Notifications not supported on this browser", 4000);
    return;
  }

  if (Notification.permission === "denied") {
    showToast("Notifications blocked. Enable in browser settings", 4000);
    return;
  }

  if (Notification.permission === "granted") {
    showToast("Notifications already enabled");
    scheduleNotifications();
    updateNotifyIconState();
    enableAllPrayers();
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    showToast("Notifications enabled");
    scheduleNotifications();
    updateNotifyIconState();
    enableAllPrayers();
    // Try to also subscribe to Push (Web Push) for background notifications
    try {
      await ensurePushSubscription();
    } catch (err) {
      console.warn('Push subscription failed:', err);
    }
  } else {
    showToast("Notifications not enabled");
    updateNotifyIconState();
  }
}

// --- Web Push helpers ---
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

async function getVapidPublicKey() {
  try {
    const res = await fetch('/api/vapidPublicKey');
    if (!res.ok) throw new Error('Failed to fetch VAPID key');
    const data = await res.json();
    return data.publicKey;
  } catch (err) {
    console.warn('Could not get VAPID key:', err);
    return null;
  }
}

async function ensurePushSubscription() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg) {
      console.warn('Service worker not ready');
      return null;
    }

    // Try to get existing subscription, but handle Firefox DOMException
    let existing = null;
    try {
      existing = await reg.pushManager.getSubscription();
      if (existing) {
        console.log('Existing push subscription found:', existing.endpoint);
        return existing;
      }
    } catch (err) {
      console.warn('Error retrieving existing subscription (Firefox bug), will unsubscribe and recreate:', err);
      // Firefox sometimes fails to retrieve subscription, try to unsubscribe first
      try {
        const allSubs = await reg.pushManager.getSubscription();
        if (allSubs) await allSubs.unsubscribe();
      } catch (e) {
        // ignore
      }
    }

    const publicKey = await getVapidPublicKey();
    if (!publicKey) {
      console.warn('No VAPID public key available from server');
      return null;
    }

    console.log('Subscribing to push notifications...');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    console.log('Push subscription created:', sub.endpoint);

    // Send subscription to server so it can be stored and used to send pushes
    try {
      const response = await fetch('/api/save-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub, city: selectedCity, enabledPrayers })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      console.log('Subscription saved to server');
    } catch (err) {
      console.error('Failed to send subscription to server:', err);
      showToast('Warning: Could not save subscription to server', 5000);
    }

    return sub;
  } catch (err) {
    console.error('Push subscription error:', err);
    showToast('Push subscription failed: ' + err.message, 5000);
    return null;
  }
}

// If service worker informs of subscription changes, attempt re-subscribe in page
navigator.serviceWorker && navigator.serviceWorker.addEventListener && navigator.serviceWorker.addEventListener('message', e => {
  if (e.data && e.data.type === 'PUSH_SUBSCRIPTION_CHANGED') {
    // attempt to re-subscribe when client receives this message
    ensurePushSubscription().catch(() => {});
  }
});


let notificationTimers = {};

function clearNotificationTimers() {
  Object.values(notificationTimers).forEach(timerId => clearTimeout(timerId));
  notificationTimers = {};
}

function scheduleNotifications() {
  if (Notification.permission !== "granted") return;

  // Try to notify service worker for background notifications
  navigator.serviceWorker.ready.then(reg => {
    const worker = reg.active || reg.waiting || reg.installing;
    if (worker) {
      worker.postMessage({
        type: "SCHEDULE",
        city: selectedCity,
        enabledPrayers
      });
    }
  }).catch(() => {});

  // Schedule in-page timers for foreground notifications (24h window)
  clearNotificationTimers();
  const key = todayKey();
  const baseTimes = timetable.days[key];
  if (!baseTimes) return;
  const offset = cities.cities[selectedCity].offset;
  const now = new Date();

  for (const prayer in baseTimes) {
    if (!enabledPrayers[prayer]) continue;
    const fireAt = parseTimeToDate(baseTimes[prayer], offset);
    const ms = fireAt - now;
    // Only schedule if within next 24 hours
    if (ms > 0 && ms <= 86_400_000) {
      notificationTimers[prayer] = setTimeout(() => {
        const notificationText = getPrayerNotificationText(prayer);
        new Notification(notificationText.title, {
          body: notificationText.body,
          tag: prayer,
          renotify: true,
          icon: "icons/mosque.svg"
        });
        // Inform server of current preferences for this subscription
        updateServerSubscription().catch(() => {});
      }, ms);
    }
  }
}

if (notifyGlobal) notifyGlobal.onclick = enableNotifications;
updateNotifyIconState();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("persist.js", { scope: "/" }).then(reg => {
    console.log("Service worker registered successfully:", reg);
  }).catch(err => {
    console.error("Service worker registration failed:", err);
    showToast("Failed to register service worker: " + err.message, 5000);
  });
}

setInterval(() => {
  if (Notification.permission === "granted") {
    scheduleNotifications();
  }
  updateNotifyIconState();
  updateRowBellStates();
}, 60_000);

// Clear timers on page unload
window.addEventListener("beforeunload", clearNotificationTimers);

// live countdown every second
setInterval(() => {
  updateDayContext();
  updateNextPrayer();
}, 1_000);


loadData();

timesDiv.addEventListener("click", async (e) => {
  const btn = e.target.closest(".prayer-notify");
  if (!btn) return;
  const prayer = btn.getAttribute("data-prayer");

  if (!("Notification" in window)) {
    showToast("Notifications not supported on this browser", 4000);
    return;
  }

  if (Notification.permission !== "granted") {
    await enableNotifications();
    if (Notification.permission !== "granted") {
      updateRowBellStates();
      return;
    }
  }

  enabledPrayers[prayer] = !enabledPrayers[prayer];
  saveEnabledPrayers();
  updateRowBellStates();
  scheduleNotifications();
  // send updated enabledPrayers to server for this subscription
  updateServerSubscription().catch(() => {});
});

// Send or update subscription metadata to server
async function updateServerSubscription() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const payload = { subscription: sub, city: selectedCity, enabledPrayers };
  // Try update first, then save if not exists
  try {
    await fetch('/api/update-subscription', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch (err) {
    try {
      await fetch('/api/save-subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Could not send subscription to server', e);
    }
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  // Default to dark if no saved theme
  const shouldDark = saved ? saved === 'dark' : true;
  document.body.classList.toggle('theme-dark', shouldDark);
}

if (themeToggle) {
  themeToggle.onclick = () => {
    const isDark = document.body.classList.toggle('theme-dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
}
