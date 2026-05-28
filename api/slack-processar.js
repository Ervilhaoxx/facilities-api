// /api/slack-processar.js
// Endpoint interno chamado pelo slack-comando para processar mensagens DM em background.
// Recebe um payload simples e executa tudo (Claude Haiku, Firebase, Slack postMessage).
// É chamado SEM await pelo slack-comando, que retorna 200 imediatamente para o Slack.

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
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const CATEGORIAS = [
  { value: 'suprimentos', label: '📎 Suprimentos de escritório' },
  { value: 'manutencao',  label: '🔧 Manutenção' },
  { value: 'reforma',     label: '🏗️ Reforma & Melhoria' },
  { value: 'acessos',     label: '🔑 Acessos / Plataformas' },
  { value: 'brindes',     label: '🎁 Brindes' },
  { value: 'logistica',   label: '📦 Logística (envio)' },
  { value: 'outros',      label: '📝 Outros' },
];

async function getUserInfo(userId) {
  try {
    const r = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` }
    });
    const d = await r.json();
    if (!d.ok) return null;
    const p = d.user?.profile || {};
    return { slackId: userId, email: p.email || null, nome: p.real_name || p.display_name || d.user?.name || null };
  } catch { return null; }
}

async function enviarMensagem(channel, text, blocks = null) {
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text: text || ' ', ...(blocks ? { blocks } : {}) })
    });
  } catch (e) { console.error('enviarMensagem:', e.message); }
}

async function analisarMensagem(texto, estadoAnterior = null) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return analisarPorPalavrasChave(texto);

  const systemPrompt = `Você é um assistente do time de Facilities da LogComex. Interprete a mensagem do colaborador e extraia info estruturada.

Categorias (responda EXATAMENTE com um destes valores):
- suprimentos: papelaria, escritório (mouse, teclado, caneta, papel)
- manutencao: consertos (ar condicionado, lâmpada, vazamento, móvel quebrado)
- reforma: melhorias estruturais maiores
- acessos: criar/remover acesso a plataformas (Google, Slack, sistemas)
- brindes: solicitar brindes (moleskine, containers, garrafas, copos, sacolas, canetas)
- logistica: envio de pacotes (DHL, Correios, Uber Flash)
- outros: outros casos

Prioridade:
- baixa: rotina
- media: padrão (default)
- alta: urgente (palavras como "urgente", "preciso hoje", "parou", "quebrou")

RESPONDA APENAS COM JSON VÁLIDO:
{
  "categoria": "suprimentos"|"manutencao"|"reforma"|"acessos"|"brindes"|"logistica"|"outros"|null,
  "titulo": "Frase curta (máx 80 chars)"|null,
  "descricao": "Detalhes adicionais"|null,
  "prioridade": "baixa"|"media"|"alta",
  "tem_info_suficiente": true|false,
  "pergunta_adicional": "Pergunta se faltar info"|null,
  "saudacao_apenas": true|false
}

Se for só saudação ("oi", "olá") → saudacao_apenas: true.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: estadoAnterior ? `Contexto: ${JSON.stringify(estadoAnterior)}\n\nMensagem: "${texto}"` : `Mensagem: "${texto}"` }]
      })
    });
    const data = await r.json();
    const content = data?.content?.[0]?.text || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return analisarPorPalavrasChave(texto);
  } catch (e) {
    console.error('Claude erro:', e.message);
    return analisarPorPalavrasChave(texto);
  }
}

function analisarPorPalavrasChave(texto) {
  const t = texto.toLowerCase();
  const isSaudacao = /^(oi+|ola|olá|bom dia|boa tarde|boa noite|e aí|eai|hey|hi|hello)\s*[!.?]*\s*$/i.test(t.trim());
  if (isSaudacao) return { saudacao_apenas: true, tem_info_suficiente: false };
  let categoria = null;
  if (/mouse|teclado|caneta|papel|grampeador|clipe|cartucho|toner|impressora/i.test(t)) categoria = 'suprimentos';
  else if (/ar.?condicionado|lampada|lâmpada|vazamento|conserto|quebr|reparo|manuten/i.test(t)) categoria = 'manutencao';
  else if (/acesso|permiss|liberar|google|pipefy/i.test(t)) categoria = 'acessos';
  else if (/moleskine|garrafa|brinde|container|sacola/i.test(t)) categoria = 'brindes';
  else if (/dhl|correio|envio|enviar|pacote/i.test(t)) categoria = 'logistica';
  let prioridade = 'media';
  if (/urgent|hoje|agora|imediat|parou|quebrou/i.test(t)) prioridade = 'alta';
  return {
    categoria,
    titulo: texto.length > 80 ? texto.substring(0,77)+'...' : texto,
    descricao: null,
    prioridade,
    tem_info_suficiente: categoria !== null,
    pergunta_adicional: categoria === null ? 'Que tipo de chamado? (suprimentos, manutenção, brindes, acessos, etc.)' : null,
    saudacao_apenas: false,
  };
}

async function getEstado(uid) {
  const doc = await db.collection('slack_conversas').doc(uid).get();
  return doc.exists ? doc.data() : null;
}
async function setEstado(uid, dados) {
  await db.collection('slack_conversas').doc(uid).set({ ...dados, updatedAt: new Date() }, { merge: true });
}
async function limparEstado(uid) {
  await db.collection('slack_conversas').doc(uid).delete().catch(() => {});
}

module.exports = async function handler(req, res) {
  // Auth simples: só aceita chamadas com cabeçalho secreto
  const internalKey = req.headers['x-internal-key'];
  const expected = process.env.FIREBASE_PROJECT_ID; // usa env como segredo compartilhado
  if (internalKey !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Parse body
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const evt = body.evt;
  if (!evt || !evt.user || !evt.text || !evt.channel) {
    return res.status(400).json({ error: 'invalid payload' });
  }

  // Responde rápido — o caller não está aguardando mesmo
  res.status(200).json({ ok: true });

  // Agora processa em background (Vercel não vai matar pois já respondemos com sucesso)
  try {
    const userId = evt.user;
    const channel = evt.channel;
    const texto = (evt.text || '').trim();

    if (/^(cancelar|cancel|sair|reset)$/i.test(texto)) {
      await limparEstado(userId);
      await enviarMensagem(channel, '✅ Conversa reiniciada. Pode mandar uma nova solicitação quando quiser! 👋');
      return;
    }

    const estado = await getEstado(userId);
    const analise = await analisarMensagem(texto, estado);

    if (analise.saudacao_apenas) {
      await enviarMensagem(channel, null, [
        { type: 'section', text: { type: 'mrkdwn', text: `👋 *Olá!* Sou o assistente do time de Facilities da LogComex.` } },
        { type: 'section', text: { type: 'mrkdwn', text: `Me conta o que você precisa que eu te ajudo a abrir um chamado.\n\n*Exemplos:*\n• _"Preciso de um mouse novo"_\n• _"Ar condicionado da sala 3 com problema"_\n• _"Quero pedir alguns moleskines"_\n• _"Envio via DHL para São Paulo"_` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '💡 Também pode usar o formulário: facilities-api.vercel.app' }] }
      ]);
      return;
    }

    if (!analise.tem_info_suficiente && analise.pergunta_adicional) {
      await setEstado(userId, {
        etapa: 'aguardando_resposta',
        categoria: analise.categoria,
        titulo: analise.titulo,
        descricao: analise.descricao,
        prioridade: analise.prioridade,
        texto_original: texto,
      });
      await enviarMensagem(channel, null, [
        { type: 'section', text: { type: 'mrkdwn', text: `🤔 ${analise.pergunta_adicional}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Digite "cancelar" para reiniciar.' }] }
      ]);
      return;
    }

    // Mostrar resumo + confirmar
    const dados = {
      categoria: analise.categoria,
      titulo: analise.titulo,
      descricao: analise.descricao,
      prioridade: analise.prioridade,
      texto_original: estado?.texto_original ? `${estado.texto_original}\n\n${texto}` : texto,
    };
    await setEstado(userId, { etapa: 'confirmar', ...dados });

    const catLabel = CATEGORIAS.find(c => c.value === dados.categoria)?.label || dados.categoria || '—';
    const prioEmoji = { baixa: '🟢 Baixa', media: '🟡 Média', alta: '🔴 Alta' }[dados.prioridade] || '🟡 Média';

    await enviarMensagem(channel, '📋 Confira o resumo:', [
      { type: 'header', text: { type: 'plain_text', text: '📋 Resumo do chamado', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `Confira se está tudo certo antes de eu abrir:` } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Categoria:*\n${catLabel}` },
          { type: 'mrkdwn', text: `*Prioridade:*\n${prioEmoji}` },
          { type: 'mrkdwn', text: `*Solicitação:*\n${dados.titulo || '—'}` },
          ...(dados.descricao ? [{ type: 'mrkdwn', text: `*Detalhes:*\n${dados.descricao}` }] : []),
        ]
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ Confirmar e abrir', emoji: true }, style: 'primary', action_id: 'fac_confirmar', value: JSON.stringify(dados) },
          { type: 'button', text: { type: 'plain_text', text: '✏️ Mudar categoria', emoji: true }, action_id: 'fac_editar', value: JSON.stringify(dados) },
          { type: 'button', text: { type: 'plain_text', text: '❌ Cancelar', emoji: true }, style: 'danger', action_id: 'fac_cancelar' },
        ]
      }
    ]);
  } catch (err) {
    console.error('Erro slack-processar:', err.message, err.stack);
  }
};
