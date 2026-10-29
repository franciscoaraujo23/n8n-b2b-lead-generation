/* Config ativa — ponto único de onde o resto do workflow lê a
   configuração. Parte do "Config base" e escolhe a localidade.

   - Sem perfil (há `location` e não há `localidades`): fica como está.
   - Localidade pedida: tem de ser uma das do perfil. Corre mesmo que
     esteja esgotada (o resumo avisa).
   - Sem localidade pedida: a primeira do perfil que ainda tenha
     trabalho — termos sem grelha, células pendentes ou IDs na fila.
     Todas esgotadas → pára antes de gastar pedidos.

   Este nó corre depois do lock: em vez de lançar um erro, devolve
   { _parar: mensagem }, e o workflow liberta o lock antes de parar.

   O estado vem das Data Tables já lidas (células por crm + nicho, de
   todas as cidades; places por crm). A chave da cidade é a mesma de
   sempre: a localidade em minúsculas. */

const c = { ...$('Config base').first().json };
const linhas = (no) => $(no).all().map((i) => i.json).filter((j) => j && j.id !== undefined);

/* Área mínima da grelha, em km de lado: se o Google devolver só o
   centro da cidade (Matosinhos: 3×3 km), a grelha alarga-se à volta do
   centro. Concelhos maiores têm "area_km" próprio no perfis.json. */
const AREA_MINIMA_KM = 10;

if (!c.localidades || !c.localidades.length) return [{ json: { ...c, area_km: AREA_MINIMA_KM } }];

const semAcentos = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const celulas = linhas('Ler células').filter((x) => x.crm === c.estado_chave && x.nicho === c.nicho);
const fila = linhas('Ler places vistos').filter((p) => p.crm === c.estado_chave && p.nicho === c.nicho && p.estado === 'fila');

const estado = c.localidades.map((loc) => {
  const chave = loc.toLowerCase();
  const daqui = celulas.filter((x) => x.cidade === chave);
  const comGrelha = new Set(daqui.map((x) => x.termo));
  const semGrelha = c.termos.filter((t) => !comGrelha.has(t)).length;
  const pendentes = daqui.filter((x) => x.estado === 'pendente' && c.termos.includes(x.termo)).length;
  const naFila = fila.filter((p) => p.cidade === chave).length;
  return { localidade: loc, termos_sem_grelha: semGrelha, celulas_pendentes: pendentes, na_fila: naFila, tem_trabalho: semGrelha > 0 || pendentes > 0 || naFila > 0 };
});

let escolhida;
if (c.localidade_pedida) {
  escolhida = estado.find((e) => semAcentos(e.localidade) === semAcentos(c.localidade_pedida))
    || estado.find((e) => semAcentos(e.localidade).split(',')[0] === semAcentos(c.localidade_pedida).split(',')[0]);
  if (!escolhida) {
    return [{ json: { _parar: `"${c.localidade_pedida}" não é uma localidade do perfil ${c.perfil}.` } }];
  }
} else {
  escolhida = estado.find((e) => e.tem_trabalho);
  if (!escolhida) {
    return [{ json: { _parar: `Todas as ${c.localidades.length} localidades do perfil ${c.perfil} estão esgotadas. Acrescenta localidades ou termos ao perfis.json.` } }];
  }
}

c.location = escolhida.localidade;
c.cidade_chave = c.location.toLowerCase();
c.area_km = (c.areas_km && c.areas_km[c.location]) || AREA_MINIMA_KM;
c.localidade_auto = !c.localidade_pedida;
c.localidades_por_fazer = estado.filter((e) => e.tem_trabalho).length;

return [{ json: c }];
