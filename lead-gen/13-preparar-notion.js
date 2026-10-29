// @comum
/* Preparar para Notion — corre por lead. Monta o corpo do pedido e
   decide se o lead é gravado:
   - fora do nicho (segundo a Claude, pelo site ou, sem site, pelo
     nome e categoria) → não grava, mas aparece no resumo para se
     poder confirmar;
   - gravar_no_notion = false (modo ensaio) → não grava nada. */

const cfg = $('Config ativa').first().json;
const DB = cfg.notion_db;
const l = $json;

const avaliado = l.analise_ok === true || l.verificado_nome === true;
const descartar = !!cfg.descartar_fora_do_nicho && avaliado && l.no_nicho === false;

let resumo;
if (l.analise_ok) {
  resumo = l.resumo;
  if (l.sinais.length) resumo += '\n\nSinais: ' + l.sinais.join(' | ');
  if (l.dor_provavel) resumo += '\nDor provável: ' + l.dor_provavel;
} else if (l.por_reanalisar) {
  resumo = 'POR REANALISAR — ' + l.por_reanalisar;
} else if (!cfg.enrich) {
  resumo = '';
} else if (l.rede_social && !l.website) {
  resumo = 'Sem website próprio (só ' + hostDe(l.rede_social) + ').';
} else if (!l.website) {
  resumo = 'Sem website no Google.';
} else {
  resumo = 'Website sem conteúdo legível' + (l.site_erro ? ' (' + l.site_erro.slice(0, 120) + ')' : '') + '.';
}
// Sem análise do site, a categoria do Google é a melhor pista para o comercial.
if (!l.analise_ok && l.tipo_google) resumo += (resumo ? '\n' : '') + 'Categoria no Google: ' + l.tipo_google + '.';

const rt = (s) => [{ text: { content: String(s || '').slice(0, 1900) } }];
const semVirgulas = (s) => String(s || '').replace(/,/g, ' ').trim();

const props = {
  Empresa: { title: rt(l.nome) },
  Telefone: { rich_text: rt(l.telefone) },
  Website: { url: l.website || null },
  'Rede social': { url: l.rede_social || null },
  Localizacao: { rich_text: rt(l.morada) },
  Rating: { number: typeof l.rating === 'number' ? l.rating : null },
  'Tipo de Negocio': { select: { name: semVirgulas(cfg.nicho) || 'Outro' } },
  'Termo de pesquisa': { rich_text: rt(l.termo) },
  Resumo: { rich_text: rt(resumo) },
  Enriquecido: { checkbox: l.analise_ok === true },
  'Place ID': { rich_text: rt(l.place_id) },
  Estado: { select: { name: 'Novo' } },
  'Filial de': { rich_text: rt(l.filial_de) },
  'Score IA': { number: typeof l.score === 'number' ? l.score : null },
};
if (emailValido(l.email)) props.Email = { email: l.email };
if (l.sub_nicho) props['Sub-nicho'] = { select: { name: l.sub_nicho } };
if (cfg.responsavel) props.Responsavel = { select: { name: semVirgulas(cfg.responsavel) } };

/* Factos para o email: vão no corpo da página, não em colunas (as
   vistas dos comerciais não mudam). Um título e um bloco de código JSON;
   o Notion aceita no máximo 2000 caracteres por objeto de texto, por
   isso o JSON é partido em vários dentro do mesmo bloco. Sem factos
   verificados, não há bloco. */
const children = [];
if (l.factos_email && l.factos_email.factos.length) {
  const json = JSON.stringify({ versao: 2, gerado_em: new Date().toISOString(), modelo: l._modelo || '', ...l.factos_email }, null, 2);
  const partes = [];
  for (let i = 0; i < json.length; i += 2000) partes.push({ type: 'text', text: { content: json.slice(i, i + 2000) } });
  children.push(
    { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: 'Factos para email (auto)' } }] } },
    { object: 'block', type: 'code', code: { language: 'json', rich_text: partes } },
  );
}

// O texto do site já não é preciso e só incharia o histórico de execuções.
const { site_texto, _segunda_leitura, ...resto } = l;

return {
  json: {
    ...resto,
    resumo_final: resumo,
    _descartar: descartar,
    _gravar: !!cfg.gravar_no_notion && !descartar,
    notion_body: { parent: { database_id: DB }, properties: props, ...(children.length ? { children } : {}) },
  },
};
