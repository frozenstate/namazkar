const webpush = require('web-push');
const { firestore } = require('./_firebase');
const { requireAdminAuth } = require('./_adminAuth');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = 'mailto:namazkar@localhost.invalid';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('VAPID keys not configured; send-push will fail if called');
}

function cleanString(value, maxLen = 300) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function normalizeUrl(value) {
  const text = cleanString(value, 1200);
  if (!text) return '';
  if (text.startsWith('/')) return text;
  try {
    const u = new URL(text);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch (err) {
    return '';
  }
  return '';
}

function sanitizePayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const title = cleanString(source.title, 100) || 'Namaz Kar';
  const body = cleanString(source.body, 300) || 'waqt wot';

  const url = normalizeUrl(source.url);
  const icon = normalizeUrl(source.icon);
  const image = normalizeUrl(source.image);
  const badge = normalizeUrl(source.badge);
  const tag = cleanString(source.tag, 80) || 'namazkar-push';

  const out = {
    title,
    body,
    tag,
    icon: icon || '/icons/favicon-round.svg',
    badge: badge || '/icons/icon-192.png'
  };
  if (url) out.url = url;
  if (image) out.image = image;
  if (source.requireInteraction === true) out.requireInteraction = true;
  return out;
}

function normalizeAudienceTarget(target) {
  const source = target && typeof target === 'object' ? target : {};
  const audience = cleanString(source.audience, 40) || 'all';
  const cities = Array.isArray(source.cities)
    ? Array.from(new Set(source.cities.map(v => cleanString(v, 100)).filter(Boolean).map(v => v.toLowerCase())))
    : [];
  const subscriptionIds = Array.isArray(source.subscriptionIds)
    ? Array.from(new Set(source.subscriptionIds.map(v => cleanString(v, 300)).filter(Boolean)))
    : [];
  return { audience, cities, subscriptionIds };
}

function isTargetMatch(target, record) {
  if (!target || target.audience === 'all') return true;
  if (target.audience === 'cities') {
    if (!target.cities.length) return false;
    return target.cities.includes(String(record.city || '').toLowerCase());
  }
  if (target.audience === 'subscriptionIds') {
    if (!target.subscriptionIds.length) return false;
    return target.subscriptionIds.includes(String(record.id || ''));
  }
  return true;
}

async function sendToSubscription(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(sanitizePayload(payload)));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  if (!requireAdminAuth(req, res)) return;

  try {
    const body = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => d += c.toString());
      req.on('end', () => resolve(JSON.parse(d)));
      req.on('error', reject);
    });

    const { subscription, payload, target } = body;

    if (subscription) {
      await sendToSubscription(subscription, payload);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!firestore) return res.status(500).end('Firebase not configured');

    const normalizedTarget = normalizeAudienceTarget(target);
    const snap = await firestore.collection('subscriptions').get();
    const tasks = [];
    snap.forEach(doc => {
      const data = doc.data();
      const record = {
        id: String(doc.id || ''),
        city: String(data && data.city ? data.city : ''),
        subscription: data ? data.subscription : null
      };
      if (record.subscription && isTargetMatch(normalizedTarget, record)) {
        tasks.push({ id: record.id, promise: sendToSubscription(record.subscription, payload) });
      }
    });

    const settled = await Promise.allSettled(tasks.map(t => t.promise));
    const sent = settled.filter(item => item.status === 'fulfilled').length;
    const matched = tasks.length;
    const failedDetails = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'rejected') {
        const id = tasks[i] && tasks[i].id ? String(tasks[i].id) : `index-${i}`;
        const reason = r.reason && r.reason.message ? r.reason.message : String(r.reason || 'Unknown error');
        failedDetails.push({ id, error: reason.slice(0, 1000) });
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, sent, matched, failed: failedDetails.length, failedDetails }));
  } catch (err) {
    console.error('send-push failed', err);
    res.statusCode = 500;
    res.end('Failed to send push');
  }
};
