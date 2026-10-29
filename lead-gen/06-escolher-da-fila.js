// @comum
/* Escolher da fila — os N mais antigos da fila (N = leads_novos_desejados)
   seguem para detalhes e análise. O resto fica para a próxima execução,
   sem gastar mais nenhuma pesquisa. */

const cfg = $('Config ativa').first().json;
const idx = $('Índice do CRM').first().json;
const fecho = $('Fechar pesquisa').first().json;

const fila = [...idx.fila, ...fecho.fila.map((f) => ({ place_id: f.place_id, termo: f.termo }))];
const escolhidos = fila.slice(0, cfg.leads_novos_desejados);

const pesquisa = {
  ...fecho.plano,
  ...fecho.stats,
  fila_total: fila.length,
  fila_restante: fila.length - escolhidos.length,
};

if (!escolhidos.length) return [{ json: { _sem_novos: true, _pesquisa: pesquisa } }];
return escolhidos.map((f) => ({ json: { place_id: f.place_id, termo: f.termo, _sem_novos: false, _pesquisa: pesquisa } }));
