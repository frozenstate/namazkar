const { firestore } = require('./_firebase');
const { requireAdminAuth, isAdminAuthenticated } = require('./_adminAuth');
const webpush = require('web-push');
const fs = require('fs');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = 'mailto:namazkar@localhost.invalid';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('VAPID keys not configured; trigger-scheduled will fail if called');
}

function idFromEndpoint(endpoint) {
  if (!endpoint) return null;
  return Buffer.from(endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseJSONFile(path) {
  try {
    const raw = fs.readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function todayKey(d = new Date()) {
  return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function parseTimeToDate(timeStr, offsetMin, baseDate = new Date()) {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m + offsetMin, 0, 0);
  return d;
}

const PRAYER_LABELS = {
  Fajr: 'Subah',
  Sunrise: 'Zawaal',
  Dhuhr: 'Pishan',
  Asr: 'Digar',
  Maghrib: 'Shaam',
  Isha: 'Khoftan'
};

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

module.exports = async (req, res) => {
  // This endpoint is intended to be called by a scheduler (cron) every minute.
  const cronSecret = process.env.ADMIN_SCHEDULE_SECRET || '';
  const cronProvided = req.headers['x-admin-schedule-secret'];
  const cronAuthorized = cronSecret && cronProvided === cronSecret;
  if (!isAdminAuthenticated(req) && !cronAuthorized) {
    return requireAdminAuth(req, res);
  }

  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    const table = parseJSONFile('./data/table.json');
    const offsets = parseJSONFile('./data/offset.json');
    if (!table || !table.days || !offsets || !offsets.cities) {
      return res.status(500).end('Missing timetable or offsets');
    }

    const now = new Date();
    const windowMs = 60_000; // look for prayers within next 60s
    const key = todayKey(now);
    const times = table.days[key];
    if (!times) return res.status(200).end('No times for today');

    // collect prayers that are due in the next window
    const duePrayers = {};
    for (const prayer in times) {
      // for each city, offset may differ; we'll check per subscription
      duePrayers[prayer] = times[prayer];
    }

    const snap = await firestore.collection('subscriptions').get();
    const sendPromises = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (!data || !data.subscription) return;
      const city = data.city || offsets.base_city;
      const offset = (offsets.cities && offsets.cities[city] && offsets.cities[city].offset) || 0;
      for (const prayer in duePrayers) {
        const at = parseTimeToDate(duePrayers[prayer], offset);
        if (at > now && (at - now) <= windowMs) {
          const enabled = (data.enabledPrayers && data.enabledPrayers[prayer]) || false;
          if (!enabled) continue;
          const notificationText = getPrayerNotificationText(prayer);
          const payload = { title: notificationText.title, body: notificationText.body, tag: prayer };
          sendPromises.push(webpush.sendNotification(data.subscription, JSON.stringify(payload)).catch(err => {
            console.warn('push failed for', doc.id, err && err.statusCode);
          }));
        }
      }
    });

    await Promise.allSettled(sendPromises);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, sent: sendPromises.length }));
  } catch (err) {
    console.error('trigger-scheduled error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
