const { firestore, admin } = require('./_firebase');

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
    if (!subscription || !subscription.endpoint) return res.status(400).end('Missing subscription.endpoint');
    const docId = idFromEndpoint(subscription.endpoint);
    const docRef = firestore.collection('subscriptions').doc(docId);
    const now = new Date().toISOString();

    // Read existing doc to detect invalid state and to return stored metadata
    const existing = await docRef.get();
    const existingData = existing.exists ? existing.data() : null;
    const wasInvalid = existingData && (String(existingData.status || '') === 'invalid' || !!existingData.invalidAt);

    const update = { updatedAt: now };
    if (subscription) update.subscription = subscription;
    if (city !== undefined) update.city = city || null;
    if (enabledPrayers !== undefined) update.enabledPrayers = enabledPrayers || {};
    // Reset failure counters and mark active when client updates subscription
    update.badAttemptCount = 0;
    update.lastFailedAt = null;
    update.lastFailureMsg = null;
    update.status = 'active';
    update.invalidAt = null;
    update.invalidReason = null;
    update.invalidError = null;
    update.invalidStatusCode = null;
    await docRef.set(update, { merge: true });

    // Read fresh doc to include in response
    const fresh = await docRef.get();
    const freshData = fresh.exists ? fresh.data() : null;

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, id: docId, wasInvalid: !!wasInvalid, data: freshData }));
  } catch (err) {
    console.error('update-subscription error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
