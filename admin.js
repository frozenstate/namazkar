const loginPanel = document.getElementById('loginPanel');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('adminPassword');
const loginStatus = document.getElementById('loginStatus');
const adminTools = document.getElementById('adminTools');
const out = document.getElementById('out');

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

(async () => {
  const loggedIn = await checkSession();
  setLoggedIn(loggedIn);
  if (loggedIn) {
    loginStatus.textContent = 'Signed in.';
    loginStatus.classList.remove('error');
    await listSubscriptions();
  }
})();
