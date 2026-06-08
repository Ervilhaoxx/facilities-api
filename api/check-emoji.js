const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();
module.exports = async (req, res) => {
  const cats = await db.collection('imob_categorias').get();
  const pats = await db.collection('imob_patrimonio').get();
  return res.status(200).json({
    ok: true,
    categorias: cats.docs.map(d => ({ nome: d.data().nome, emoji: d.data().emoji })),
    patrimonios: pats.docs.map(d => ({ nome: d.data().nome, categoria: d.data().categoria })),
  });
};
