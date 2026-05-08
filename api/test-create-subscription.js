const { firestore } = require('./_firebase');
const { requireAdminAuth } = require('./_adminAuth');

/**
 * Admin-only endpoint to create a test subscription for development/testing.
 * Creates a fake push subscription so you can test trigger-scheduled without
 * going through the browser notification flow.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  if (!requireAdminAuth(req, res)) return;
  if (!firestore) return res.status(500).end('Firebase not configured');

  try {
    const body = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => d += c.toString());
      req.on('end', () => resolve(JSON.parse(d)));
      req.on('error', reject);
    });

    const { city = 'Srinagar', enabledPrayers = {} } = body;

    // Generate a fake subscription endpoint for testing
    const testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const fakeEndpoint = `https://fcm.googleapis.com/fcm/send/${testId}`;
    const fakeSubscription = {
      endpoint: fakeEndpoint,
      keys: {
        p256dh: Buffer.alloc(65, 0).toString('base64'),
        auth: Buffer.alloc(16, 0).toString('base64')
      }
    };

    // Calculate doc ID same way as save-subscription
    function idFromEndpoint(endpoint) {
      return Buffer.from(endpoint).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    }

    const docId = idFromEndpoint(fakeEndpoint);
    const docRef = firestore.collection('subscriptions').doc(docId);
    const now = new Date().toISOString();

    await docRef.set({
      subscription: fakeSubscription,
      city: city || null,
      enabledPrayers: enabledPrayers || {},
      createdAt: now,
      updatedAt: now
    });

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 201;
    res.end(JSON.stringify({
      ok: true,
      id: docId,
      endpoint: fakeEndpoint,
      city,
      enabledPrayers,
      note: 'This is a fake test subscription. Push delivery will fail (expected behavior for testing).'
    }));
  } catch (err) {
    console.error('test-create-subscription error', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
