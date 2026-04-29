// api/notify-slack.js
// Vercel Serverless Function - Notificação Slack ao concluir chamado

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
  if (!SLACK_BOT_TOKEN) return res.status(500).json({ error: 'SLACK_BOT_TOKEN não configurado' });

  const { ticketId, titulo, categoria, solicitanteEmail, solicitanteNome, dataAbertura } = req.body;
  if (!solicitanteEmail) return res.status(400).json({ error: 'solicitanteEmail obrigatório' });

  try {
    // 1. Busca usuário Slack pelo e-mail
    const userRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(solicitanteEmail)}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    );
    const userData = await userRes.json();
    if (!userData.ok) {
      return res.status(404).json({ error: `Usuário não encontrado no Slack: ${userData.error}` });
    }
    const slackUserId = userData.user.id;

    // 2. Abre DM
    const dmRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: slackUserId }),
    });
    const dmData = await dmRes.json();
    if (!dmData.ok) return res.status(500).json({ error: `Erro ao abrir DM: ${dmData.error}` });
    const channelId = dmData.channel.id;

    // 3. Formata data
    let dataFormatada = dataAbertura;
    if (dataAbertura) {
      try {
        const d = new Date(dataAbertura);
        dataFormatada = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch {}
    }

    // 4. Link de feedback com o chamado pré-preenchido
    const feedbackUrl = `https://facilities-api.vercel.app/?feedback=${encodeURIComponent(ticketId)}`;

    // 5. Envia DM
    const messageRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: channelId,
        username: 'Facilities LogComex',
        icon_emoji: ':white_check_mark:',
        text: `✅ Seu chamado *${ticketId}* foi concluído!`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '✅ Chamado Concluído!', emoji: true },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Olá, *${solicitanteNome || solicitanteEmail.split('@')[0]}*! Seu chamado foi resolvido pela equipe de Facilities. 🎉`,
            },
          },
          { type: 'divider' },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Chamado:*\n${ticketId}` },
              { type: 'mrkdwn', text: `*Categoria:*\n${categoria || '—'}` },
              { type: 'mrkdwn', text: `*Título:*\n${titulo || '—'}` },
              { type: 'mrkdwn', text: `*Aberto em:*\n${dataFormatada || '—'}` },
            ],
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '💬 *Como foi o atendimento?* Sua avaliação nos ajuda a melhorar!',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '⭐ Avaliar atendimento', emoji: true },
                url: feedbackUrl,
                style: 'primary',
              },
            ],
          },
          { type: 'divider' },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '🏢 *Facilities LogComex* • Dúvidas? Abra um novo chamado em facilities-api.vercel.app',
              },
            ],
          },
        ],
      }),
    });

    const msgData = await messageRes.json();
    if (!msgData.ok) return res.status(500).json({ error: `Erro ao enviar mensagem: ${msgData.error}` });

    return res.status(200).json({
      success: true,
      message: `Notificação enviada para ${solicitanteEmail}`,
      slackUserId,
      ts: msgData.ts,
    });

  } catch (err) {
    console.error('Erro notify-slack:', err);
    return res.status(500).json({ error: err.message });
  }
}
