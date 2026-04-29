export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.status(200).end();
          if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
            const { ticketId, ticketNumero, titulo, categoria, solicitanteEmail, solicitanteNome, dataAbertura } = req.body;
              if (!solicitanteEmail || !ticketId) return res.status(400).json({ error: 'Dados insuficientes' });
                const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
                  if (!SLACK_BOT_TOKEN) return res.status(500).json({ error: 'SLACK_BOT_TOKEN nao configurado' });
                    try {
                        const userRes = await fetch('https://slack.com/api/users.lookupByEmail?email=' + encodeURIComponent(solicitanteEmail), { headers: { Authorization: 'Bearer ' + SLACK_BOT_TOKEN } });
                            const userData = await userRes.json();
                                if (!userData.ok || !userData.user) return res.status(404).json({ error: 'Usuario Slack nao encontrado: ' + solicitanteEmail, slackError: userData.error });
                                    const slackUserId = userData.user.id;
                                        const dmRes = await fetch('https://slack.com/api/conversations.open', { method: 'POST', headers: { Authorization: 'Bearer ' + SLACK_BOT_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ users: slackUserId }) });
                                            const dmData = await dmRes.json();
                                                if (!dmData.ok) return res.status(500).json({ error: 'Erro ao abrir DM', slackError: dmData.error });
                                                    const channelId = dmData.channel.id;
                                                        const emojis = { manutencao:'🔧', infraestrutura:'🏗️', limpeza:'🧹', seguranca:'🔒', brindes:'🎁', suprimentos:'📦', plataformas:'💻', mudanca:'🚚' };
                                                            const emoji = emojis[categoria] || '📋';
                                                                let dataFormatada = dataAbertura;
                                                                    if (dataAbertura && dataAbertura._seconds) { const d = new Date(dataAbertura._seconds * 1000); dataFormatada = d.toLocaleDateString('pt-BR'); }
                                                                        const nome = solicitanteNome || solicitanteEmail.split('@')[0];
                                                                            const blocks = [
                                                                                  { type:'header', text:{ type:'plain_text', text:'Chamado Concluido! ✅', emoji:true } },
                                                                                        { type:'section', text:{ type:'mrkdwn', text:'Ola, *' + nome + '*! Seu chamado foi resolvido pela equipe de Facilities LogComex.' } },
                                                                                              { type:'divider' },
                                                                                                    { type:'section', fields:[
                                                                                                            { type:'mrkdwn', text:'*Chamado:*\n' + ticketNumero },
                                                                                                                    { type:'mrkdwn', text:'*Categoria:*\n' + emoji + ' ' + categoria },
                                                                                                                            { type:'mrkdwn', text:'*Titulo:*\n' + titulo },
                                                                                                                                    { type:'mrkdwn', text:'*Aberto em:*\n' + dataFormatada }
                                                                                                                                          ]},
                                                                                                                                                { type:'divider' },
                                                                                                                                                      { type:'section', text:{ type:'mrkdwn', text:'Ficou satisfeito com o atendimento? Acesse o sistema para deixar seu feedback!' } },
                                                                                                                                                            { type:'actions', elements:[{ type:'button', text:{ type:'plain_text', text:'Deixar Feedback', emoji:true }, url:'https://facilities-api.vercel.app', style:'primary' }] },
                                                                                                                                                                  { type:'context', elements:[{ type:'mrkdwn', text:'LogComex Facilities - facilities-api.vercel.app' }] }
                                                                                                                                                                      ];
                                                                                                                                                                          const msgRes = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: 'Bearer ' + SLACK_BOT_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: channelId, text: 'Chamado ' + ticketNumero + ' foi concluido!', blocks }) });
                                                                                                                                                                              const msgData = await msgRes.json();
                                                                                                                                                                                  if (!msgData.ok) return res.status(500).json({ error: 'Erro ao enviar mensagem', slackError: msgData.error });
                                                                                                                                                                                      return res.status(200).json({ success: true, message: 'Notificacao enviada para ' + solicitanteEmail });
                                                                                                                                                                                        } catch (err) {
                                                                                                                                                                                            return res.status(500).json({ error: 'Erro interno: ' + err.message });
                                                                                                                                                                                              }
                                                                                                                                                                                              }
