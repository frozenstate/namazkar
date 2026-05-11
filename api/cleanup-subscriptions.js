const { firestore } = require('./_firebase');
const { requireAdminAuth } = require('./_adminAuth');

function parseMaxAgeDays(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return 30;
  return Math.min(Math.floor(num), 3650);
}

function ageInDays(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

function shouldDeleteSubscription(data, maxAgeDays) {
  if (!data || typeof data !== 'object') return true;
  if (data.status === 'invalid' || data.invalidAt) return true;
  const createdAge = ageInDays(data.createdAt);
  const updatedAge = ageInDays(data.updatedAt);
  return (createdAge !== null && createdAge >= maxAgeDays) || (updatedAge !== null && updatedAge >= maxAgeDays);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  if (!requireAdminAuth(req, res)) return;
  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    const body = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => d += c.toString());
      req.on('end', () => {
        if (!d.trim()) return resolve({});
        try {
          resolve(JSON.parse(d));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });

    const maxAgeDays = parseMaxAgeDays(body.maxAgeDays);
    const snap = await firestore.collection('subscriptions').get();
    const deleted = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      if (shouldDeleteSubscription(data, maxAgeDays)) {
        await doc.ref.delete();
        deleted.push(doc.id);
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      scanned: snap.size,
      deleted: deleted.length,
      maxAgeDays,
      deletedIds: deleted
    }));
  } catch (err) {
    console.error('cleanup-subscriptions failed', err);
    res.statusCode = 500;
    res.end('Failed to cleanup subscriptions');
  }
};