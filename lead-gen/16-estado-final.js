// @comum
/* Estado final dos places — corre no fim, depois do resumo.

   Atualiza a Data Table leadgen_places para cada ID tratado nesta
   execução, para que nunca mais volte à fila:
   - criado no Notion          → processado
   - já no CRM                 → processado
   - fora do nicho / fechado   → descartado (com o motivo)
   - modo ensaio               → processado (no espaço de ensaio)
   NÃO mexe nos que falharam (Notion ou detalhes): ficam na fila e
   entram na próxima execução. */

const cfg = $('Config ativa').first().json;
const agora = new Date().toISOString();
const itens = $('Fim').all().map((i) => i.json);
const stats = (itens.find((i) => i._stats) || {})._stats || {};

const linhas = [];
for (const i of itens) {
  if (!i.place_id) continue;
  if (i._resultado === 'criado') linhas.push(linhaPlace(cfg, i.place_id, i.termo, 'processado', 'criado no Notion', i.nome, agora));
  else if (i._descartar) linhas.push(linhaPlace(cfg, i.place_id, i.termo, 'descartado', 'fora do nicho', i.nome, agora));
  else if (!i._resultado && !cfg.gravar_no_notion) linhas.push(linhaPlace(cfg, i.place_id, i.termo, 'processado', 'ensaio', i.nome, agora));
}
for (const d of stats.descartados_ids || []) {
  linhas.push(linhaPlace(cfg, d.place_id, d.termo, d.estado, d.motivo, d.nome, agora));
}

return linhas.map((json) => ({ json }));
