const { firestore } = require('./_firebase');
const { requireAdminAuth } = require('./_adminAuth');

module.exports = async (req, res) => {
  if (!requireAdminAuth(req, res)) return;
  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    const snap = await firestore.collection('subscriptions').get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ subscriptions: list }));
  } catch (err) {
    console.error('list-subscriptions error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
