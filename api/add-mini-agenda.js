// Endpoint temporário pra adicionar Mini Agenda no estoque de brindes
// Roda 1x e depois pode apagar
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
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ref = db.collection('estoque_brindes').doc('mini-agenda');
    const existing = await ref.get();

    if (existing.exists) {
      return res.status(200).json({
        ok: true,
        msg: 'Mini Agenda já existe no estoque',
        data: existing.data()
      });
    }

    const novo = {
      nome: 'Mini Agenda',
      ativo: true,
      estoque_storage: 200,
      estoque_sede: 200,
      estoque_total: 400,
      minimo: 50,
      categoria: 'Brindes',
      observacao: 'Moleskine pequeno — disponível para Comercial e CS',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await ref.set(novo);

    return res.status(200).json({
      ok: true,
      msg: 'Mini Agenda adicionada com sucesso!',
      data: novo
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
