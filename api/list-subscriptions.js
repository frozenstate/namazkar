const { firestore } = require('./_firebase');

module.exports = async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN || '';
  const provided = req.headers['x-admin-token'];
  if (!adminToken || provided !== adminToken) {
    return res.status(401).end('Unauthorized');
  }
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
