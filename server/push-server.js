// Example standalone Node script to send a single push notification.
// Usage: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env, then run:
//   node server/push-server.js ./subscription.json "{\"title\":\"Test\",\"body\":\"Hello\"}"

const fs = require('fs');
const webpush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const contact = 'mailto:namazkar@localhost.invalid';

if (!publicKey || !privateKey) {
  console.error('Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment');
  process.exit(2);
}

webpush.setVapidDetails(contact, publicKey, privateKey);

function base64ToBase64Url(base64) {
  if (!base64 || typeof base64 !== 'string') return base64;
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function normalizeSubscriptionKeys(subscription) {
  if (!subscription || !subscription.keys) return subscription;
  // Strip base64 padding (=) from keys - web-push requires keys without padding
  return {
    ...subscription,
    keys: {
      p256dh: subscription.keys.p256dh ? String(subscription.keys.p256dh).replace(/=/g, '') : subscription.keys.p256dh,
      auth: subscription.keys.auth ? String(subscription.keys.auth).replace(/=/g, '') : subscription.keys.auth
    }
  };
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node push-server.js ./subscription.json [payloadJson]');
  process.exit(2);
}

const subPath = args[0];
let payload = { title: 'Namaz Kar', body: 'Test push' };
if (args[1]) {
  try { payload = JSON.parse(args[1]); } catch (e) { /* ignore */ }
}

const sub = JSON.parse(fs.readFileSync(subPath, 'utf8'));
const normalizedSub = normalizeSubscriptionKeys(sub);

webpush.sendNotification(normalizedSub, JSON.stringify(payload)).then(() => {
  console.log('Push sent');
}).catch(err => {
  console.error('Push failed', err);
});
