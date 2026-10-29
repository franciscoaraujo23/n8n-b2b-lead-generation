// @comum
/* Plano — decide que células pesquisar nesta execução.

   - Se a fila já tem leads suficientes, não pesquisa nada.
   - Senão, escolhe as células pendentes (primeiro as maiores, e pela
     ordem dos termos na Config), até ao teto de pedidos ao Google.
     Cada célula gasta no máximo 3 pedidos (3 páginas de 20).

   Nunca repete uma pesquisa já feita: uma célula feita não volta a
   ser pendente. É isso que impede o "correr outra vez e vir o mesmo". */

const cfg = $('Config ativa').first().json;
const idx = $('Índice do CRM').first().json;

let novas = [];
try {
  novas = $('Criar grelha').all().map((i) => i.json);
} catch (e) {
  // A grelha já existia: o nó não correu nesta execução.
}

const celulas = [...idx.celulas, ...novas];
const ordemTermo = (t) => { const i = cfg.termos.indexOf(t); return i === -1 ? 999 : i; };
const pendentes = celulas
  .filter((c) => c.estado === 'pendente' && cfg.termos.includes(c.termo))
  .sort((a, b) => a.nivel - b.nivel || ordemTermo(a.termo) - ordemTermo(b.termo) || a.chave.localeCompare(b.chave));

const precisa = idx.fila.length < cfg.leads_novos_desejados;
const maxCelulas = Math.max(1, Math.floor(cfg.max_pedidos_google / 3));
const escolhidas = precisa ? pendentes.slice(0, maxCelulas) : [];

const plano = {
  celulas_total: celulas.length,
  celulas_criadas_agora: novas.length,
  pendentes_antes: pendentes.length,
  escolhidas: escolhidas.length,
  fila_antes: idx.fila.length,
};

if (!escolhidas.length) return [{ json: { _sem_pesquisa: true, _plano: plano } }];

return escolhidas.map((c) => ({
  json: {
    ...c,
    _sem_pesquisa: false,
    _plano: plano,
    _pedido: {
      textQuery: c.termo,
      languageCode: 'pt',
      regionCode: 'PT',
      pageSize: 20,
      locationRestriction: { rectangle: { low: { latitude: c.sul, longitude: c.oeste }, high: { latitude: c.norte, longitude: c.este } } },
    },
  },
}));
