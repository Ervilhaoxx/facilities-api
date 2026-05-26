
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebase() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })});
  }
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.query.token !== 'setup2026facilities') {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const db = initFirebase();

  const brindes = [
    // Contêineres
    { id: 'container-preto',    nome: 'Contêiner Preto',    emoji: '⬛', estoque_storage: 100, estoque_sede: 40,  estoque_total: 140,  minimo_alerta: 50 },
    { id: 'container-laranja',  nome: 'Contêiner Laranja',  emoji: '🟧', estoque_storage: 100, estoque_sede: 50,  estoque_total: 150,  minimo_alerta: 50 },
    { id: 'container-branco',   nome: 'Contêiner Branco',   emoji: '⬜', estoque_storage: 100, estoque_sede: 47,  estoque_total: 147,  minimo_alerta: 50 },
    { id: 'container-roxo',     nome: 'Contêiner Roxo',     emoji: '🟪', estoque_storage: 350, estoque_sede: 43,  estoque_total: 393,  minimo_alerta: 50 },
    // Moleskine
    { id: 'moleskine',          nome: 'Moleskine',          emoji: '📓', estoque_storage: 900, estoque_sede: 250, estoque_total: 1150, minimo_alerta: 50 },
    // Sacolas
    { id: 'sacola-preta',       nome: 'Sacola Preta',       emoji: '🛍️', estoque_storage: 0,   estoque_sede: 500, estoque_total: 500,  minimo_alerta: 50 },
    // Garrafas
    { id: 'garrafa-branca',     nome: 'Garrafa Branca',     emoji: '🍶', estoque_storage: 0,   estoque_sede: 38,  estoque_total: 38,   minimo_alerta: 20 },
    { id: 'garrafa-preta',      nome: 'Garrafa Preta',      emoji: '🖤', estoque_storage: 0,   estoque_sede: 49,  estoque_total: 49,   minimo_alerta: 20 },
    // Copos Egg
    { id: 'copo-egg-branco',    nome: 'Copo Egg Branco',    emoji: '🥚', estoque_storage: 0,   estoque_sede: 18,  estoque_total: 18,   minimo_alerta: 10 },
    { id: 'copo-egg-preto',     nome: 'Copo Egg Preto',     emoji: '⚫', estoque_storage: 0,   estoque_sede: 15,  estoque_total: 15,   minimo_alerta: 10 },
    // Sem estoque
    { id: 'tapa-camera',        nome: 'Tapa Câmera',        emoji: '📷', estoque_storage: 0,   estoque_sede: 0,   estoque_total: 0,    minimo_alerta: 10 },
    { id: 'caneta',             nome: 'Caneta',             emoji: '✏️', estoque_storage: 0,   estoque_sede: 0,   estoque_total: 0,    minimo_alerta: 20 },
  ];

  for (const b of brindes) {
    const { id, ...dados } = b;
    await db.collection('estoque_brindes').doc(id).set({
      ...dados, ativo: true, updatedAt: new Date(), criadoEm: new Date()
    });
  }

  return res.status(200).json({ ok: true, criados: brindes.length, itens: brindes.map(b => b.nome) });
}
