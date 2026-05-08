const { firestore } = require('./_firebase');

function idFromEndpoint(endpoint) {
  if (!endpoint) return null;
  return Buffer.from(endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  // This endpoint is callable by clients to update their subscription metadata (city, enabledPrayers)
  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    const body = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => d += c.toString());
      req.on('end', () => resolve(JSON.parse(d)));
      req.on('error', reject);
    });

    const { subscription, city, enabledPrayers } = body;
    console.log('update-subscription received:', subscription && subscription.endpoint, 'enabledPrayers:', enabledPrayers);
    if (!subscription || !subscription.endpoint) return res.status(400).end('Missing subscription.endpoint');
    const docId = idFromEndpoint(subscription.endpoint);
    const docRef = firestore.collection('subscriptions').doc(docId);
    const now = new Date().toISOString();
    await docRef.set({ city: city || null, enabledPrayers: enabledPrayers || {}, updatedAt: now }, { merge: true });
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, id: docId }));
  } catch (err) {
    console.error('update-subscription error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
