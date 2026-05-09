const { firestore } = require('./_firebase');
const { requireAdminAuth } = require('./_adminAuth');

const COLLECTION_NAME = 'calendar';
const DOCUMENT_ID = 'kashmir';

function getSettingsDoc() {
  return firestore.collection(COLLECTION_NAME).doc(DOCUMENT_ID);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString(); });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function normalizeStartDate(value) {
  if (!value) return '';
  const date = new Date(String(value).trim());
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00:00`;
}

function sanitizeSettings(data = {}) {
  const monthName = String(data.monthName || '').trim();
  const hijriYear = Number(data.hijriYear);
  const monthLength = Number(data.monthLength);
  const startDate = normalizeStartDate(data.startDate);
  if (!monthName) throw new Error('Month name is required');
  if (!Number.isInteger(hijriYear) || hijriYear < 1) throw new Error('Hijri year must be a positive whole number');
  if (![29, 30].includes(monthLength)) throw new Error('Month length must be 29 or 30');
  if (!startDate) throw new Error('Month start date is required');

  return {
    monthName,
    hijriYear,
    monthLength,
    startDate,
    updatedAt: new Date().toISOString()
  };
}

module.exports = async (req, res) => {
  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    if (req.method === 'GET') {
      const snap = await getSettingsDoc().get();
      const settings = snap.exists ? { id: snap.id, ...snap.data() } : null;
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ settings }));
      return;
    }

    if (req.method === 'POST') {
      if (!requireAdminAuth(req, res)) return;
      const body = await parseJsonBody(req);
      const settings = sanitizeSettings(body);
      await getSettingsDoc().set(settings, { merge: true });
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, settings }));
      return;
    }

    res.statusCode = 405;
    res.end('Method Not Allowed');
  } catch (err) {
    console.error('calendar-settings error', err);
    res.statusCode = 400;
    res.end(err.message || 'Bad Request');
  }
};