// @comum
/* Juntar detalhes — corre por ID, a seguir a "Google - Detalhes".

   Junta ao resultado o termo que encontrou o ID. Se o pedido de
   detalhes falhar, o ID fica marcado e NÃO sai da fila: tenta-se na
   próxima execução. */

const f = $('Escolher da fila').item.json;

if ($json.error || !$json.id) {
  return { json: { _falhou_detalhe: true, place_id: f.place_id, termo: f.termo, erro: mensagemErro($json.error || 'sem dados') } };
}
return { json: { ...$json, _termo: f.termo } };
