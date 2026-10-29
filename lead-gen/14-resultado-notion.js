// @comum
/* Resultado Notion — corre por lead, a seguir a "Notion - Criar Lead".

   O nó do Notion NÃO repete sozinho: repetir reenviava o lote todo e
   foi assim que o mesmo lead ficou três vezes no CRM. Um lead que falhe
   aparece no resumo; voltar a correr a mesma pesquisa é a repetição
   segura, porque o filtro de duplicados deixa passar só o que falhou. */

const l = $('Preparar para Notion').item.json;
const ok = !$json.error && $json.object === 'page';

return {
  json: {
    _resultado: ok ? 'criado' : 'falhou',
    place_id: l.place_id,
    termo: l.termo,
    nome: l.nome,
    score: l.score ?? null,
    filial_de: l.filial_de,
    por_reanalisar: l.por_reanalisar || '',
    notion_url: ok ? $json.url : '',
    erro: ok ? '' : mensagemErro($json.error || $json),
    _stats: l._stats,
    // Para o resumo: contas dos factos e custo da Claude.
    _factos: l._factos,
    _uso: l._uso,
    _modelo: l._modelo,
  },
};
