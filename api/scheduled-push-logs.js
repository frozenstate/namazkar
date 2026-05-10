const { firestore } = require('./_firebase');
const { requireAdminAuth } = require('./_adminAuth');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function toDateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateValue(value) {
  const date = toDateValue(value);
  return date ? date.toISOString() : '—';
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

module.exports = async (req, res) => {
  if (!requireAdminAuth(req, res)) return;
  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    const limit = normalizeLimit(req.query && req.query.limit);
    const snap = await firestore
      .collection('scheduled_push_logs')
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    const logs = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      logs.push({
        id: doc.id,
        dayKey: data.dayKey || '—',
        subscriptionId: data.subscriptionId || '—',
        prayer: data.prayer || '—',
        city: data.city || '—',
        status: data.status || '—',
        scheduledFor: formatDateValue(data.scheduledFor),
        updatedAt: formatDateValue(data.updatedAt),
        sentAt: formatDateValue(data.sentAt),
        failedAt: formatDateValue(data.failedAt),
        error: data.error || '',
        statusCode: data.statusCode || null
      });
    });

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ logs }));
  } catch (err) {
    console.error('scheduled-push-logs error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};