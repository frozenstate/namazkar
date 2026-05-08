const { firestore } = require('./_firebase');
const { requireAdminAuth } = require('./_adminAuth');

// Admin-only diagnostic: fetch a subscription document by its doc id
module.exports = async (req, res) => {
  if (!requireAdminAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');
  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    const id = req.query && req.query.id;
    if (!id) return res.status(400).end('Missing id query param');
    const doc = await firestore.collection('subscriptions').doc(id).get();
    if (!doc.exists) return res.status(404).end('Not found');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, data: doc.data() }));
  } catch (err) {
    console.error('get-subscription error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
