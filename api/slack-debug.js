// /api/slack-debug.js — TEMPORÁRIO para ver logs do fluxo Slack
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const snap = await db.collection('slack_debug_logs')
    .orderBy('at', 'desc')
    .limit(30)
    .get();
  const logs = snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      at: data.at?.toDate ? data.at.toDate().toISOString() : data.at,
    };
  });
  res.status(200).json({ count: logs.length, logs });
};
