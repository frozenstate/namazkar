const webpush = require('web-push');
const { firestore } = require('./_firebase');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = 'mailto:namazkar@localhost.invalid';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('VAPID keys not configured; send-push will fail if called');
}

async function sendToSubscription(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload || { title: 'Namaz Kar', body: 'Prayer time' }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

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

    // If no subscription provided, require admin token and send to all stored subscriptions
    const adminToken = process.env.ADMIN_TOKEN || '';
    const provided = req.headers['x-admin-token'];
    if (!adminToken || provided !== adminToken) {
      return res.status(401).end('Unauthorized');
    }

    if (!firestore) return res.status(500).end('Firebase not configured');

    const snap = await firestore.collection('subscriptions').get();
    const promises = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data && data.subscription) {
        promises.push(sendToSubscription(data.subscription, payload));
      }
    });
    await Promise.allSettled(promises);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, sent: promises.length }));
  } catch (err) {
    console.error('send-push failed', err);
    res.statusCode = 500;
    res.end('Failed to send push');
  }
};
