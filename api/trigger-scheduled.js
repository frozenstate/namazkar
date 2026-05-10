const { firestore } = require('./_firebase');
const { requireAdminAuth, isAdminAuthenticated } = require('./_adminAuth');
const webpush = require('web-push');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = 'mailto:namazkar@localhost.invalid';
const DEBUG_TRIGGER_SCHEDULED = process.env.TRIGGER_SCHEDULED_DEBUG === '1';
const SCHEDULED_PUSH_LOG_COLLECTION = 'scheduled_push_logs';
const SCHEDULED_PUSH_STALE_MS = 5 * 60 * 1000;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('VAPID keys not configured; trigger-scheduled will fail if called');
}

function idFromEndpoint(endpoint) {
  if (!endpoint) return null;
  return Buffer.from(endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error(`Error fetching ${url}:`, err && err.message ? err.message : err);
    return null;
  }
}

function todayKey(d = new Date()) {
  return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Determine timezone offset in minutes for `timeZone` at `date`
// Returns number of minutes local_time - UTC_time (can be positive or negative)
function tzOffsetMinutes(timeZone, date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value) - 1;
  const day = Number(parts.find(p => p.type === 'day').value);
  const hour = Number(parts.find(p => p.type === 'hour').value);
  const minute = Number(parts.find(p => p.type === 'minute').value);

  // local minutes at tz
  const localTotal = hour * 60 + minute;
  // UTC minutes of the same instant
  const utcTotal = date.getUTCHours() * 60 + date.getUTCMinutes();

  let diff = localTotal - utcTotal;
  if (diff > 12 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}

// Build a Date for the prayer time (table times are in table.meta.timezone).
// Returns a Date (server-local) representing the instant when the local clock at tz shows timeStr,
// after applying city offset in minutes.
function parseTimeToDate(timeStr, cityOffsetMin = 0, baseDate = new Date(), tableTz = 'UTC') {
  const [h, m] = timeStr.split(':').map(Number);

  // Determine the date (year/month/day) in the table timezone for baseDate
  const dtfDate = new Intl.DateTimeFormat('en-US', {
    timeZone: tableTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const parts = dtfDate.formatToParts(baseDate);
  const year = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value) - 1;
  const day = Number(parts.find(p => p.type === 'day').value);

  // timezone offset (minutes) for tableTz at baseDate
  const tzOffset = tzOffsetMinutes(tableTz, baseDate);

  // UTC milliseconds for the local time (year-month-day h:m in tableTz)
  // Date.UTC treats the components as UTC; subtract tzOffset to convert local->UTC,
  // then apply city offset minutes.
  const utcMs = Date.UTC(year, month, day, h, m) - (tzOffset * 60 * 1000) + (cityOffsetMin * 60 * 1000);
  return new Date(utcMs);
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

function logDebug(message, ...args) {
  if (DEBUG_TRIGGER_SCHEDULED) {
    console.log(message, ...args);
  }
}

function makeScheduledPushId(dayKey, subscriptionId, prayer) {
  return [dayKey, subscriptionId, prayer]
    .map(part => String(part || '').trim().replace(/[^A-Za-z0-9._:-]/g, '_'))
    .join('__');
}

async function claimScheduledPush(docRef, claimData) {
  return firestore.runTransaction(async tx => {
    const existing = await tx.get(docRef);
    if (existing.exists) {
      const data = existing.data() || {};
      const status = String(data.status || '');
      const updatedAtMs = data.updatedAt && typeof data.updatedAt.toMillis === 'function'
        ? data.updatedAt.toMillis()
        : 0;
      if (status === 'sent' || status === 'failed') {
        return { claimed: false, status };
      }
      if (status === 'sending' && updatedAtMs && (Date.now() - updatedAtMs) < SCHEDULED_PUSH_STALE_MS) {
        return { claimed: false, status };
      }
    }

    tx.set(docRef, {
      ...claimData,
      status: 'sending',
      updatedAt: new Date()
    }, { merge: true });

    return { claimed: true };
  });
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
    // Fetch data files from the deployed app
    const origin = req.headers['x-forwarded-proto'] 
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host'] || req.headers.host}` 
      : `https://${req.headers.host}`;
    
    const [table, offsets] = await Promise.all([
      fetchJSON(`${origin}/data/table.json`),
      fetchJSON(`${origin}/data/offset.json`)
    ]);
    
    if (!table || !table.days) {
      console.error('Table missing or invalid:', table);
      return res.status(500).end('Missing or invalid timetable');
    }
    if (!offsets || !offsets.cities) {
      console.error('Offsets missing or invalid:', offsets);
      return res.status(500).end('Missing or invalid offsets');
    }

    const tableTz = (table.meta && table.meta.timezone) || 'UTC';
    console.log('trigger-scheduled: using timezone', tableTz);

    const now = new Date();
    // Use a lookahead smaller than the cron interval (60s) to avoid duplicate
    // matches when the scheduler runs every minute. 55s gives a small safety
    // margin while preventing overlap between consecutive runs.
    const windowMs = 55_000; // look for prayers within next 55s
    const key = todayKey(now);
    const times = table.days[key];
    if (!times) {
      console.log('trigger-scheduled: no times for today', key);
      return res.status(200).end('No times for today');
    }

    const duePrayers = times;

    const snap = await firestore.collection('subscriptions').get();
    let totalToSend = 0;
    let skippedByDedupe = 0;
    const sendPromises = [];
    let dueMatches = 0;
    snap.forEach(doc => {
      const data = doc.data();
      if (!data || !data.subscription) return;
      const city = data.city || offsets.base_city;
      const cityOffset = (offsets.cities && offsets.cities[city] && offsets.cities[city].offset) || 0;
      logDebug(`trigger-scheduled: sub ${doc.id} city=${city} cityOffset=${cityOffset} enabledPrayers=${JSON.stringify(data.enabledPrayers || {})}`);
      for (const prayer in duePrayers) {
        const at = parseTimeToDate(duePrayers[prayer], cityOffset, now, tableTz);
        const diffMs = at.getTime() - now.getTime();
        if (at > now && diffMs <= windowMs) {
          dueMatches++;
          const enabled = (data.enabledPrayers && data.enabledPrayers[prayer]) || false;
          logDebug(`trigger-scheduled: doc=${doc.id} prayer=${prayer} at=${at.toISOString()} diffMs=${diffMs} enabled=${enabled}`);
          if (!enabled) continue;
          const notificationText = getPrayerNotificationText(prayer);
          const payload = { title: notificationText.title, body: notificationText.body, tag: prayer };
          const scheduledPushId = makeScheduledPushId(key, doc.id, prayer);
          const logRef = firestore.collection(SCHEDULED_PUSH_LOG_COLLECTION).doc(scheduledPushId);
          sendPromises.push((async () => {
            const claim = await claimScheduledPush(logRef, {
              dayKey: key,
              subscriptionId: doc.id,
              prayer,
              city,
              scheduledFor: at,
              payload
            });

            if (!claim.claimed) {
              skippedByDedupe++;
              logDebug(`trigger-scheduled: skipping duplicate ${scheduledPushId} status=${claim.status}`);
              return { skipped: true, status: claim.status };
            }

            totalToSend++;
            try {
              await webpush.sendNotification(data.subscription, JSON.stringify(payload));
              await logRef.set({
                status: 'sent',
                sentAt: new Date(),
                updatedAt: new Date()
              }, { merge: true });
              return { sent: true };
            } catch (err) {
              console.warn('trigger-scheduled: push failed', doc.id, err && err.statusCode);
              await logRef.set({
                status: 'failed',
                failedAt: new Date(),
                updatedAt: new Date(),
                error: String((err && err.message) || err || 'Unknown error').slice(0, 1000),
                statusCode: err && err.statusCode ? err.statusCode : null
              }, { merge: true });
              return { sent: false, error: true };
            }
          })());
        }
      }
    });

    console.log('trigger-scheduled: found', snap.size, 'subscriptions, due', dueMatches, 'sending', totalToSend, 'pushes', 'skippedByDedupe', skippedByDedupe);
    await Promise.allSettled(sendPromises);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, sent: totalToSend, skippedByDedupe }));
  } catch (err) {
    console.error('trigger-scheduled error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
