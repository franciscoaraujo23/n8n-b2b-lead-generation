/* Config base — valida e normaliza a configuração que vem do perfil
   (nó "Perfil escolhido"). Um erro aqui pára logo, antes de gastar
   pedidos. A localidade é escolhida a seguir, em "Config ativa", que é
   o ponto único de onde o resto do workflow lê a configuração. */

const c = { ...$input.first().json };
const erro = (m) => { throw new Error('Config: ' + m); };

c.notion_db = String(c.notion_db || '').replace(/-/g, '').trim();
if (!/^[0-9a-f]{32}$/i.test(c.notion_db)) erro('notion_db tem de ser o ID (32 caracteres) da base de dados do Notion.');

c.nicho = String(c.nicho || '').trim();
if (!c.nicho) erro('falta o nicho (ex.: Clínica de estética).');
c.location = String(c.location || '').trim();
/* Com perfil, a localidade sai da lista do perfil (rotação). */
/* Cada localidade vem como nome ou { nome, area_km }. Daqui em diante
   "localidades" são só os nomes; as áreas próprias ficam em "areas_km". */
c.areas_km = {};
c.localidades = (Array.isArray(c.localidades) ? c.localidades : []).map((l) => {
  const nome = String(l && typeof l === 'object' ? l.nome : l || '').trim();
  if (nome && l && typeof l === 'object' && Number(l.area_km) > 0) c.areas_km[nome] = Number(l.area_km);
  return nome;
}).filter(Boolean);
if (!c.location && !c.localidades.length) erro('falta a localidade (ex.: Guimarães, Portugal).');

/* A localidade pedida tem de ser do perfil. Valida-se aqui, antes do
   lock: um erro de escrita não pode deixar o lock preso. Fica com o
   nome como está no perfil ("gondomar" → "Gondomar, Portugal"). */
c.localidade_pedida = String(c.localidade_pedida || '').trim();
if (c.localidade_pedida && c.localidades.length) {
  // "paredes" tamb\u00e9m encontra "Munic\u00edpio de Paredes, Portugal".
  const chave = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/^municipio d[aeo]s? /, '');
  const pedida = chave(c.localidade_pedida);
  const certa = c.localidades.find((l) => chave(l) === pedida) || c.localidades.find((l) => chave(l).split(',')[0] === pedida.split(',')[0]);
  if (!certa) erro(`"${c.localidade_pedida}" não é uma localidade do perfil ${c.perfil}. Acrescenta-a ao perfis.json ou escolhe uma destas — ${c.localidades.join('; ')}.`);
  c.localidade_pedida = certa;
}

/* Termos separados por ";" ou por linhas. Sem termos, pesquisa-se o nicho. */
c.termos = [...new Set(String(c.termos || c.nicho).split(/[;\n]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

/* Sub-nichos fixos: sem lista, a Claude inventa um nome por lead e a
   coluna deixa de servir para filtrar. "Outro" existe sempre. */
c.sub_nichos = [...new Set(String(c.sub_nichos || '').split(/[;\n]+/).map((t) => t.trim().replace(/,/g, ' ')).filter(Boolean))];
if (c.sub_nichos.length && !c.sub_nichos.includes('Outro')) c.sub_nichos.push('Outro');

/* Critérios do Score IA, por nicho. Vazio = critérios de clínicas
   (os de origem). Texto livre: entra tal e qual no pedido à Claude. */
c.criterios_score = String(c.criterios_score || '').trim();
if (c.criterios_score.length > 1500) erro('criterios_score tem mais de 1500 caracteres; encurta.');

/* Categorias do Google Maps que nunca são do nicho (ex.: car_repair,
   lodging). Descartadas logo a seguir aos detalhes, antes de ler sites
   ou chamar a Claude. Vazio = não filtra por categoria. */
c.tipos_excluir = [...new Set(String(c.tipos_excluir || '').split(/[;,\n]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

/* Leads sem site: sem isto entram sem qualquer filtro de nicho. Com
   isto, a Claude decide só pelo nome, morada e categoria (pedido curto). */
c.verificar_sem_site = c.verificar_sem_site !== false;

const num = (v, def, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && String(v).trim() !== '' ? Math.min(max, Math.max(min, n)) : def;
};
c.leads_novos_desejados = num(c.leads_novos_desejados, 20, 1, 100);
// Teto de pedidos de pesquisa ao Google por execução (cada célula gasta até 3).
c.max_pedidos_google = num(c.max_pedidos_google, 60, 3, 300);
c.grelha = num(c.grelha, 2, 1, 5);

c.gravar_no_notion = c.gravar_no_notion === true;
c.enrich = c.enrich !== false;
c.descartar_fora_do_nicho = c.descartar_fora_do_nicho !== false;

/* O estado (células, fila, já vistos) é guardado por CRM. Em modo ensaio
   usa um espaço à parte: simular não pode gastar a fila verdadeira. */
c.estado_chave = (c.gravar_no_notion ? '' : 'ensaio:') + c.notion_db;
c.cidade_chave = c.location.toLowerCase();
/* Um bloqueio por CRM: duas execuções sobre o mesmo CRM e o mesmo
   estado nunca correm ao mesmo tempo. */
c.lock_chave = 'leadgen:' + c.notion_db;

return [{ json: c }];
