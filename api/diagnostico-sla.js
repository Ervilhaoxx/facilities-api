// /api/diagnostico-sla.js
// Endpoint admin temporário para investigar o formato dos dados no Firebase
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
  const adminEmail = (req.headers['x-admin-email'] || '').toLowerCase().trim();
  if (adminEmail !== 'joao.faria@logcomex.com') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    // Pegar 10 amostras de tickets de 2025 para entender o formato
    const snap = await db.collection('tickets')
      .where('data_abertura', '>=', new Date('2025-01-01'))
      .where('data_abertura', '<', new Date('2025-02-01'))
      .limit(15)
      .get();

    const amostras = [];
    snap.forEach((doc) => {
      const t = doc.data();
      amostras.push({
        docId: doc.id,
        id: t.id,
        nome: t.nome,
        titulo: t.titulo,
        userEmail: t.userEmail,
        categoria: t.categoria,
        tipo_pipefy: t.tipo_pipefy,
        fase_pipefy: t.fase_pipefy,
        status: t.status,
        origem: t.origem,
        dentroSLA: t.dentroSLA,
        data_abertura: t.data_abertura?.toDate?.()?.toISOString() || t.data_abertura,
        data_conclusao: t.data_conclusao?.toDate?.()?.toISOString() || t.data_conclusao,
        // todos campos disponíveis
        camposExistentes: Object.keys(t).sort(),
      });
    });

    // Contar campos comuns
    const totalSnap = await db.collection('tickets')
      .where('data_abertura', '>=', new Date('2024-01-01'))
      .where('data_abertura', '<', new Date('2026-01-01'))
      .get();
    const total = totalSnap.size;
    let comNome = 0, comTitulo = 0, comUserEmail = 0;
    let dentroSLA = 0, foraSLA = 0;
    totalSnap.forEach((doc) => {
      const t = doc.data();
      if (t.nome) comNome++;
      if (t.titulo) comTitulo++;
      if (t.userEmail) comUserEmail++;
      if (t.dentroSLA === true) dentroSLA++;
      else if (t.dentroSLA === false) foraSLA++;
    });

    return res.status(200).json({
      total,
      campos: {
        comNome,
        comTitulo,
        comUserEmail,
        dentroSLA,
        foraSLA,
      },
      amostras,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
