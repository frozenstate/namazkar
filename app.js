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

const CALENDAR_MODE_KEY = "calendarMode";
const CALENDAR_SETTINGS_KEY = "calendarSettings";
const DAY_MS = 24 * 60 * 60 * 1000;
let calendarSettings = loadCachedCalendarSettings();
let calendarMode = localStorage.getItem(CALENDAR_MODE_KEY) === "gregorian" ? "gregorian" : "hijri";
let calendarSettingsPromise = null;

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
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');

function applyTheme(isDark) {
  document.documentElement.classList.toggle('theme-dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  if (document.body) {
    document.body.classList.toggle('theme-dark', isDark);
    document.body.style.colorScheme = isDark ? 'dark' : 'light';
  }
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', isDark ? '#141a22' : '#0f766e');
  }
}

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
    }).catch(err => {});
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

function saveSubscriptionBackup() {
  // Save a backup of current settings for endpoint rotation recovery
  try {
    localStorage.setItem('subscriptionBackup', JSON.stringify({
      city: selectedCity,
      enabledPrayers: enabledPrayers,
      timestamp: Date.now()
    }));
  } catch (err) {}
}

function loadSubscriptionBackup() {
  try {
    const backup = localStorage.getItem('subscriptionBackup');
    if (!backup) return null;
    const data = JSON.parse(backup);
    // Only use backup if it's less than 30 days old
    if (Date.now() - data.timestamp < 30 * 24 * 60 * 60 * 1000) {
      return data;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function saveCalendarMode() {
  localStorage.setItem(CALENDAR_MODE_KEY, calendarMode);
}

function loadCachedCalendarSettings() {
  try {
    const raw = localStorage.getItem(CALENDAR_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    return null;
  }
}

function saveCachedCalendarSettings(settings) {
  try {
    if (settings && typeof settings === "object") {
      localStorage.setItem(CALENDAR_SETTINGS_KEY, JSON.stringify(settings));
    } else {
      localStorage.removeItem(CALENDAR_SETTINGS_KEY);
    }
  } catch (err) {}
}

async function loadPersistedCalendarSettings() {
  if (calendarSettings) return calendarSettings;

  try {
    const indexedDbSettings = typeof getCalendarSettings !== "undefined"
      ? await getCalendarSettings().catch(() => null)
      : null;
    if (indexedDbSettings) {
      calendarSettings = indexedDbSettings;
      saveCachedCalendarSettings(indexedDbSettings);
      return indexedDbSettings;
    }
  } catch (err) {}

  const cachedSettings = loadCachedCalendarSettings();
  if (cachedSettings) {
    calendarSettings = cachedSettings;
    return cachedSettings;
  }

  return null;
}

function normalizeDateInput(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (text.includes("T")) return text;
  return `${text}T00:00:00`;
}

function getLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function loadCalendarSettings() {
  if (calendarSettingsPromise) return calendarSettingsPromise;

  calendarSettingsPromise = (async () => {
    const persistedSettings = await loadPersistedCalendarSettings();
    if (persistedSettings) {
      calendarSettings = persistedSettings;
    }

    try {
      const res = await fetch("/api/calendar-settings");
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load calendar settings`);
      const data = await res.json();
      const nextSettings = data && data.settings ? data.settings : null;
      if (nextSettings) {
        calendarSettings = nextSettings;
        saveCachedCalendarSettings(nextSettings);
        if (typeof saveCalendarSettings !== "undefined") {
          saveCalendarSettings(nextSettings).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Calendar settings unavailable:", err);
    }

    return calendarSettings;
  })();

  return calendarSettingsPromise.finally(() => {
    calendarSettingsPromise = null;
  });
}

function formatGregorianDate(now) {
  const isPhone = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
  const dateOpts = isPhone
    ? { weekday: "short", month: "short", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat(undefined, dateOpts).format(now);
}

function formatAdminHijriDate(now) {
  if (!calendarSettings) return null;
  const monthName = calendarSettings.monthName || calendarSettings.hijriMonth || "Hijri";
  const hijriYear = calendarSettings.hijriYear || calendarSettings.monthYear || "";
  const startDate = normalizeDateInput(calendarSettings.startDate);
  if (!startDate) return null;

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;

  const dayDiff = Math.floor((getLocalMidnight(now) - getLocalMidnight(start)) / DAY_MS) + 1;
  if (!Number.isFinite(dayDiff) || dayDiff < 1) return null;

  const suffix = hijriYear ? ` ${hijriYear} AH` : " AH";
  return `${dayDiff} ${monthName}${suffix}`;
}

function renderCalendarDate(now = new Date()) {
  if (calendarMode === "gregorian") return formatGregorianDate(now);
  return formatAdminHijriDate(now) || "Connect to internet to fetch hijri date";
}

function updateDateToggleState(formattedDate) {
  if (!currentDateEl) return;
  currentDateEl.setAttribute("aria-pressed", String(calendarMode === "gregorian"));
  currentDateEl.title = calendarMode === "gregorian"
    ? "Showing Gregorian date. Click to show hijri date."
    : (calendarSettings ? "Showing hijri date. Click to show Gregorian date." : "Connect to internet to fetch hijri date");
  currentDateEl.setAttribute("aria-label", currentDateEl.title);
  currentDateEl.dataset.calendarMode = calendarMode;
  if (formattedDate) currentDateEl.textContent = formattedDate;
}

function toggleCalendarMode() {
  calendarMode = calendarMode === "gregorian" ? "hijri" : "gregorian";
  saveCalendarMode();
  updateDayContext();
}

function isValidTimetableData(data) {
  return !!(data && typeof data === "object" && data.days && typeof data.days === "object");
}

function isValidOffsetData(data) {
  return !!(data && typeof data === "object" && data.cities && typeof data.cities === "object");
}

async function readCachedJson(path) {
  if (!("caches" in window)) return null;
  try {
    const response = await caches.match(path);
    if (!response) return null;
    return await response.json();
  } catch (err) {
    return null;
  }
}

async function fetchJson(path, errorLabel) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load ${errorLabel}`);
  return response.json();
}

function resolveSelectedCity(data) {
  const fallbackCity = data.base_city || Object.keys(data.cities)[0];
  const storedCity = localStorage.getItem("city") || fallbackCity;
  return data.cities[storedCity] ? storedCity : fallbackCity;
}

function applyLoadedData(nextTimetable, nextCities, sourceLabel = "") {
  timetable = nextTimetable;
  cities = nextCities;
  selectedCity = resolveSelectedCity(cities);
  initTheme();
  populateCities();
  renderTimes();
  updateDayContext();
  if (sourceLabel) {
    console.log(`Prayer data loaded from ${sourceLabel}`);
  }
}

async function loadData() {
  loadEnabledPrayers();
  const calendarSettingsLoad = loadCalendarSettings();

  // Try IndexedDB first for instant cold-start loading
  const [idbTimetable, idbCities] = await Promise.all([
    typeof getTimetable !== 'undefined' ? getTimetable().catch(() => null) : Promise.resolve(null),
    typeof getOffsets !== 'undefined' ? getOffsets().catch(() => null) : Promise.resolve(null)
  ]);

  const hasIDBData = isValidTimetableData(idbTimetable) && isValidOffsetData(idbCities);
  if (hasIDBData) {
    applyLoadedData(idbTimetable, idbCities, "IndexedDB");
  }

  // Fallback to Cache API if IndexedDB miss
  if (!hasIDBData) {
    const [cachedTimetable, cachedCities] = await Promise.all([
      readCachedJson("/data/table.json"),
      readCachedJson("/data/offset.json")
    ]);

    const hasCachedData = isValidTimetableData(cachedTimetable) && isValidOffsetData(cachedCities);
    if (hasCachedData) {
      applyLoadedData(cachedTimetable, cachedCities, "cache");
    }
  }

  // Always try network fetch in background
  try {
    const [nextTimetable, nextCities] = await Promise.all([
      fetchJson("data/table.json", "table.json"),
      fetchJson("data/offset.json", "offset.json")
    ]);

    if (!isValidTimetableData(nextTimetable)) {
      throw new Error("Invalid table.json structure: missing days");
    }
    if (!isValidOffsetData(nextCities)) {
      throw new Error("Invalid offset.json structure: missing cities");
    }

    const shouldReplace = timetable === undefined || nextTimetable !== timetable || nextCities !== cities;
    if (shouldReplace) {
      applyLoadedData(nextTimetable, nextCities, hasIDBData ? "network refresh" : !hasIDBData ? "network" : "network");
    }

    // Save to IndexedDB and Cache API for future loads
    if (typeof saveTimetable !== 'undefined') saveTimetable(nextTimetable).catch(() => {});
    if (typeof saveOffsets !== 'undefined') saveOffsets(nextCities).catch(() => {});
  } catch (err) {
    if (!hasIDBData) {
      console.error("Error loading data:", err);
      showToast(`Error: ${err.message}. Retrying...`, 4000);
      setTimeout(loadData, 3000);
      return;
    }
    console.warn("Background data refresh failed:", err);
  }

  await calendarSettingsLoad.catch(() => {});
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
  saveSubscriptionBackup();
  updateSelectedCityPlaceholder();
  renderTimes();
  scheduleNotifications();
  updateServerSubscription().catch(() => {});
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
    if (timesDiv) timesDiv.setAttribute('aria-busy', 'false');
    timesDiv.innerHTML = "<p class='error'>Unable to load prayer times. Please refresh the page.</p>";
    return;
  }

  const key = todayKey();
  const baseTimes = timetable.days[key];
  if (!baseTimes) {
    if (timesDiv) timesDiv.setAttribute('aria-busy', 'false');
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
  timesDiv.setAttribute('aria-busy', 'false');
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
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  updateDateToggleState(renderCalendarDate(now));
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
    // Ensure UI and server are synced: enable all prayers locally and persist
    enableAllPrayers();
    saveEnabledPrayers();
    updateRowBellStates();
    scheduleNotifications();
    updateNotifyIconState();

    try {
      // ensure push subscription exists (noop on browsers where unavailable)
      await ensurePushSubscription();
    } catch (e) { /* ignore */ }

    // propagate preferences to server
    try {
      await updateServerSubscription();
    } catch (e) {}
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    showToast("Notifications enabled");
    scheduleNotifications();
    updateNotifyIconState();
    enableAllPrayers();
    saveEnabledPrayers();
    // Try to also subscribe to Push (Web Push) for background notifications
    try {
      await ensurePushSubscription();
    } catch (err) {}
    try {
      await updateServerSubscription()
    } catch(e) {}
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
  } catch (err) {return null;
  }
}

async function ensurePushSubscription() {
  if (!('serviceWorker' in navigator)) {return null;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg) {return null;
    }

    const publicKey = await getVapidPublicKey();
    if (!publicKey) {return null;
    }// On Firefox, getSubscription() often fails. The safest approach is:
    // 1. Try to subscribe (this will reuse existing or create new)
    // 2. If it fails, ignore and continue (user still has local notifications)
    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });// Send subscription to server so it can be stored and used to send pushes
      try {
        // Properly serialize PushSubscription keys without padding
        const serializedSub = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.getKey('p256dh') ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))).replace(/=/g, '') : null,
            auth: sub.getKey('auth') ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))).replace(/=/g, '') : null
          }
        };
        const response = await fetch('/api/save-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: serializedSub, city: selectedCity, enabledPrayers })
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        console.log('[ensurePushSubscription] Subscription saved to server');
        // Note: Don't save backup here - enabledPrayers is still empty at this point
        // Backup is saved later in updateServerSubscription() when settings are finalized
      } catch (err) {showToast('Warning: Could not save subscription to server', 5000);
        console.error('[ensurePushSubscription] Failed to save subscription:', err?.message);
      }

      return sub;
    } catch (err) {
      console.error('[ensurePushSubscription] subscribe() failed:', err?.message);
      // If push subscription fails, still allow local notifications to workshowToast('Local notifications enabled (push notifications unavailable on this browser)', 4000);
      return null;
    }
  } catch (err) {return null;
  }
}

// If service worker informs of subscription changes, attempt re-subscribe in page
navigator.serviceWorker && navigator.serviceWorker.addEventListener && navigator.serviceWorker.addEventListener('message', e => {
  if (e.data && e.data.type === 'PUSH_SUBSCRIPTION_CHANGED') {
    // attempt to re-subscribe when client receives this message
    ensurePushSubscription().then(() => updateServerSubscription().catch(() => {})).catch(() => {});
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
if (currentDateEl) currentDateEl.onclick = toggleCalendarMode;
updateNotifyIconState();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("persist.js", { scope: "/" }).then(reg => {}).catch(err => {});
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


loadData().then(() => {
  if (Notification.permission === 'granted') {
    // First restore settings from server, then ensure subscription and sync
    restoreSubscriptionSettings()
      .then(() => ensurePushSubscription())
      .then(() => updateServerSubscription())
      .catch(() => {});
  }
}).catch(() => {});

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
  saveSubscriptionBackup();
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
  
  // Explicitly serialize PushSubscription to ensure keys are included
  // Use standard base64 without padding (web-push requirement)
  const serializedSub = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.getKey('p256dh') ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))).replace(/=/g, '') : null,
      auth: sub.getKey('auth') ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))).replace(/=/g, '') : null
    }
  };
  
  const payload = { subscription: serializedSub, city: selectedCity, enabledPrayers };
  
  // Log what we're sending
  console.log('[updateServerSubscription] sending to server:', {
    endpoint: serializedSub.endpoint?.slice(-30),
    hasKeys: !!serializedSub.keys,
    keyTypes: serializedSub.keys ? { p256dh: typeof serializedSub.keys.p256dh, auth: typeof serializedSub.keys.auth } : null,
    city: selectedCity,
    enabledPrayersCount: Object.keys(enabledPrayers).length
  });
  
  try {
    const r = await fetch('/api/update-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) {
      // If update failed (maybe subscription doc doesn't exist), try save-subscription
      const s = await fetch('/api/save-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!s.ok) {
        return;
      }
      return;
    }

    const data = await r.json();
    // If server reported the previous doc as invalid, force a fresh subscription and save it
    if (data && data.wasInvalid) {
      try {
        const newSub = await ensurePushSubscription();
        if (newSub) {
          await fetch('/api/save-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: newSub, city: selectedCity, enabledPrayers }) });
        }
      } catch (err) {}
    }

    // If server has stored metadata, restore it locally to keep UI consistent
    if (data && data.data) {
      try {
        const server = data.data;
        if (server.city && server.city !== selectedCity && cities && cities.cities && cities.cities[server.city]) {
          selectedCity = server.city;
          localStorage.setItem('city', selectedCity);
          updateSelectedCityPlaceholder();
          renderTimes();
        }
        if (server.enabledPrayers && typeof server.enabledPrayers === 'object') {
          enabledPrayers = server.enabledPrayers;
          saveEnabledPrayers();
          updateRowBellStates();
          scheduleNotifications();
        }
      } catch (err) {}
    }
    
    // Save current state to backup so that if subscription rotates, we can restore
    saveSubscriptionBackup();
  } catch (err) {}
}

async function restoreSubscriptionSettings() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg) return;
    
    // Try to get subscription with explicit error handling for Firefox/strict browsers
    let sub = null;
    try {
      sub = await reg.pushManager.getSubscription();
    } catch (getSubErr) {
      console.warn('[restoreSubscriptionSettings] getSubscription() threw:', getSubErr?.message);
      // In Firefox PWAs, pushManager might throw if permission context is unusual
      // Treat this as "no subscription available" and use fallback
      console.log('[restoreSubscriptionSettings] Treating getSubscription() error as no subscription (Firefox?)');
      sub = null;
    }
    
    let serializedSub;
    if (sub) {
      // Active subscription - serialize it with padding stripping (must match ensurePushSubscription)
      serializedSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.getKey('p256dh') ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))).replace(/=/g, '') : null,
          auth: sub.getKey('auth') ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))).replace(/=/g, '') : null
        }
      };
    } else {
      // No subscription (or error retrieving) - send empty one so server returns fallback
      console.log('[restoreSubscriptionSettings] No subscription, requesting server fallback');
      serializedSub = { endpoint: null, keys: { p256dh: null, auth: null } };
    }
    
    // Always query server to fetch settings (either for current subscription or fallback)
    const r = await fetch('/api/update-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: serializedSub })
    });

    if (!r.ok) {
      console.log('[restoreSubscriptionSettings] Server error, trying backup');
      const backup = loadSubscriptionBackup();
      if (backup && backup.city && cities && cities.cities && cities.cities[backup.city]) {
        selectedCity = backup.city;
        localStorage.setItem('city', selectedCity);
        enabledPrayers = backup.enabledPrayers || {};
        saveEnabledPrayers();
        console.log('[Restore-backup] restored from local backup:', backup.city);
      }
      return;
    }

    const data = await r.json();
    if (data && data.data && data.data.enabledPrayers && Object.keys(data.data.enabledPrayers).length > 0) {
      const server = data.data;
      if (server.city && cities && cities.cities && cities.cities[server.city]) {
        selectedCity = server.city;
        localStorage.setItem('city', selectedCity);
      }
      enabledPrayers = server.enabledPrayers;
      saveEnabledPrayers();
      console.log('[Restore] settings from server:', { city: selectedCity, prayersCount: Object.keys(enabledPrayers).length });
    } else {
      // Server returned empty, try local backup
      const backup = loadSubscriptionBackup();
      if (backup && backup.city && cities && cities.cities && cities.cities[backup.city]) {
        selectedCity = backup.city;
        localStorage.setItem('city', selectedCity);
        enabledPrayers = backup.enabledPrayers || {};
        saveEnabledPrayers();
        console.log('[Restore-backup] server empty, using local backup:', backup.city);
      }
    }
  } catch (err) {
    console.warn('[restoreSubscriptionSettings] error:', err && err.message);
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  // Default to dark if no saved theme
  const shouldDark = saved ? saved === 'dark' : true;
  applyTheme(shouldDark);
}

if (themeToggle) {
  themeToggle.onclick = () => {
    const isDark = !document.documentElement.classList.contains('theme-dark');
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
}

// PWA install prompt handling
initTheme();
// Show install button on mobile devices (or when beforeinstallprompt fires)
function detectMobileDevice() {
  const userAgent = navigator.userAgent || '';
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile; keep the event for later prompt
  e.preventDefault();
  deferredInstallPrompt = e;
  // show the install button if not previously dismissed
  try {
    if (installBtn && !localStorage.getItem('pwaInstallPromptShown')) {
      installBtn.classList.remove('hidden');
    }
  } catch (err) { /* ignore */ }
});

// Show install button on mobile even if beforeinstallprompt doesn't fire (Firefox, Brave)
if (installBtn && detectMobileDevice()) {
  try {
    if (!localStorage.getItem('pwaInstallPromptShown')) {
      installBtn.classList.remove('hidden');
    }
  } catch (err) { /* ignore */ }
}

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      // Standard prompt for Chromium browsers
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        localStorage.setItem('pwaInstallPromptShown', '1');
        installBtn.classList.add('hidden');
        deferredInstallPrompt = null;
        if (choice && choice.outcome === 'accepted') {
          showToast('Thanks — app installed!', 3000);
        } else {
          showToast('Install dismissed', 2000);
        }
      } catch (err) {installBtn.classList.add('hidden');
      }
    } else {
      // Fallback for browsers without beforeinstallprompt (Firefox, Brave)
      // Provide instructions to user
      showToast('Tap browser menu → "Add to home screen" or "Install"', 4000);
      localStorage.setItem('pwaInstallPromptShown', '1');
      installBtn.classList.add('hidden');
    }
  });
}

window.addEventListener('appinstalled', () => {
  try { localStorage.setItem('pwaInstallPromptShown', '1'); } catch (e) {}
  if (installBtn) installBtn.classList.add('hidden');
});
