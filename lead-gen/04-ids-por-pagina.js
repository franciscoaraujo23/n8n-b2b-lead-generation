// @comum
/* IDs por página — corre por página devolvida pelo Google.

   Com paginação, o HTTP Request devolve uma página por item, todas
   ligadas à célula que as pediu; a célula vem de $('Plano').item. */

const c = $('Plano').item.json;

return {
  json: {
    chave: c.chave,
    ids: ($json.places || []).map((p) => p.id).filter(Boolean),
    erro: $json.error ? mensagemErro($json.error) : '',
  },
};
