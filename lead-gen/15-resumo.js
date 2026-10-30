/* Resumo da execução — corre uma vez, no fim, por qualquer caminho
   (leads gravados, modo ensaio, fila vazia, ou nenhum lead novo).

   É o que se lê no n8n depois de carregar em "Execute": o que se
   pesquisou, quantos o Google deu, quantos entraram, o que falta. */

const cfg = $('Config ativa').first().json;
const itens = $input.all().map((i) => i.json);
const stats = (itens.find((i) => i._stats) || {})._stats || {};
let pesquisa = {};
try {
  pesquisa = $('Escolher da fila').first().json._pesquisa || {};
} catch (e) {}

const criados = itens.filter((i) => i._resultado === 'criado');
const falhados = itens.filter((i) => i._resultado === 'falhou');
const fora = itens.filter((i) => i._descartar);
const ensaio = itens.filter((i) => !i._resultado && !i._descartar && !i._sem_novos);
const processados = [...criados, ...falhados, ...ensaio];

/* Factos para o email: quantos a Claude propôs, quantos se provaram no
   texto do site e porque saíram os outros. */
const comFactos = itens.filter((i) => i._factos);
const soma = (k) => comFactos.reduce((a, i) => a + (i._factos[k] || 0), 0);
const factos = {
  leads_analisados: comFactos.length,
  leads_com_bloco: comFactos.filter((i) => i._factos.verificados > 0).length,
  propostos: soma('pedidos'),
  verificados: soma('verificados'),
  descartados: { citacao_nao_existe_no_site: soma('sem_citacao'), nome_de_pessoa: soma('nome_pessoa'), contacto: soma('contacto'), encurtada_sem_prova: soma('encurtada_sem_prova') },
  citacoes_encurtadas: soma('encurtadas'),
  sinais_cortados: soma('sinais_cortados'),
  leads_com_prova_de_sociedade: itens.filter((i) => i.entidade).length,
};

/* Custo da Claude nesta execução (preços por milhão de tokens). */
/* A OpenRouter devolve o custo de cada pedido; sem ele, calcula-se. */
const PRECOS = { 'anthropic/claude-sonnet-5': [2, 10], 'claude-sonnet-5': [2, 10] };
const usos = itens.filter((i) => i._uso);
const tin = usos.reduce((a, i) => a + (i._uso.input_tokens || 0), 0);
const tout = usos.reduce((a, i) => a + (i._uso.output_tokens || 0), 0);
const [pin, pout] = PRECOS[(usos.find((i) => i._modelo) || {})._modelo] || PRECOS['anthropic/claude-sonnet-5'];
const custo = usos.length && usos.every((i) => typeof i._uso.custo_usd === 'number')
  ? usos.reduce((a, i) => a + i._uso.custo_usd, 0)
  : (tin * pin + tout * pout) / 1e6;

const pendentes = pesquisa.celulas_pendentes_depois ?? pesquisa.pendentes_antes ?? null;
const esgotada = pendentes === 0 && pesquisa.fila_restante === 0;

const resumo = {
  perfil: cfg.perfil ? `${cfg.perfil} → ${cfg.responsavel}` : '',
  pesquisa: `${cfg.nicho} — ${cfg.location}${cfg.perfil ? (cfg.localidade_auto ? ' (rotação)' : ' (escolhida)') : ''}`,
  termos: cfg.termos.join('; '),
  modo: cfg.gravar_no_notion ? 'gravar no Notion' : 'ENSAIO (nada gravado no Notion)',
  tabela_notion: cfg.notion_db === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ? 'CRM de produção' : 'outra tabela: ' + cfg.notion_db,
  leads_no_crm_antes: stats.crm_total ?? null,
  google: {
    celulas_pesquisadas: pesquisa.celulas_pesquisadas || 0,
    pedidos_de_pesquisa: pesquisa.pedidos || 0,
    ids_encontrados: pesquisa.ids_encontrados || 0,
    ja_conhecidos: pesquisa.ja_conhecidos || 0,
    novos_para_a_fila: pesquisa.novos_para_a_fila || 0,
    celulas_subdivididas: pesquisa.celulas_subdivididas || 0,
    celulas_com_erro: pesquisa.celulas_com_erro || [],
    pedidos_de_detalhes: stats.encontrados ?? 0,
  },
  fila_restante: pesquisa.fila_restante ?? 0,
  celulas_por_pesquisar: pendentes,
  fechados: stats.fechados || [],
  excluidos_por_categoria: stats.excluidos_tipo || [],
  filiais: stats.filiais || [],
  fora_do_nicho: fora.map((i) => `${i.nome} (${i.analise_ok ? 'pelo site' : 'pelo nome'}${i.motivo_nome ? ': ' + i.motivo_nome : ''})`),
  criados_no_notion: criados.length,
  falhados: falhados.map((i) => `${i.nome}: ${i.erro}`),
  detalhes_falhados: stats.detalhes_falhados || [],
  factos_email: factos,
  claude: { chamadas: usos.length, tokens_entrada: tin, tokens_saida: tout, custo_usd: Math.round(custo * 10000) / 10000 },
  por_reanalisar: processados.filter((i) => i.por_reanalisar).map((i) => `${i.nome}: ${i.por_reanalisar}`),
  aviso: '',
};

if (esgotada) {
  resumo.aviso = cfg.perfil
    ? `Localidade esgotada: a próxima execução passa para a seguinte do perfil (${Math.max(0, (cfg.localidades_por_fazer || 1) - 1)} por fazer).`
    : 'Localidade esgotada para estes termos: todas as células pesquisadas e a fila vazia. Acrescenta termos ou muda de localidade.';
} else if (falhados.length) {
  resumo.aviso = `${falhados.length} lead(s) não entraram no Notion e ficaram na fila: entram na próxima execução.`;
} else if (!processados.length && !fora.length) {
  resumo.aviso = 'Nenhum lead novo nesta execução.' + (pendentes ? ` Ainda há ${pendentes} célula(s) por pesquisar — volta a correr.` : '');
}

// No modo ensaio, mostra o que TERIA sido gravado, para rever antes.
if (ensaio.length) {
  resumo.leads = ensaio.map((i) => ({
    nome: i.nome,
    termo: i.termo,
    categoria_google: i.tipo_google || '',
    score: i.score ?? null,
    sub_nicho: i.sub_nicho || '',
    telefone: i.telefone,
    email: i.email,
    website: i.website,
    rede_social: i.rede_social,
    filial_de: i.filial_de,
    segunda_leitura: i.segunda_leitura || '',
    resumo: String(i.resumo_final || '').slice(0, 400),
    factos: i.factos_email ? i.factos_email.factos.map((x) => `[${x.tipo}] "${x.citacao}"`) : [],
    idioma_site: i.factos_email ? i.factos_email.idioma_site : '',
    entidade: i.entidade ? `${i.entidade.forma || 'NIF'}${i.entidade.nif_coletivo ? ' + NIF' : ''} ← "${i.entidade.citacao}"` : '',
  }));
}

return [{ json: resumo }];
