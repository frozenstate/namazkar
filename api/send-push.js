const webpush = require('web-push');
const { firestore, admin } = require('./_firebase');
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
  if (!subscription || !subscription.endpoint) {
    throw new Error('Invalid subscription: missing endpoint');
  }
  return webpush.sendNotification(subscription, JSON.stringify(sanitizePayload(payload)));
}

function getPushErrorStatusCode(err) {
  if (!err) return null;
  if (typeof err.statusCode === 'number') return err.statusCode;
  if (err.status && typeof err.status.code === 'number') return err.status.code;
  return null;
}

function isGoneError(err) {
  return getPushErrorStatusCode(err) === 410;
}

async function recordSubscriptionFailure(docId, err) {
  if (!firestore || !docId) return false;
  const docRef = firestore.collection('subscriptions').doc(String(docId));
  const now = new Date();
  const msg = String((err && err.message) || err || 'Unknown error').slice(0, 1000);
  const increment = admin && admin.firestore && admin.firestore.FieldValue && typeof admin.firestore.FieldValue.increment === 'function'
    ? admin.firestore.FieldValue.increment(1)
    : 1;
  await docRef.set({
    badAttemptCount: increment,
    lastFailedAt: now,
    lastFailureMsg: msg,
    lastFailureStatusCode: getPushErrorStatusCode(err) || null,
    updatedAt: now
  }, { merge: true });

  // Re-read doc to decide whether to mark invalid after threshold
  const snap = await docRef.get();
  const data = snap.exists ? snap.data() : {};
  const count = Number(data.badAttemptCount || 0);
  const threshold = 2; // require 2 failures before marking invalid
  if (count >= threshold) {
    await docRef.set({
      status: 'invalid',
      invalidAt: now,
      invalidReason: 'push_410_retries',
      invalidError: msg,
      invalidStatusCode: getPushErrorStatusCode(err) || null,
      updatedAt: now
    }, { merge: true });
    // Log the invalidation
    try {
      await firestore.collection('subscription_invalidation_logs').add({
        subscriptionId: String(docId),
        failureCount: count,
        reason: 'push_410_retries',
        lastFailureMsg: msg,
        statusCode: getPushErrorStatusCode(err) || null,
        invalidatedAt: now,
        previousCity: data.city || null,
        previousStatus: data.status || 'active'
      });
    } catch (logErr) {
      console.error('Failed to log invalidation:', logErr && logErr.message);
    }
  }
  return true;
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
      try {
        await sendToSubscription(subscription, payload);
      } catch (err) {
        if (isGoneError(err)) {
          const docId = String(subscription && subscription.endpoint ? Buffer.from(subscription.endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') : '');
          await recordSubscriptionFailure(docId, err);
          const snap = await firestore.collection('subscriptions').doc(docId).get();
          const isInvalid = snap.exists && String((snap.data() || {}).status || '') === 'invalid';
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, sent: 1, matched: 1, failed: 1, invalidated: isInvalid ? 1 : 0, failedDetails: [{ id: docId, error: String(err && err.message || err) }] }));
          return;
        }
        throw err;
      }
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, sent: 1, matched: 1, failed: 0, invalidated: 0, failedDetails: [] }));
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
        // Log the subscription structure for debugging
        const sub = record.subscription;
        if (sub.endpoint && typeof sub.endpoint !== 'string') {
          console.warn(`send-push: subscription ${record.id} has non-string endpoint:`, typeof sub.endpoint, sub.endpoint);
        }
        if (!sub.keys || typeof sub.keys !== 'object') {
          console.warn(`send-push: subscription ${record.id} has invalid keys:`, sub.keys);
        } else if (typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
          console.warn(`send-push: subscription ${record.id} keys not strings:`, { p256dh: typeof sub.keys.p256dh, auth: typeof sub.keys.auth });
        } else {
          console.log(`send-push: subscription ${record.id} structure OK`, { 
            endpoint: sub.endpoint?.slice(-30),
            keyTypes: { p256dh: typeof sub.keys.p256dh, auth: typeof sub.keys.auth },
            keySizes: { p256dh: sub.keys.p256dh?.length, auth: sub.keys.auth?.length }
          });
        }
        tasks.push({ id: record.id, docRef: doc.ref, promise: sendToSubscription(record.subscription, payload) });
      }
    });

    const settled = await Promise.allSettled(tasks.map(t => t.promise));
    const sent = settled.filter(item => item.status === 'fulfilled').length;
    const matched = tasks.length;
    const failedDetails = [];
    const invalidated = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'rejected') {
        const id = tasks[i] && tasks[i].id ? String(tasks[i].id) : `index-${i}`;
        const reason = r.reason && r.reason.message ? r.reason.message : String(r.reason || 'Unknown error');
        const statusCode = getPushErrorStatusCode(r.reason);
        console.log(`send-push: broadcast failed for subscription ${id}:`, { statusCode, reason, endpoint: tasks[i].subscription?.endpoint?.slice(-20) });
        if (statusCode === 410 && tasks[i] && tasks[i].id) {
          invalidated.push({ id: tasks[i].id, reason, statusCode });
        }
        failedDetails.push({ id, error: reason.slice(0, 1000) });
      }
    }

    if (invalidated.length) {
      await Promise.allSettled(invalidated.map(item => recordSubscriptionFailure(item.id, { message: item.reason, statusCode: item.statusCode })));
      // Re-check which ones are now invalid
      const invalidNow = [];
      await Promise.all(invalidated.map(async item => {
        try {
          const snap = await firestore.collection('subscriptions').doc(String(item.id)).get();
          const d = snap.exists ? snap.data() : null;
          if (d && String(d.status || '') === 'invalid') invalidNow.push({ id: item.id, reason: item.reason, statusCode: item.statusCode });
        } catch (e) {}
      }));
      // replace invalidated array with those now invalid
      invalidated.length = 0;
      for (const it of invalidNow) invalidated.push(it);
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      sent,
      matched,
      failed: failedDetails.length,
      invalidated: invalidated.length,
      failedDetails
    }));
  } catch (err) {
    console.error('send-push failed', err);
    const statusCode = getPushErrorStatusCode(err);
    if (statusCode === 410) {
      res.statusCode = 410;
      res.end('Push subscription is no longer valid');
      return;
    }
    res.statusCode = 500;
    res.end('Failed to send push');
  }
};
