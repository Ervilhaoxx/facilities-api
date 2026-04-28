export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tickets, mes, ano } = req.body;
  if (!tickets || !Array.isArray(tickets)) return res.status(400).json({ error: 'Dados inválidos' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const total = tickets.length;
  const concluidos = tickets.filter(t => t.status === 'Concluído').length;
  const abertos = tickets.filter(t => t.status === 'Aberto').length;
  const emAndamento = tickets.filter(t => t.status === 'Em andamento').length;
  const cancelados = tickets.filter(t => t.status === 'Cancelado').length;
  const urgentes = tickets.filter(t => t.prioridade === 'Urgente').length;
  const slaGeral = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  const porCategoria = {};
  const porPrioridade = {};
  const porDepartamento = {};
  tickets.forEach(t => {
    porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + 1;
    porPrioridade[t.prioridade] = (porPrioridade[t.prioridade] || 0) + 1;
    if (t.departamento) porDepartamento[t.departamento] = (porDepartamento[t.departamento] || 0) + 1;
  });

  const catLabels = { manutencao:'Manutenção', infraestrutura:'Infraestrutura', limpeza:'Limpeza', seguranca:'Segurança e Acesso', brindes:'Brindes', suprimentos:'Suprimentos', plataformas:'Acesso a Plataformas' };
  const catStr = Object.entries(porCategoria).map(([k,v]) => `${catLabels[k]||k}: ${v}`).join(', ');
  const prioStr = Object.entries(porPrioridade).map(([k,v]) => `${k}: ${v}`).join(', ');
  const topDepts = Object.entries(porDepartamento).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v]) => `${k}: ${v}`).join(', ');
  const slaPorPrio = ['Urgente','Alta','Média','Baixa'].map(p => {
    const tot = tickets.filter(t=>t.prioridade===p).length;
    const done = tickets.filter(t=>t.prioridade===p&&t.status==='Concluído').length;
    return `${p}: ${tot > 0 ? Math.round((done/tot)*100) : 0}% (${done}/${tot})`;
  }).join(', ');

  const prompt = `Você é um analista especialista em gestão de facilities corporativo. Gere um relatório mensal profissional em português brasileiro para a LogComex.

DADOS DO MÊS: ${mes}/${ano}
Total de chamados: ${total} | Concluídos: ${concluidos} (${slaGeral}%) | Abertos: ${abertos} | Em andamento: ${emAndamento} | Cancelados: ${cancelados} | Urgentes: ${urgentes}
Por categoria: ${catStr}
Por prioridade: ${prioStr}
SLA por prioridade: ${slaPorPrio}
Top centros de custo: ${topDepts}

Gere um relatório com: 1) Resumo Executivo 2) Análise de SLA 3) Principais Demandas 4) Centros de Custo em Destaque 5) Pontos de Atenção 6) Recomendações 7) Conclusão. Use markdown com negrito e listas.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Erro na API');
    return res.status(200).json({ relatorio: data.content[0].text, stats: { total, concluidos, slaGeral, abertos, urgentes } });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar relatório: ' + err.message });
  }
}
