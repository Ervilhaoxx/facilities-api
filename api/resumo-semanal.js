const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n'),
  })});
}
const db = admin.firestore();
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const JOAO_DM = 'D0B0NEKTYLA';

module.exports = async (req, res) => {
  // Só roda às segundas (dia 1) ou via token manual
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const token = req.query?.token;
  if (diaSemana !== 1 && token !== 'resumo_joao_2024') {
    return res.status(200).json({ ok: false, msg: 'Só roda às segundas ou com token' });
  }

  try {
    // Pegar tickets da semana passada
    const umaSemanaAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
    const snap = await db.collection('tickets')
      .where('data_abertura', '>=', umaSemanaAtras)
      .get();

    const tickets = snap.docs.map(d => d.data());
    const total = tickets.length;
    const abertos = tickets.filter(t => t.status === 'Aberto').length;
    const concluidos = tickets.filter(t => t.status === 'Concluído').length;
    const andamento = tickets.filter(t => t.status === 'Em andamento').length;
    const urgentes = tickets.filter(t => t.prioridade === 'alta' && t.status !== 'Concluído').length;

    // Contar por categoria
    const porCat = {};
    tickets.forEach(t => { porCat[t.categoria] = (porCat[t.categoria]||0)+1; });
    const topCats = Object.entries(porCat).sort((a,b)=>b[1]-a[1]).slice(0,3);

    const semana = `${umaSemanaAtras.toLocaleDateString('pt-BR')} a ${hoje.toLocaleDateString('pt-BR')}`;

    const msg = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
      body: JSON.stringify({
        channel: JOAO_DM,
        text: '📊 Resumo semanal Facilities',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '📊 Resumo Semanal · Facilities', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `Semana de ${semana}` }] },
          { type: 'divider' },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: `*Total de chamados*\n${total}` },
            { type: 'mrkdwn', text: `*Concluídos*\n✅ ${concluidos}` },
            { type: 'mrkdwn', text: `*Em aberto*\n🔵 ${abertos}` },
            { type: 'mrkdwn', text: `*Em andamento*\n🟠 ${andamento}` },
          ]},
          ...(urgentes > 0 ? [{ type: 'section', text: { type: 'mrkdwn', text: `⚠️ *${urgentes} chamado${urgentes>1?'s':''} urgente${urgentes>1?'s':''} em aberto* — requer atenção!` } }] : []),
          ...(topCats.length > 0 ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Top categorias:*\n${topCats.map(([k,v])=>`• ${k}: ${v}`).join('\n')}` } }] : []),
          { type: 'divider' },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `<https://facilities-api.vercel.app/admin.html|Ver painel completo →>` }] }
        ]
      })
    });
    const msgData = await msg.json();
    return res.status(200).json({ ok: msgData.ok, total });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
