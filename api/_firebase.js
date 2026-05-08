const admin = require('firebase-admin');

if (!global._firebaseAdmin) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || null;
  if (!serviceAccountJson) {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set; Firebase will not be available');
  } else {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase admin initialized');
    } catch (err) {
      console.error('Failed to initialize Firebase admin:', err);
    }
  }
  global._firebaseAdmin = admin;
}

module.exports = { admin: global._firebaseAdmin, firestore: global._firebaseAdmin ? global._firebaseAdmin.firestore() : null };
