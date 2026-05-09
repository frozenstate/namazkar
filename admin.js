const loginPanel = document.getElementById('loginPanel');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('adminPassword');
const loginStatus = document.getElementById('loginStatus');
const adminTools = document.getElementById('adminTools');
const out = document.getElementById('out');
const calendarForm = document.getElementById('calendarForm');
const calendarMonthName = document.getElementById('calendarMonthName');
const calendarHijriYear = document.getElementById('calendarHijriYear');
const calendarStartDate = document.getElementById('calendarStartDate');
const calendarMonthLength = document.getElementById('calendarMonthLength');
const calendarStatus = document.getElementById('calendarStatus');

function setLoggedIn(isLoggedIn) {
  loginPanel.classList.toggle('hidden', isLoggedIn);
  adminTools.classList.toggle('hidden', !isLoggedIn);
}

function maskEndpoint(endpoint) {
  if (!endpoint) return '—';
  const tail = endpoint.slice(-14);
  return `…${tail}`;
}

function maskSubscription(sub) {
  return {
    id: sub.id,
    endpoint: maskEndpoint(sub.subscription && sub.subscription.endpoint),
    city: sub.city || '—',
    enabledPrayers: sub.enabledPrayers || {},
    updatedAt: sub.updatedAt || '—'
  };
}

async function checkSession() {
  const res = await fetch('/api/admin-session', { credentials: 'include' });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.authenticated;
}

async function authedFetch(url, options = {}) {
  return fetch(url, { credentials: 'include', ...options });
}

function buildCurrentCalendarSeed() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-u-ca-islamic', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const parts = formatter.formatToParts(now);
  const day = Number(parts.find(part => part.type === 'day')?.value || '1');
  const monthName = parts.find(part => part.type === 'month')?.value || 'Hijri';
  const hijriYear = Number(parts.find(part => part.type === 'year')?.value || '1447');
  const seedStart = new Date(now);
  seedStart.setDate(seedStart.getDate() - Math.max(0, day - 1));
  const year = seedStart.getFullYear();
  const month = String(seedStart.getMonth() + 1).padStart(2, '0');
  const date = String(seedStart.getDate()).padStart(2, '0');
  return {
    monthName,
    hijriYear,
    monthLength: day >= 29 ? 29 : 30,
    startDate: `${year}-${month}-${date}`
  };
}

function setCalendarStatus(message, isError = false) {
  if (!calendarStatus) return;
  calendarStatus.textContent = message;
  calendarStatus.classList.toggle('error', isError);
}

function populateCalendarForm(settings) {
  if (!calendarForm) return;
  const seed = settings || buildCurrentCalendarSeed();
  calendarMonthName.value = seed.monthName || '';
  calendarHijriYear.value = seed.hijriYear || '';
  calendarStartDate.value = seed.startDate ? String(seed.startDate).slice(0, 10) : '';
  calendarMonthLength.value = String(seed.monthLength || 30);
}

async function loadCalendarSettings() {
  setCalendarStatus('Loading calendar settings...');
  try {
    const res = await authedFetch('/api/calendar-settings');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    populateCalendarForm(data.settings || null);
    if (data.settings) {
      setCalendarStatus(`Loaded ${data.settings.monthName || 'current'} month settings.`);
    } else {
      setCalendarStatus('No calendar settings saved yet. Form seeded from the current Islamic month.');
    }
  } catch (err) {
    setCalendarStatus(`Error: ${err.message}`, true);
  }
}

async function saveCalendarSettings(event) {
  event.preventDefault();
  const monthName = String(calendarMonthName.value || '').trim();
  const hijriYear = Number(calendarHijriYear.value);
  const startDate = calendarStartDate.value;
  const monthLength = Number(calendarMonthLength.value);

  if (!monthName) {
    setCalendarStatus('Month name is required.', true);
    return;
  }
  if (!Number.isInteger(hijriYear) || hijriYear < 1) {
    setCalendarStatus('Hijri year must be a positive whole number.', true);
    return;
  }
  if (!startDate) {
    setCalendarStatus('Month start date is required.', true);
    return;
  }
  if (![29, 30].includes(monthLength)) {
    setCalendarStatus('Month length must be 29 or 30 days.', true);
    return;
  }

  setCalendarStatus('Saving calendar settings...');
  try {
    const res = await authedFetch('/api/calendar-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthName,
        hijriYear,
        startDate,
        monthLength
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    populateCalendarForm(data.settings || null);
    setCalendarStatus('Calendar settings saved.');
  } catch (err) {
    setCalendarStatus(`Error: ${err.message}`, true);
  }
}

async function listSubscriptions() {
  out.innerHTML = 'Loading...';
  try {
    const res = await authedFetch('/api/list-subscriptions');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    out.innerHTML = '';
    if (!data.subscriptions || !data.subscriptions.length) {
      out.textContent = 'No subscriptions found.';
      return;
    }
    data.subscriptions.forEach(s => {
      const clean = maskSubscription(s);
      const d = document.createElement('div');
      d.className = 'sub';
      d.innerHTML = `
        <div><strong>Subscription</strong> <code>${clean.id}</code></div>
        <div><strong>Endpoint</strong> <code>${clean.endpoint}</code></div>
        <div><strong>City</strong> ${clean.city}</div>
        <div><strong>Updated</strong> ${clean.updatedAt}</div>
        <details>
          <summary>Prayer preferences</summary>
          <pre>${JSON.stringify(clean.enabledPrayers, null, 2)}</pre>
        </details>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Send test push';
      btn.onclick = async () => {
        const p = { title: 'Test', body: 'Hello from admin' };
        const r = await authedFetch('/api/send-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: s.subscription, payload: p })
        });
        alert(r.ok ? 'Sent' : 'Failed');
      };
      d.appendChild(btn);
      out.appendChild(d);
    });
  } catch (err) {
    out.innerText = 'Error: ' + err.message;
    if (String(err.message || '').includes('Unauthorized')) {
      setLoggedIn(false);
      loginStatus.textContent = 'Session expired. Please log in again.';
    }
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!password) return;
  loginStatus.classList.remove('error');
  loginStatus.textContent = 'Signing in...';
  try {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) throw new Error('Invalid password');
    passwordInput.value = '';
    loginStatus.textContent = 'Signed in.';
    loginStatus.classList.remove('error');
    setLoggedIn(true);
    await listSubscriptions();
  } catch (err) {
    loginStatus.textContent = err.message;
    loginStatus.classList.add('error');
  }
});

document.getElementById('btnList').onclick = listSubscriptions;

document.getElementById('btnTest').onclick = async () => {
  out.innerHTML = 'Creating test subscription...';
  try {
    // Create test subscription with all prayers enabled
    const enabledPrayers = {
      'Fajr': true,
      'Sunrise': true,
      'Dhuhr': true,
      'Asr': true,
      'Maghrib': true,
      'Isha': true
    };
    const r = await authedFetch('/api/test-create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'Srinagar', enabledPrayers })
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    out.innerText = `✓ Created test subscription:\n${JSON.stringify(data, null, 2)}\n\nNow run "Refresh subscriptions" to see it.`;
  } catch (err) {
    out.innerText = 'Error: ' + err.message;
  }
};

document.getElementById('btnTrigger').onclick = async () => {
  out.innerHTML = 'Triggering...';
  try {
    const r = await authedFetch('/api/trigger-scheduled', { method: 'POST' });
    const t = await r.text();
    out.innerText = 'Response: ' + t;
  } catch (err) {
    out.innerText = 'Error: ' + err.message;
    if (String(err.message || '').includes('Unauthorized')) {
      setLoggedIn(false);
      loginStatus.textContent = 'Session expired. Please log in again.';
    }
  }
};

document.getElementById('btnLogout').onclick = async () => {
  await fetch('/api/admin-logout', { method: 'POST', credentials: 'include' });
  out.innerHTML = '';
  loginStatus.textContent = 'Signed out.';
  setLoggedIn(false);
};

if (calendarForm) {
  calendarForm.addEventListener('submit', saveCalendarSettings);
}

(async () => {
  const loggedIn = await checkSession();
  setLoggedIn(loggedIn);
  if (loggedIn) {
    loginStatus.textContent = 'Signed in.';
    loginStatus.classList.remove('error');
    await listSubscriptions();
    await loadCalendarSettings();
  }
})();
