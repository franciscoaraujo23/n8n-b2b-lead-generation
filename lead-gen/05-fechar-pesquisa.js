// @comum
/* Fechar pesquisa — corre uma vez, depois das pesquisas (ou sem elas).

   Para cada célula pesquisada:
   - os IDs nunca vistos (nem no CRM, nem na Data Table, nem já nesta
     execução) vão para a fila;
   - a célula fica "feita"; se veio cheia, fica "saturada" e dá lugar
     a 4 células mais pequenas, pendentes para as próximas execuções;
   - se o Google deu erro e nada mais, a célula fica pendente (tenta-se
     outra vez da próxima).

   Devolve um único item com as linhas a gravar nas duas Data Tables. */

/* Uma célula com 40+ resultados conta como cheia. O máximo do Google é
   60, mas no ensaio a cidade de Guimarães inteira deu 45: o Google corta
   por relevância antes dos 60, e é esse corte que a subdivisão contorna. */
const CHEIA = 40;
const NIVEL_MAX = 3;

const cfg = $('Config ativa').first().json;
const idx = $('Índice do CRM').first().json;
const agora = new Date().toISOString();

const plano = $('Plano').all().map((i) => i.json);
const info = (plano[0] && plano[0]._plano) || {};
const celulasPlano = plano.filter((c) => c.chave);

const porCelula = {};
let pedidos = 0;
for (const p of $input.all().map((i) => i.json).filter((j) => j.chave)) {
  const r = (porCelula[p.chave] = porCelula[p.chave] || { ids: [], erros: [] });
  pedidos++;
  r.ids.push(...p.ids);
  if (p.erro) r.erros.push(p.erro);
}

const vistosAgora = new Set();
const celulas = [];
const fila = [];
const stats = { pedidos, ids_encontrados: 0, ja_conhecidos: 0, novos_para_a_fila: 0, celulas_pesquisadas: 0, celulas_com_erro: [], celulas_subdivididas: 0 };

for (const c of celulasPlano) {
  const r = porCelula[c.chave] || { ids: [], erros: ['sem resposta do Google'] };
  if (r.erros.length && !r.ids.length) {
    stats.celulas_com_erro.push(`${c.termo} ${c.chave.split('|').pop()}: ${r.erros[0]}`);
    continue;
  }
  stats.celulas_pesquisadas++;
  stats.ids_encontrados += r.ids.length;

  let novos = 0;
  for (const id of r.ids) {
    if (idx.vistos[id] !== undefined || idx.placeIds[id] !== undefined || vistosAgora.has(id)) {
      stats.ja_conhecidos++;
      continue;
    }
    vistosAgora.add(id);
    novos++;
    fila.push(linhaPlace(cfg, id, c.termo, 'fila', '', '', agora));
  }

  const cheia = r.ids.length >= CHEIA && c.nivel < NIVEL_MAX;
  celulas.push({ ...soColunas(c, COLUNAS_CELULA), estado: cheia ? 'saturada' : 'feita', resultados: r.ids.length, novos, atualizada: agora });
  if (cheia) {
    stats.celulas_subdivididas++;
    const caminho = c.chave.split('|').pop();
    for (const [k, ret] of quadrantes(c)) celulas.push(novaCelula(cfg, c.termo, `${caminho}.${k}`, c.nivel + 1, ret, agora));
  }
}
stats.novos_para_a_fila = fila.length;

const fechadas = celulas.filter((c) => c.estado !== 'pendente').length;
const criadas = celulas.length - fechadas;
stats.celulas_pendentes_depois = (info.pendentes_antes || 0) - fechadas + criadas;

return [{ json: { celulas, fila, stats, plano: info } }];
