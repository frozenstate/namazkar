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
const customPushModal = document.getElementById('customPushModal');
const customPushForm = document.getElementById('customPushForm');
const customPushClose = document.getElementById('customPushClose');
const customPushCancel = document.getElementById('customPushCancel');
const customPushStatus = document.getElementById('customPushStatus');
const pushTitleInput = document.getElementById('pushTitle');
const pushBodyInput = document.getElementById('pushBody');
const pushUrlInput = document.getElementById('pushUrl');
const pushImageInput = document.getElementById('pushImage');
const pushIconInput = document.getElementById('pushIcon');
const pushBadgeInput = document.getElementById('pushBadge');
const pushTagInput = document.getElementById('pushTag');
const pushAudienceSelect = document.getElementById('pushAudience');
const pushCityAudience = document.getElementById('pushCityAudience');
const pushCityOptions = document.getElementById('pushCityOptions');
const pushSubscriptionAudience = document.getElementById('pushSubscriptionAudience');
const pushSubscriptionIdsInput = document.getElementById('pushSubscriptionIds');
const pushRequireInteractionInput = document.getElementById('pushRequireInteraction');
const pushRecipientPreview = document.getElementById('pushRecipientPreview');
const pushPreviewTitle = document.getElementById('pushPreviewTitle');
const pushPreviewBody = document.getElementById('pushPreviewBody');
const pushPreviewMeta = document.getElementById('pushPreviewMeta');
const pushPreviewIcon = document.getElementById('pushPreviewIcon');
const scheduledLogFilter = document.getElementById('scheduledLogFilter');

let subscriptionsCache = [];
let scheduledPushLogsCache = [];
let modalContext = { mode: 'all', subscription: null, presetIds: [] };

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

function renderSubscriptionCard(sub, options = {}) {
  const clean = maskSubscription(sub);
  const d = document.createElement('div');
  d.className = 'admin-sub-item';
  d.innerHTML = `
    <div><strong>Subscription</strong> <code>${clean.id}</code></div>
    <div><strong>Endpoint</strong> <code>${clean.endpoint}</code></div>
    <div><strong>City</strong> ${clean.city}</div>
    <div><strong>Updated</strong> ${clean.updatedAt}</div>
    <details style="margin: 0.75rem 0 0 0;">
      <summary style="cursor: pointer; font-weight: 500;">Prayer preferences</summary>
      <pre style="margin: 0.5rem 0 0 0; font-size: 0.8rem;">${JSON.stringify(clean.enabledPrayers, null, 2)}</pre>
    </details>
  `;

  if (options.errorText) {
    const error = document.createElement('div');
    error.style.marginTop = '0.75rem';
    error.innerHTML = `<strong>Failure</strong> ${options.errorText}`;
    d.appendChild(error);
  }

  return d;
}

async function resolveSubscriptionDetails(ids) {
  const wanted = Array.from(new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean)));
  if (!wanted.length) return [];

  const known = new Map((subscriptionsCache || []).map(item => [String(item.id || ''), item]));
  const missing = wanted.filter(id => !known.has(id));

  if (missing.length) {
    try {
      const res = await authedFetch('/api/list-subscriptions');
      if (res.ok) {
        const data = await res.json();
        subscriptionsCache = data.subscriptions || [];
        for (const item of subscriptionsCache) {
          known.set(String(item.id || ''), item);
        }
      }
    } catch (err) {}
  }

  return wanted.map(id => known.get(id) || { id, subscription: null, city: '—', enabledPrayers: {}, updatedAt: '—' });
}

function formatLogDate(value) {
  if (!value || value === '—') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderLogRow(log) {
  const d = document.createElement('div');
  d.className = 'admin-sub-item';
  const statusText = String(log.status || '—').toUpperCase();
  const errorText = log.error ? `Error: ${log.error}` : '';
  d.innerHTML = `
    <div><strong>Status</strong> <code>${statusText}</code></div>
    <div><strong>Prayer</strong> ${log.prayer || '—'} <strong>City</strong> ${log.city || '—'}</div>
    <div><strong>Subscription</strong> <code>${log.subscriptionId || '—'}</code></div>
    <div><strong>Day</strong> ${log.dayKey || '—'} <strong>Scheduled</strong> ${formatLogDate(log.scheduledFor)}</div>
    <div><strong>Updated</strong> ${formatLogDate(log.updatedAt)} ${log.statusCode ? `<strong>Code</strong> ${log.statusCode}` : ''}</div>
    ${log.sentAt && log.sentAt !== '—' ? `<div><strong>Sent</strong> ${formatLogDate(log.sentAt)}</div>` : ''}
    ${log.failedAt && log.failedAt !== '—' ? `<div><strong>Failed</strong> ${formatLogDate(log.failedAt)}</div>` : ''}
    ${errorText ? `<div><strong>Message</strong> ${errorText}</div>` : ''}
  `;
  return d;
}

function normalizeLogFilter(value) {
  const filter = String(value || 'all').toLowerCase();
  if (['sent', 'failed', 'sending'].includes(filter)) return filter;
  return 'all';
}

function filterScheduledLogs(logs, filter) {
  const normalized = normalizeLogFilter(filter);
  if (normalized === 'all') return logs;
  return logs.filter(log => String(log.status || '').toLowerCase() === normalized);
}

function renderScheduledLogs(logs) {
  out.innerHTML = '';
  const summary = document.createElement('p');
  summary.style.margin = '0 0 1rem 0';
  summary.style.fontSize = '0.95rem';
  summary.style.color = 'var(--muted)';
  summary.textContent = `${logs.length} scheduled push log${logs.length === 1 ? '' : 's'} shown.`;
  out.appendChild(summary);

  if (!logs.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No scheduled push logs match the current filter.';
    out.appendChild(empty);
    return;
  }

  logs.forEach(log => out.appendChild(renderLogRow(log)));
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

function normalizeOptionalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch (err) {
    return '';
  }
  return '';
}

function setCustomPushStatus(message, isError = false) {
  if (!customPushStatus) return;
  customPushStatus.textContent = message;
  customPushStatus.classList.toggle('error', isError);
}

function parseIdList(text) {
  return Array.from(new Set(String(text || '')
    .split(/[\s,]+/)
    .map(v => v.trim())
    .filter(Boolean)));
}

function renderCityAudienceOptions() {
  if (!pushCityOptions) return;
  const citySet = new Set();
  subscriptionsCache.forEach(item => {
    const city = String(item.city || '').trim();
    if (city) citySet.add(city);
  });
  const cities = Array.from(citySet).sort((a, b) => a.localeCompare(b));
  pushCityOptions.innerHTML = '';

  if (!cities.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No city metadata loaded yet. Use Refresh subscriptions first.';
    pushCityOptions.appendChild(empty);
    return;
  }

  cities.forEach(city => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = city;
    input.name = 'pushCity';
    const span = document.createElement('span');
    span.textContent = city;
    label.appendChild(input);
    label.appendChild(span);
    pushCityOptions.appendChild(label);
  });

  pushCityOptions.querySelectorAll('input[name="pushCity"]').forEach(input => {
    input.addEventListener('change', updateCustomPushPreview);
  });
}

function syncAudienceFields() {
  const audience = pushAudienceSelect ? pushAudienceSelect.value : 'all';
  if (pushCityAudience) pushCityAudience.classList.toggle('hidden', audience !== 'cities');
  if (pushSubscriptionAudience) pushSubscriptionAudience.classList.toggle('hidden', audience !== 'subscriptionIds');
  updateCustomPushPreview();
}

function estimateRecipients() {
  if (modalContext.mode === 'single' && modalContext.subscription) {
    return { count: 1, label: 'Recipients: 1 selected subscription' };
  }

  const audience = pushAudienceSelect ? pushAudienceSelect.value : 'all';
  if (audience === 'all') {
    const count = subscriptionsCache.length;
    return { count, label: `Recipients: all subscribers (${count})` };
  }

  if (audience === 'cities') {
    const selectedCities = new Set(
      Array.from(document.querySelectorAll('input[name="pushCity"]:checked')).map(el => el.value.toLowerCase())
    );
    const count = selectedCities.size
      ? subscriptionsCache.filter(item => selectedCities.has(String(item.city || '').toLowerCase())).length
      : 0;
    return {
      count,
      label: selectedCities.size
        ? `Recipients: ${count} subscriber${count === 1 ? '' : 's'} in ${selectedCities.size} selected cit${selectedCities.size === 1 ? 'y' : 'ies'}`
        : 'Recipients: select one or more cities'
    };
  }

  const ids = parseIdList(pushSubscriptionIdsInput ? pushSubscriptionIdsInput.value : '');
  const idSet = new Set(ids);
  const count = idSet.size
    ? subscriptionsCache.filter(item => idSet.has(String(item.id || ''))).length
    : 0;
  return {
    count,
    label: idSet.size
      ? `Recipients: ${count} matching subscription${count === 1 ? '' : 's'} from ${idSet.size} provided ID${idSet.size === 1 ? '' : 's'}`
      : 'Recipients: enter one or more subscription IDs'
  };
}

function updateCustomPushPreview() {
  if (!customPushModal || customPushModal.classList.contains('hidden')) return;

  const title = String(pushTitleInput ? pushTitleInput.value : '').trim() || 'Namaz Kar';
  const body = String(pushBodyInput ? pushBodyInput.value : '').trim() || 'Important update';
  const urlValue = String(pushUrlInput ? pushUrlInput.value : '').trim();
  const iconValue = normalizeOptionalUrl(pushIconInput ? pushIconInput.value : '');
  const imageValue = normalizeOptionalUrl(pushImageInput ? pushImageInput.value : '');

  if (pushPreviewTitle) pushPreviewTitle.textContent = title;
  if (pushPreviewBody) pushPreviewBody.textContent = body;
  if (pushPreviewMeta) {
    if (urlValue) {
      pushPreviewMeta.textContent = `Tap opens: ${urlValue}`;
    } else {
      pushPreviewMeta.textContent = 'Tap opens app home';
    }
    if (imageValue) {
      pushPreviewMeta.textContent += ' | Includes image';
    }
  }
  if (pushPreviewIcon) {
    pushPreviewIcon.src = iconValue || 'icons/favicon-round.svg';
  }

  const recipientInfo = estimateRecipients();
  if (pushRecipientPreview) pushRecipientPreview.textContent = recipientInfo.label;
}

function resetCustomPushForm() {
  if (!customPushForm) return;
  customPushForm.reset();
  if (pushTitleInput) pushTitleInput.value = 'Namaz Kar';
  if (pushBodyInput) pushBodyInput.value = 'Important update';
  if (pushAudienceSelect) pushAudienceSelect.value = 'all';
  if (pushSubscriptionIdsInput) pushSubscriptionIdsInput.value = '';
  if (pushRequireInteractionInput) pushRequireInteractionInput.checked = false;
  setCustomPushStatus('Compose your message and choose the audience.');
  renderCityAudienceOptions();
  syncAudienceFields();
  updateCustomPushPreview();
}

function openCustomPushModal(options = {}) {
  modalContext = {
    mode: options.mode || 'all',
    subscription: options.subscription || null,
    presetIds: Array.isArray(options.presetIds) ? options.presetIds : []
  };

  resetCustomPushForm();

  if (modalContext.mode === 'single' && pushAudienceSelect) {
    pushAudienceSelect.value = 'subscriptionIds';
  }
  if (modalContext.presetIds.length && pushSubscriptionIdsInput) {
    pushSubscriptionIdsInput.value = modalContext.presetIds.join(', ');
  }

  syncAudienceFields();
  customPushModal.classList.remove('hidden');
  document.body.classList.add('admin-modal-open');
  if (pushTitleInput) pushTitleInput.focus();
  updateCustomPushPreview();
}

function closeCustomPushModal() {
  if (!customPushModal) return;
  customPushModal.classList.add('hidden');
  document.body.classList.remove('admin-modal-open');
}

function collectCustomPushRequest() {
  const title = String(pushTitleInput ? pushTitleInput.value : '').trim();
  const body = String(pushBodyInput ? pushBodyInput.value : '').trim();
  if (!title) throw new Error('Title is required.');
  if (!body) throw new Error('Body is required.');

  const url = normalizeOptionalUrl(pushUrlInput ? pushUrlInput.value : '');
  if (String(pushUrlInput ? pushUrlInput.value : '').trim() && !url) {
    throw new Error('Invalid click URL. Use https://... or /path.');
  }

  const image = normalizeOptionalUrl(pushImageInput ? pushImageInput.value : '');
  if (String(pushImageInput ? pushImageInput.value : '').trim() && !image) {
    throw new Error('Invalid image URL. Use https://... or /path.');
  }

  const icon = normalizeOptionalUrl(pushIconInput ? pushIconInput.value : '');
  if (String(pushIconInput ? pushIconInput.value : '').trim() && !icon) {
    throw new Error('Invalid icon URL. Use https://... or /path.');
  }

  const badge = normalizeOptionalUrl(pushBadgeInput ? pushBadgeInput.value : '');
  if (String(pushBadgeInput ? pushBadgeInput.value : '').trim() && !badge) {
    throw new Error('Invalid badge URL. Use https://... or /path.');
  }

  const tag = String(pushTagInput ? pushTagInput.value : '').trim();
  const payload = {
    title,
    body,
    url: url || undefined,
    image: image || undefined,
    icon: icon || undefined,
    badge: badge || undefined,
    tag: tag || undefined,
    requireInteraction: !!(pushRequireInteractionInput && pushRequireInteractionInput.checked)
  };

  if (modalContext.mode === 'single' && modalContext.subscription) {
    return { payload, subscription: modalContext.subscription };
  }

  const audience = pushAudienceSelect ? pushAudienceSelect.value : 'all';
  if (audience === 'cities') {
    const selectedCities = Array.from(document.querySelectorAll('input[name="pushCity"]:checked')).map(el => el.value);
    if (!selectedCities.length) throw new Error('Select at least one city for city audience.');
    return { payload, target: { audience: 'cities', cities: selectedCities } };
  }

  if (audience === 'subscriptionIds') {
    const ids = parseIdList(pushSubscriptionIdsInput ? pushSubscriptionIdsInput.value : '');
    if (!ids.length) throw new Error('Provide at least one subscription ID.');
    return { payload, target: { audience: 'subscriptionIds', subscriptionIds: ids } };
  }

  return { payload, target: { audience: 'all' } };
}

async function sendCustomPushFromModal(event) {
  event.preventDefault();
  try {
    const requestBody = collectCustomPushRequest();
    setCustomPushStatus('Sending custom push...');
    const r = await authedFetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const sent = Number(data.sent || 0);
    const matched = Number(data.matched || 0);
    const failed = Number(data.failed != null ? data.failed : Math.max(0, matched - sent));

    const summary = `Matched: ${matched}, Sent: ${sent}, Failed: ${failed}`;
    setCustomPushStatus(`Custom push result — ${summary}`);
    out.innerHTML = '';
    const p = document.createElement('p');
    p.style.margin = '0 0 0.5rem 0';
    p.textContent = `✓ Custom push result — ${summary}.`;
    out.appendChild(p);

    if (Array.isArray(data.failedDetails) && data.failedDetails.length) {
      const info = document.createElement('div');
      info.className = 'push-failures';
      const title = document.createElement('strong');
      title.textContent = `Failed deliveries (${data.failedDetails.length}):`;
      info.appendChild(title);
      const limit = 20;
      const failedCards = await resolveSubscriptionDetails(data.failedDetails.slice(0, limit).map(fd => fd.id));
      failedCards.forEach((record, index) => {
        const fd = data.failedDetails[index] || {};
        info.appendChild(renderSubscriptionCard(record, { errorText: fd.error || '' }));
      });
      if (data.failedDetails.length > limit) {
        const more = document.createElement('div');
        more.style.marginTop = '0.5rem';
        more.style.color = 'var(--muted)';
        more.textContent = `And ${data.failedDetails.length - limit} more failures.`;
        info.appendChild(more);
      }
      out.appendChild(info);
    }

    // Auto-close modal only when there are no failures; otherwise keep it open for inspection.
    if (!failed) setTimeout(closeCustomPushModal, 700);
  } catch (err) {
    setCustomPushStatus(`Error: ${err.message}`, true);
  }
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

async function showSubscriptionCount() {
  try {
    const res = await authedFetch('/api/list-subscriptions');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    subscriptionsCache = data.subscriptions || [];
    const count = (data.subscriptions || []).length;
    out.innerHTML = '';
    const message = document.createElement('p');
    message.style.margin = '0 0 1rem 0';
    message.style.fontSize = '0.95rem';
    message.style.color = 'var(--muted)';
    message.textContent = `${count} active subscription${count !== 1 ? 's' : ''}.`;
    out.appendChild(message);
  } catch (err) {
    out.innerText = 'Error: ' + err.message;
    if (String(err.message || '').includes('Unauthorized')) {
      setLoggedIn(false);
      loginStatus.textContent = 'Session expired. Please log in again.';
    }
  }
}

async function showScheduledPushLogs() {
  out.innerHTML = 'Loading logs...';
  try {
    const res = await authedFetch('/api/scheduled-push-logs?limit=25');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    scheduledPushLogsCache = Array.isArray(data.logs) ? data.logs : [];
    renderScheduledLogs(filterScheduledLogs(scheduledPushLogsCache, scheduledLogFilter ? scheduledLogFilter.value : 'all'));
  } catch (err) {
    out.innerText = 'Error: ' + err.message;
    if (String(err.message || '').includes('Unauthorized')) {
      setLoggedIn(false);
      loginStatus.textContent = 'Session expired. Please log in again.';
    }
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
    subscriptionsCache = data.subscriptions || [];
    out.innerHTML = '';
    if (!data.subscriptions || !data.subscriptions.length) {
      out.textContent = 'No subscriptions found.';
      return;
    }
    data.subscriptions.forEach(s => {
      const d = renderSubscriptionCard(s);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Custom push';
      btn.onclick = async () => {
        openCustomPushModal({
          mode: 'single',
          subscription: s.subscription,
          presetIds: [String(s.id || '')].filter(Boolean)
        });
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
    await showSubscriptionCount();
    await loadCalendarSettings();
  } catch (err) {
    loginStatus.textContent = err.message;
    loginStatus.classList.add('error');
  }
});

document.getElementById('btnList').onclick = listSubscriptions;

document.getElementById('btnLogs').onclick = showScheduledPushLogs;

document.getElementById('btnCleanupSubscriptions').onclick = async () => {
  out.innerHTML = 'Cleaning up invalid subscriptions...';
  try {
    const res = await authedFetch('/api/cleanup-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxAgeDays: 30 })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    out.innerHTML = '';
    const p = document.createElement('p');
    p.style.margin = '0 0 1rem 0';
    p.style.color = 'var(--muted)';
    p.textContent = `Cleanup complete. Scanned ${data.scanned} subscriptions, deleted ${data.deleted}.`;
    out.appendChild(p);
    await listSubscriptions();
  } catch (err) {
    out.innerText = 'Error: ' + err.message;
    if (String(err.message || '').includes('Unauthorized')) {
      setLoggedIn(false);
      loginStatus.textContent = 'Session expired. Please log in again.';
    }
  }
};

document.getElementById('btnApplyLogFilter').onclick = () => {
  renderScheduledLogs(filterScheduledLogs(scheduledPushLogsCache, scheduledLogFilter ? scheduledLogFilter.value : 'all'));
};

if (scheduledLogFilter) {
  scheduledLogFilter.addEventListener('change', () => {
    if (scheduledPushLogsCache.length) {
      renderScheduledLogs(filterScheduledLogs(scheduledPushLogsCache, scheduledLogFilter.value));
    }
  });
}

document.getElementById('btnTest').onclick = () => openCustomPushModal({ mode: 'all' });

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

if (customPushForm) {
  customPushForm.addEventListener('submit', sendCustomPushFromModal);
}

if (pushAudienceSelect) {
  pushAudienceSelect.addEventListener('change', syncAudienceFields);
}

[pushTitleInput, pushBodyInput, pushUrlInput, pushImageInput, pushIconInput, pushBadgeInput, pushTagInput, pushSubscriptionIdsInput, pushRequireInteractionInput]
  .filter(Boolean)
  .forEach(input => {
    const eventName = input.tagName === 'INPUT' && input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, updateCustomPushPreview);
  });

if (customPushClose) {
  customPushClose.addEventListener('click', closeCustomPushModal);
}

if (customPushCancel) {
  customPushCancel.addEventListener('click', closeCustomPushModal);
}

if (customPushModal) {
  customPushModal.addEventListener('click', event => {
    const target = event.target;
    if (target && target.getAttribute && target.getAttribute('data-close-modal') === 'true') {
      closeCustomPushModal();
    }
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && customPushModal && !customPushModal.classList.contains('hidden')) {
    closeCustomPushModal();
  }
});

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
