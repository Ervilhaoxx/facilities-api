// api/notify-slack.js
// Notificações: conclusão, rastreio DHL, aprovação/recusa de brindes

const GESTOR_EMAIL = 'leandro.oliveira@logcomex.com'; // Gestor principal de aprovação

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
  if (!SLACK_BOT_TOKEN) return res.status(500).json({ error: 'SLACK_BOT_TOKEN não configurado' });

  const {
    tipo, ticket, ticketId, titulo, categoria,
    solicitanteEmail, solicitanteNome, dataAbertura,
    email, nome, transportadora, rastreio, item,
    itens, aprovado, motivo,
    // campos exclusivos para notificação de novo brinde ao gestor
    docId, emailColaborador, nomeColaborador, itensBrinde
  } = req.body;

  // ── Notificação de NOVO BRINDE ao gestor ───────────────────
  if (tipo === 'novo_brinde_gestor') {
    try {
      // Buscar o gestor no Slack pelo email
      const userRes = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(GESTOR_EMAIL)}`,
        { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
      );
      const userData = await userRes.json();
      if (!userData.ok) {
        console.error('Gestor não encontrado no Slack:', userData.error);
        return res.status(200).json({ warning: 'Gestor não encontrado, mas chamado salvo.' });
      }
      const gestorId = userData.user.id;

      // Abrir DM com o gestor
      const dmRes = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: gestorId })
      });
      const dmData = await dmRes.json();
      if (!dmData.ok) return res.status(500).json({ error: `Erro ao abrir DM: ${dmData.error}` });
      const channelId = dmData.channel.id;

      // Valor serializado para os botões — contém tudo que precisamos para aprovar/recusar
      const btnValue = JSON.stringify({
        docId, ticketId: ticket || ticketId,
        emailColaborador: emailColaborador || email,
        nomeColaborador: nomeColaborador || nome,
        itens: itensBrinde || itens || '',
        titulo: titulo || ''
      });

      // Mensagem com botões de ação direto no Slack
      const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelId,
          username: 'Facilities LogComex',
          icon_emoji: ':gift:',
          text: `🎁 Nova solicitação de brinde aguardando sua aprovação — ${ticket || ticketId}`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '🎁 Nova Solicitação de Brinde', emoji: true }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Olá, Leandro! Uma nova solicitação de brinde precisa da sua aprovação.`
              }
            },
            { type: 'divider' },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Chamado:*\n${ticket || ticketId || '—'}` },
                { type: 'mrkdwn', text: `*Solicitante:*\n${nomeColaborador || nome || '—'}` },
                { type: 'mrkdwn', text: `*E-mail:*\n${emailColaborador || email || '—'}` },
                ...(titulo ? [{ type: 'mrkdwn', text: `*Solicitação:*\n${titulo}` }] : []),
              ]
            },
            ...(itensBrinde || itens ? [{
              type: 'section',
              text: { type: 'mrkdwn', text: `*Itens solicitados:*\n${itensBrinde || itens}` }
            }] : []),
            { type: 'divider' },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Aprovar', emoji: true },
                  style: 'primary',
                  action_id: 'aprovar_brinde',
                  value: btnValue
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '❌ Recusar', emoji: true },
                  style: 'danger',
                  action_id: 'recusar_brinde',
                  value: btnValue
                }
              ]
            },
            { type: 'divider' },
            {
              type: 'context',
              elements: [{
                type: 'mrkdwn',
                text: `🏢 *Facilities LogComex* • Ver chamado: https://facilities-api.vercel.app/admin.html`
              }]
            }
          ]
        })
      });

      const msgData = await msgRes.json();
      if (!msgData.ok) return res.status(500).json({ error: `Erro ao enviar para gestor: ${msgData.error}` });

      return res.status(200).json({ success: true, message: 'Gestor notificado no Slack!' });

    } catch (err) {
      console.error('Erro notificação gestor:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Alerta de estoque baixo → DM para o Leandro ─────────────
  if (tipo === 'alerta_estoque') {
    const { itens_baixos } = req.body;
    if (!itens_baixos || !itens_baixos.length) return res.status(400).json({ error: 'itens_baixos obrigatório' });

    try {
      // Abrir DM com o Leandro via conversations.open
      const dmRes = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: 'U019X3PFNR5' })
      });
      const dmData = await dmRes.json();
      if (!dmData.ok) return res.status(500).json({ error: `DM error: ${dmData.error}` });

      const temEsgotado = itens_baixos.some(x => x.estoque_total <= 0);

      const blocks = [
        {
          type: 'header',
          text: { type: 'plain_text', text: temEsgotado ? '🚨 Alerta de Estoque Esgotado!' : '⚠️ Alerta de Estoque Baixo', emoji: true }
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `Leandro, os seguintes itens de brinde precisam de reposição:` }
        },
        { type: 'divider' },
        ...itens_baixos.map(item => ({
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*${item.emoji} ${item.nome}*` },
            { type: 'mrkdwn', text: item.estoque_total <= 0
              ? `*Status:* 🔴 Esgotado`
              : `*Restam:* ${item.estoque_total} unidades (mínimo: ${item.minimo_alerta})` }
          ]
        })),
        { type: 'divider' },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: '📦 Ver Estoque no Painel', emoji: true },
            url: 'https://facilities-api.vercel.app/admin.html',
            style: 'primary'
          }]
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '🏢 *Facilities LogComex* • Estoque de Brindes' }]
        }
      ];

      const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: dmData.channel.id,
          text: temEsgotado ? '🚨 Item de brinde esgotado!' : '⚠️ Estoque de brinde baixo!',
          blocks
        })
      });
      const msgData = await msgRes.json();
      if (!msgData.ok) return res.status(500).json({ error: `msg error: ${msgData.error} | channel: ${dmData.channel.id}` });
      return res.status(200).json({ success: true, message: 'Leandro notificado!', channel: dmData.channel.id });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Novo feedback → canal #compras-facilities ─────────────
  if (tipo === 'novo_feedback') {
    const { canal_id, tipo_feedback, assunto, texto, nome, chamado_ref, anon } = req.body;
    if (!canal_id) return res.status(400).json({ error: 'canal_id obrigatório' });

    const emoji = tipo_feedback === 'Elogio' ? '⭐' : tipo_feedback === 'Sugestão' ? '💡' : '📝';
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `${emoji} Novo Feedback Recebido`, emoji: true } },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Tipo:*\n${tipo_feedback || 'Geral'}` },
          { type: 'mrkdwn', text: `*De:*\n${nome || 'Anônimo'}` },
          ...(assunto ? [{ type: 'mrkdwn', text: `*Assunto:*\n${assunto}` }] : []),
          ...(chamado_ref ? [{ type: 'mrkdwn', text: `*Chamado:*\n${chamado_ref}` }] : []),
        ]
      },
      ...(texto && texto !== '(Anônimo)' ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*Mensagem:*\n_${texto}_` }
      }] : []),
      { type: 'divider' },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: '📋 Ver no painel', emoji: true },
          url: 'https://facilities-api.vercel.app/admin.html',
          style: 'primary'
        }]
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '🏢 *Facilities LogComex* • facilities-api.vercel.app' }] }
    ];

    try {
      const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: canal_id,
          username: 'Facilities LogComex',
          icon_emoji: ':speech_balloon:',
          text: `${emoji} Novo feedback recebido de ${nome || 'Anônimo'}`,
          blocks
        })
      });
      const msgData = await msgRes.json();
      if (!msgData.ok) return res.status(500).json({ error: msgData.error });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Demais notificações (colaborador) ──────────────────────
  const emailAlvo = solicitanteEmail || email;
  if (!emailAlvo) return res.status(400).json({ error: 'email obrigatório' });
  const nomeAlvo = solicitanteNome || nome || emailAlvo.split('@')[0];
  const ticketNum = ticket || ticketId || '—';

  try {
    // Buscar usuário no Slack
    const userRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(emailAlvo)}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    );
    const userData = await userRes.json();
    if (!userData.ok) return res.status(404).json({ error: `Usuário não encontrado: ${userData.error}` });

    const dmRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: userData.user.id }),
    });
    const dmData = await dmRes.json();
    if (!dmData.ok) return res.status(500).json({ error: `Erro ao abrir DM: ${dmData.error}` });
    const channelId = dmData.channel.id;

    let blocks, text;

    // ── Aprovação / recusa de brinde → colaborador ──────────
    if (tipo === 'aprovacao_brinde') {
      if (aprovado) {
        text = `✅ Sua solicitação de brinde ${ticketNum} foi aprovada!`;
        blocks = [
          { type: 'header', text: { type: 'plain_text', text: '✅ Brinde Aprovado!', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: `Boa notícia, *${nomeAlvo}*! Sua solicitação foi *aprovada* pelo gestor e encaminhada para o time de Facilities. 🎁` } },
          { type: 'divider' },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Chamado:*\n${ticketNum}` },
              { type: 'mrkdwn', text: `*Status:*\nEm andamento ✅` },
              ...(titulo ? [{ type: 'mrkdwn', text: `*Solicitação:*\n${titulo}` }] : []),
              ...(itens ? [{ type: 'mrkdwn', text: `*Itens:*\n${itens}` }] : []),
            ]
          },
          { type: 'divider' },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '🏢 *Facilities LogComex* • facilities-api.vercel.app' }] }
        ];
      } else {
        text = `❌ Sua solicitação de brinde ${ticketNum} foi recusada.`;
        blocks = [
          { type: 'header', text: { type: 'plain_text', text: '❌ Solicitação Recusada', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: `Olá, *${nomeAlvo}*. Sua solicitação de brinde *não foi aprovada* pelo gestor.` } },
          { type: 'divider' },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Chamado:*\n${ticketNum}` },
              ...(motivo ? [{ type: 'mrkdwn', text: `*Motivo:*\n${motivo}` }] : []),
            ]
          },
          { type: 'section', text: { type: 'mrkdwn', text: 'Em caso de dúvidas, entre em contato com o time de Facilities.' } },
          { type: 'divider' },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '🏢 *Facilities LogComex* • facilities-api.vercel.app' }] }
        ];
      }
    }

    // ── Rastreio DHL ─────────────────────────────────────────
    else if (tipo === 'rastreio') {
      const transp = transportadora || 'DHL';
      const trackUrl = transp === 'DHL'
        ? `https://www.dhl.com/br-pt/home/tracking.html?tracking-id=${rastreio}` : null;
      text = `📦 Código de rastreio: ${rastreio}`;
      blocks = [
        { type: 'header', text: { type: 'plain_text', text: '📦 Seu envio está a caminho!', emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `Olá, *${nomeAlvo}*! Seu envio via *${transp}* foi processado. 🚚` } },
        { type: 'divider' },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Chamado:*\n${ticketNum}` },
            { type: 'mrkdwn', text: `*Transportadora:*\n${transp}` },
            ...(item ? [{ type: 'mrkdwn', text: `*Item:*\n${item}` }] : []),
          ]
        },
        { type: 'section', text: { type: 'mrkdwn', text: `📋 *Código de rastreio:*\n\`${rastreio}\`` } },
        ...(trackUrl ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: '🔍 Rastrear envio', emoji: true }, url: trackUrl, style: 'primary' }] }] : []),
        { type: 'context', elements: [{ type: 'mrkdwn', text: '🏢 *Facilities LogComex* • facilities-api.vercel.app' }] }
      ];
    }

    // ── Conclusão ────────────────────────────────────────────
    else {
      let dataFormatada = dataAbertura;
      try { dataFormatada = new Date(dataAbertura).toLocaleDateString('pt-BR'); } catch {}
      const feedbackUrl = `https://facilities-api.vercel.app/?feedback=${encodeURIComponent(ticketId || ticket || '')}`;
      text = `✅ Chamado concluído!`;
      blocks = [
        { type: 'header', text: { type: 'plain_text', text: '✅ Chamado Concluído!', emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `Olá, *${nomeAlvo}*! Seu chamado foi resolvido. 🎉` } },
        { type: 'divider' },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Chamado:*\n${ticketNum}` },
            { type: 'mrkdwn', text: `*Categoria:*\n${categoria || '—'}` },
            { type: 'mrkdwn', text: `*Título:*\n${titulo || '—'}` },
            { type: 'mrkdwn', text: `*Aberto em:*\n${dataFormatada || '—'}` },
          ]
        },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '💬 *Como foi o atendimento?*' } },
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: '⭐ Avaliar atendimento', emoji: true }, url: feedbackUrl, style: 'primary' }] },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '🏢 *Facilities LogComex* • facilities-api.vercel.app' }] }
      ];
    }

    const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: channelId,
        username: 'Facilities LogComex',
        icon_emoji: tipo === 'aprovacao_brinde' ? (aprovado ? ':white_check_mark:' : ':x:') : tipo === 'rastreio' ? ':package:' : ':white_check_mark:',
        text, blocks
      }),
    });
    const msgData = await msgRes.json();
    if (!msgData.ok) return res.status(500).json({ error: `Erro: ${msgData.error}` });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Erro notify-slack:', err);
    return res.status(500).json({ error: err.message });
  }
}
