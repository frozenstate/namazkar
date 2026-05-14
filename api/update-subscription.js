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
    if (!subscription) return res.status(400).end('Missing subscription object');
    
    // Check if this is a "read-only" fetch request (only subscription provided, no city/enabledPrayers)
    const isReadOnly = city === undefined && enabledPrayers === undefined;
    
    // Endpoint is required for updates, but null is allowed in read-only mode (fallback request)
    if (!isReadOnly && !subscription.endpoint) return res.status(400).end('Missing subscription.endpoint');
    
    // Only validate subscription structure when actually saving (not in read-only mode)
    if (!isReadOnly && (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth)) {
      console.error('update-subscription: invalid subscription structure', { endpoint: !!subscription.endpoint, keys: !!subscription.keys, p256dh: !!subscription.keys?.p256dh, auth: !!subscription.keys?.auth });
      return res.status(400).end('Invalid subscription.keys structure');
    }
    
    console.log('[update-subscription] received subscription:', { 
      endpoint: subscription.endpoint?.slice(-30),
      keyTypes: { p256dh: typeof subscription.keys.p256dh, auth: typeof subscription.keys.auth },
      isReadOnly, 
      city, 
      enabledPrayersCount: enabledPrayers ? Object.keys(enabledPrayers).length : 0
    });
    
    const docId = idFromEndpoint(subscription.endpoint);
    
    // For read-only mode with null endpoint, handle specially (skip doc lookup)
    if (isReadOnly && !subscription.endpoint) {
      // READ-ONLY mode with null endpoint: try to find most recent subscription as fallback
      try {
        // Query all active subscriptions ordered by recent (may need composite index)
        // If index doesn't exist, catch the error and return empty
        const recent = await firestore.collection('subscriptions')
          .where('status', '==', 'active')
          .orderBy('updatedAt', 'desc')
          .limit(1)
          .get();
        if (!recent.empty) {
          const recentData = recent.docs[0].data();
          console.log('[update-subscription] Fallback: returning most recent active subscription');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ 
            ok: true, 
            id: 'fallback', 
            wasInvalid: false, 
            data: { city: recentData.city || null, enabledPrayers: recentData.enabledPrayers || {}, status: recentData.status || 'active' },
            fallbackRestored: true
          }));
          return;
        }
        // No active subscriptions found, try any subscription
        const any = await firestore.collection('subscriptions')
          .orderBy('updatedAt', 'desc')
          .limit(1)
          .get();
        if (!any.empty) {
          const anyData = any.docs[0].data();
          console.log('[update-subscription] Fallback: returning most recent subscription (may be invalid)');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ 
            ok: true, 
            id: 'fallback', 
            wasInvalid: false, 
            data: { city: anyData.city || null, enabledPrayers: anyData.enabledPrayers || {}, status: anyData.status || 'active' },
            fallbackRestored: true
          }));
          return;
        }
      } catch (err) {
        console.warn('[update-subscription] Fallback query error (likely missing composite index):', err?.message);
        // Return empty data so client falls back to local backup
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ 
          ok: true, 
          id: 'fallback', 
          wasInvalid: false, 
          data: { city: null, enabledPrayers: {}, status: 'active' },
          fallbackRestored: true
        }));
        return;
      }
    }
    
    const docRef = firestore.collection('subscriptions').doc(docId);
    const now = new Date().toISOString();

    // Read existing doc to detect invalid state and to return stored metadata
    const existing = await docRef.get();
    const existingData = existing.exists ? existing.data() : null;
    const wasInvalid = existingData && (String(existingData.status || '') === 'invalid' || !!existingData.invalidAt);

    if (!isReadOnly) {
      // UPDATE mode: merge new subscription and metadata, reset failure counters
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
    }
    // else: READ-ONLY mode with valid endpoint - just read and return existing doc below

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
