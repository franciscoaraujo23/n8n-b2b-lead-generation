/* =================================================================
   Banco de ensaio dos nós Code do "Lead Gen" (v3)
   -----------------------------------------------------------------
   Corre o JS de lead-gen/*.js fora do n8n, com casos tirados do que
   correu mal no CRM (o mesmo lead ×3, email de 126 caracteres, respostas
   cortadas, "sites" que são Facebook, filiais com o mesmo domínio).

   Não substitui uma execução real — credenciais, paginação do Notion
   e respostas verdadeiras da Google só se provam no n8n.

   Correr:  node testar-lead-gen.js
   ================================================================= */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'lead-gen');
const COMUM = fs.readFileSync(path.join(DIR, '00-comum.js'), 'utf8');
const PERFIS = JSON.parse(fs.readFileSync(path.join(DIR, 'perfis.json'), 'utf8'));
const { validarPerfis } = require('./validar-perfis');

// Como no build: os marcadores "/*@nome*/" recebem os perfis e o CRM de TESTES.
const EMBUTIR = { perfis: JSON.stringify(PERFIS), notion_db: JSON.stringify('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') };

function fonte(ficheiro) {
  let src = fs.readFileSync(path.join(DIR, ficheiro), 'utf8')
    .replace(/\/\*@(\w+)\*\/ (\{\}|'')/g, (m, nome) => (nome in EMBUTIR ? EMBUTIR[nome] : m));
  if (src.startsWith('// @comum')) src = COMUM + '\n' + src.replace(/^\/\/ @comum\r?\n/, '');
  return src;
}

/* Recria o ambiente de um nó Code: $input, $json e $('Nó').
   `nos` = { 'Nome do nó': { item, first, all } } com objetos json. */
function correr(ficheiro, { input = [], json = {}, nos = {} } = {}) {
  const $ = (nome) => {
    const n = nos[nome];
    if (!n) throw new Error(`Nó "${nome}" não simulado no teste`);
    return {
      item: { json: n.item },
      first: () => ({ json: n.first !== undefined ? n.first : n.item }),
      all: () => (n.all || []).map((j) => ({ json: j })),
    };
  };
  const $input = { all: () => input.map((j) => ({ json: j })), first: () => ({ json: input[0] }), item: { json } };
  const r = new Function('$input', '$json', '$', fonte(ficheiro))($input, json, $);
  return Array.isArray(r) ? r.map((i) => i.json) : r.json;
}

/* As funções do comum, para testar diretamente. */
const comum = new Function(COMUM + '\nreturn { hostDe, ehPlataforma, limparUrl, chaveTelefone, normalizarTelefone, emailValido, extrairEmail, extrairTelefone, paginaContactos, markdownParaTexto, mensagemErro, decodificarEntidades, htmlParaTexto, detetarEntidade, nifColetivoValido };')();

let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) console.log(`  ok    ${nome}`);
  else { falhas++; console.log(`  FALHA ${nome} ${extra}`); }
};
const ver = (v) => JSON.stringify(v);

/* ---------------------------------------------------------------- */
console.log('\n0. Funções comuns');

ok('hostDe tira protocolo, www e caminho', comum.hostDe('https://www.LaserExemplo.pt/boavista?x=1') === 'laserexemplo.pt');
ok('limparUrl tira utm_* (caso Google Business)', comum.limparUrl('https://clinicabeta.pt/?utm_campaign=n24&utm_source=gmb') === 'https://clinicabeta.pt/');
ok('limparUrl mantém parâmetros reais', comum.limparUrl('https://www.dominioexemplo.pt/?i=1&utm_medium=x') === 'https://www.dominioexemplo.pt/?i=1');
ok('Facebook é plataforma', comum.ehPlataforma(comum.hostDe('http://www.facebook.com/paginaexemplo')));
ok('Fresha (subdomínio) é plataforma', comum.ehPlataforma('pt.fresha.com'));
ok('site normal não é plataforma', !comum.ehPlataforma('clinicaexemplo.com'));
ok('chave de telefone ignora formato', ['22 123 4567', '+351 22 123 4567', '+351221234567', '00351221234567'].every((t) => comum.chaveTelefone(t) === '221234567'));
ok('telefone normalizado +351…', comum.normalizarTelefone('919 000 111') === '+351919000111');
ok('email de 126 caracteres é recusado (caso Notion 400)', !comum.emailValido('a'.repeat(115) + '@clinica.pt'));
ok('email-imagem é recusado', !comum.emailValido('logo@2x.png'));
ok('email do Wix/Sentry é recusado', !comum.emailValido('abc123@sentry.wixpress.com'));
ok('email normal é aceite', comum.emailValido('geral@alfa.com.pt'));
ok('extrairEmail prefere o domínio do site',
  comum.extrairEmail('<a href="mailto:joana.x@gmail.com">x</a> <a href="mailto:Geral@Clinica.pt">y</a>', '', 'clinica.pt') === 'geral@clinica.pt');
ok('extrairTelefone lê link tel:', comum.extrairTelefone('<a href="tel:+351 253 000 096">', '') === '+351253000096');
ok('paginaContactos resolve link relativo',
  comum.paginaContactos('<a href="/contactos">Contactos</a>', 'https://www.clinica.pt/') === 'https://www.clinica.pt/contactos');
ok('erro HTTP fica curto (sem o HTML da página)',
  comum.mensagemErro({ message: '403 - "<html><head><title>Error 403 Forbidden</title></head><body>…</body></html>"' }) === '403 Error 403 Forbidden');
ok('erro do Notion fica com a mensagem útil',
  /should be ≤ `100`/.test(comum.mensagemErro({ message: '400 - "{\\"object\\":\\"error\\",\\"message\\":\\"body failed validation: body.properties.Email.email.length should be ≤ `100`, instead was `126`.\\"}"' })));
ok('alojamento local (Holidu, subdomínio Bluepillow) é plataforma', comum.ehPlataforma('holidu.com') && comum.ehPlataforma('br.bluepillow.com'));
ok('diretório de empresas (Racius) e heylink são plataforma', comum.ehPlataforma('racius.com') && comum.ehPlataforma('heylink.me'));
ok('paginaContactos ignora outros domínios',
  comum.paginaContactos('<a href="https://outro.pt/contact">x</a>', 'https://clinica.pt') === '');

/* ---------------------------------------------------------------- */
console.log('\n1. Config base');

const CFG = correr('config-base.js', { input: [{
  nicho: 'Clínica de estética', termos: 'Clínica de estética; depilação laser\nclínica de estética;  ', location: 'Guimarães, Portugal',
  leads_novos_desejados: '5', max_pedidos_google: 12, grelha: 2, responsavel: 'Bruno', enrich: true, descartar_fora_do_nicho: true,
  gravar_no_notion: true, customer_id: 'x', notion_db: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', sub_nichos: 'Medicina estética; Depilação laser',
}] })[0];
ok('sub-nichos da Config + Outro', ver(CFG.sub_nichos) === ver(['Medicina estética', 'Depilação laser', 'Outro']));
ok('termos separados por ; e linhas, sem repetidos, em minúsculas', ver(CFG.termos) === ver(['clínica de estética', 'depilação laser']), ver(CFG.termos));
ok('números vindos como texto são aceites', CFG.leads_novos_desejados === 5);
ok('ID do Notion com hífens é normalizado', CFG.notion_db === 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
ok('estado guardado por CRM', CFG.estado_chave === CFG.notion_db && CFG.cidade_chave === 'guimarães, portugal');
const CFG_ENSAIO = correr('config-base.js', { input: [{ nicho: 'X', location: 'Y', notion_db: CFG.notion_db, gravar_no_notion: false }] })[0];
ok('modo ensaio usa um espaço de estado à parte', CFG_ENSAIO.estado_chave === 'ensaio:' + CFG.notion_db);
let recusou = false;
try { correr('config-base.js', { input: [{ nicho: 'X', location: 'Y', notion_db: 'abc' }] }); } catch (e) { recusou = /notion_db/.test(e.message); }
ok('ID do Notion inválido pára logo', recusou);
ok('sem criterios_score → vazio (usa os de clínicas)', CFG.criterios_score === '');
recusou = false;
try { correr('config-base.js', { input: [{ nicho: 'X', location: 'Y', notion_db: CFG.notion_db, criterios_score: 'x'.repeat(1501) }] }); } catch (e) { recusou = /criterios_score/.test(e.message); }
ok('criterios_score demasiado longo pára logo', recusou);
ok('sem tipos_excluir → não filtra; verificar_sem_site ligado por omissão', ver(CFG.tipos_excluir) === '[]' && CFG.verificar_sem_site === true);
const CFG_CLIMA = correr('config-base.js', { input: [{ nicho: 'Climatização', location: 'Porto, Portugal', notion_db: CFG.notion_db, tipos_excluir: 'car_repair; Lodging,\nprivate_guest_room; car_repair', verificar_sem_site: false }] })[0];
ok('tipos_excluir separados por ; , e linhas, em minúsculas, sem repetidos', ver(CFG_CLIMA.tipos_excluir) === ver(['car_repair', 'lodging', 'private_guest_room']), ver(CFG_CLIMA.tipos_excluir));
ok('verificar_sem_site pode ser desligado', CFG_CLIMA.verificar_sem_site === false);

/* ---------------------------------------------------------------- */
console.log('\n1b. Perfis, localidade e lock');

ok('perfis.json atual é válido', validarPerfis(PERFIS).length === 0, ver(validarPerfis(PERFIS)));
const perfilMin = (nicho, localidades, extra = {}) => ({ responsavel: 'Ana', nicho, termos: ['t'], localidades, ...extra });
let erros = validarPerfis({ a: perfilMin('Clima', ['Porto, Portugal', 'Maia, Portugal']), b: perfilMin('Clima', ['maia, portugal']) });
ok('mesmo nicho com localidade em comum é recusado', erros.length === 1 && /mesmo nicho/.test(erros[0]), ver(erros));
erros = validarPerfis({ a: perfilMin('Clima', ['Baião, Portugal']), b: perfilMin('Clima', ['Baiao, Portugal']) });
ok('a comparação ignora acentos (Baião = Baiao)', erros.length === 1);
ok('nichos diferentes podem partilhar localidades', validarPerfis({ a: perfilMin('Clima', ['Porto, Portugal']), b: perfilMin('Remodelações', ['Porto, Portugal']) }).length === 0);
ok('responsável desconhecido é recusado', validarPerfis({ a: perfilMin('Clima', ['Porto'], { responsavel: 'Joana' }) }).some((e) => /responsavel/.test(e)));
ok('localidade repetida no mesmo perfil é recusada', validarPerfis({ a: perfilMin('Clima', ['Porto', 'porto']) }).some((e) => /duas vezes/.test(e)));
ok('nome de perfil com espaços é recusado', validarPerfis({ 'Ana Clima': perfilMin('Clima', ['Porto']) }).length === 1);

const manual = (extra = {}) => correr('perfil.js', { input: [{ perfil: 'ana-climatizacao', localidade: '', leads_novos_desejados: '', gravar_no_notion: true, ...extra }] })[0];
const P = manual();
ok('perfil escolhido traz o responsável e o nicho do perfil', P.responsavel === 'Ana' && P.nicho === 'Climatização e bombas de calor');
ok('perfil escolhido traz o CRM embutido pelo build', P.notion_db === 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
ok('leads vazio = o do perfil; com valor = o pedido', P.leads_novos_desejados === 20 && manual({ leads_novos_desejados: '7' }).leads_novos_desejados === '7');
let msg = '';
try { manual({ perfil: 'ana-estetica' }); } catch (e) { msg = e.message; }
ok('perfil inexistente pára e lista os que existem', /não existe/.test(msg) && /bruno-estetica/.test(msg), msg);
const F = correr('perfil.js', { input: [{ Perfil: 'outreach-remodelacoes', Localidade: 'Automática', 'Leads novos': '', Modo: 'Ensaio (não grava)', submittedAt: 'x' }] })[0];
ok('formulário: perfil, localidade automática e modo ensaio', F.responsavel === 'Outreach' && F.localidade_pedida === '' && F.gravar_no_notion === false && F.leads_novos_desejados === 10);
const F2 = correr('perfil.js', { input: [{ Perfil: 'bruno-estetica', Localidade: 'Maia, Portugal', 'Leads novos': 5, Modo: 'Gravar no CRM' }] })[0];
ok('formulário: localidade escolhida e gravar', F2.localidade_pedida === 'Maia, Portugal' && F2.gravar_no_notion === true && F2.leads_novos_desejados === 5);
const AG = correr('perfil.js', { input: [{ perfil: 'outreach-remodelacoes', localidade: '', leads_novos_desejados: 10, gravar_no_notion: true }] })[0];
ok('agendamento: outreach, 10 leads, rotação, a gravar', AG.responsavel === 'Outreach' && AG.leads_novos_desejados === 10 && AG.localidade_pedida === '' && AG.gravar_no_notion === true);
const W = correr('perfil.js', { input: [{ body: { perfil: 'bruno-estetica' } }] })[0];
ok('webhook de ensaio: por omissão não grava', W.gravar_no_notion === false && W.responsavel === 'Bruno');

/* O perfil do Ana dá a mesma configuração que o Config tinha (13/10). */
const BASE_ANA = correr('config-base.js', { input: [P] })[0];
ok('perfil do Ana: 9 termos, 5 sub-nichos + Outro, 22 categorias excluídas',
  BASE_ANA.termos.length === 9 && BASE_ANA.termos.includes('avac') && BASE_ANA.sub_nichos.length === 6 && BASE_ANA.tipos_excluir.length === 22, ver([BASE_ANA.termos.length, BASE_ANA.sub_nichos.length, BASE_ANA.tipos_excluir.length]));
ok('perfil do Ana: critérios, limites e gravação como no Config', /contratos de manutenção/.test(BASE_ANA.criterios_score)
  && BASE_ANA.leads_novos_desejados === 20 && BASE_ANA.max_pedidos_google === 60 && BASE_ANA.grelha === 2
  && BASE_ANA.gravar_no_notion === true && BASE_ANA.verificar_sem_site === true && BASE_ANA.enrich === true && BASE_ANA.descartar_fora_do_nicho === true);
ok('sem localidade, Config base aceita (escolhe a seguir) e define o lock por CRM', BASE_ANA.location === '' && BASE_ANA.lock_chave === 'leadgen:' + BASE_ANA.notion_db);

/* Config ativa: rotação de localidades. */
const crm = BASE_ANA.estado_chave;
const nicho = BASE_ANA.nicho;
const celulasDe = (cidade, estado, termos = BASE_ANA.termos) => termos.map((termo, i) => ({ id: cidade + i, crm, nicho, cidade, termo, estado }));
const ativa = (celulas, places = [], base = BASE_ANA) => correr('config-ativa.js', { nos: {
  'Config base': { first: base }, 'Ler células': { all: celulas }, 'Ler places vistos': { all: places },
} })[0];
let A = ativa([...celulasDe('porto, portugal', 'esgotada'), ...celulasDe('vila nova de gaia, portugal', 'pendente')]);
ok('salta a localidade esgotada e passa à seguinte com células pendentes', A.location === 'Vila Nova de Gaia, Portugal' && A.cidade_chave === 'vila nova de gaia, portugal' && A.localidade_auto === true, A.location);
A = ativa([...celulasDe('porto, portugal', 'esgotada'), ...celulasDe('vila nova de gaia, portugal', 'esgotada')]);
ok('localidade ainda sem grelha conta como por fazer', A.location === 'Matosinhos, Portugal', A.location);
A = ativa([...celulasDe('porto, portugal', 'esgotada')], [{ id: 1, crm, nicho, cidade: 'porto, portugal', estado: 'fila', place_id: 'x' }]);
ok('localidade com células esgotadas mas IDs na fila continua', A.location === 'Porto, Portugal');
A = ativa([...celulasDe('porto, portugal', 'esgotada', BASE_ANA.termos.slice(1))]);
ok('termo novo no perfil (sem grelha) volta a abrir a localidade', A.location === 'Porto, Portugal');
A = ativa([...celulasDe('porto, portugal', 'pendente').map((c) => ({ ...c, nicho: 'Clínica de estética' }))]
  .concat(celulasDe('porto, portugal', 'esgotada')), [{ id: 2, crm: 'ensaio:' + crm, nicho, cidade: 'porto, portugal', estado: 'fila' }]);
ok('células de outro nicho e fila de outro CRM não contam', A.location === 'Vila Nova de Gaia, Portugal', A.location);
const todasEsgotadas = BASE_ANA.localidades.flatMap((l) => celulasDe(l.toLowerCase(), 'esgotada'));
msg = '';
msg = ativa(todasEsgotadas)._parar || '';
ok('todas as localidades esgotadas → _parar (o workflow liberta o lock e pára)', /esgotadas/.test(msg), msg);
A = ativa(todasEsgotadas, [], { ...BASE_ANA, localidade_pedida: 'gondomar' });
ok('localidade pedida sem acentos/sufixo é aceite, mesmo esgotada', A.location === 'Gondomar, Portugal' && A.localidade_auto === false);
A = ativa([], [], { ...BASE_ANA, localidade_pedida: 'Povoa de Varzim, Portugal' });
ok('localidade pedida sem acento no nome completo', A.location === 'Póvoa de Varzim, Portugal');
msg = '';
try { correr('config-base.js', { input: [{ ...P, localidade_pedida: 'Braga, Portugal' }] }); } catch (e) { msg = e.message; }
ok('localidade fora do perfil é recusada no Config base, antes do lock', /não é uma localidade do perfil/.test(msg), msg);
const baseGondomar = correr('config-base.js', { input: [{ ...P, localidade_pedida: 'gondomar' }] })[0];
ok('Config base devolve a localidade pedida com o nome do perfil', baseGondomar.localidade_pedida === 'Gondomar, Portugal');
ok('"paredes" encontra "Município de Paredes, Portugal"', correr('config-base.js', { input: [{ ...P, localidade_pedida: 'paredes' }] })[0].localidade_pedida === 'Município de Paredes, Portugal');
ok('Config ativa defensiva: localidade fora do perfil → _parar, sem erro', /não é uma localidade/.test(ativa([], [], { ...BASE_ANA, localidade_pedida: 'Braga, Portugal' })._parar || ''));
A = ativa([], [], { ...CFG });
ok('sem perfil (só location) fica como estava', A.location === CFG.location && A.cidade_chave === CFG.cidade_chave);

/* Área mínima da grelha e área própria por localidade. */
ok('localidade com área própria ({ nome, area_km }) é aceite', validarPerfis({ a: perfilMin('Clima', ['Porto, Portugal', { nome: 'Amarante, Portugal', area_km: 17 }]) }).length === 0);
ok('area_km fora de 1–100 é recusada', validarPerfis({ a: perfilMin('Clima', [{ nome: 'Amarante, Portugal', area_km: 0 }]) }).some((e) => /area_km/.test(e))
  && validarPerfis({ a: perfilMin('Clima', [{ nome: 'Amarante, Portugal', area_km: 500 }]) }).some((e) => /area_km/.test(e)));
ok('mesmo nicho: nome e objeto com o mesmo nome contam como a mesma localidade', validarPerfis({ a: perfilMin('Clima', ['Amarante, Portugal']), b: perfilMin('Clima', [{ nome: 'Amarante, Portugal', area_km: 17 }]) }).some((e) => /mesmo nicho/.test(e)));
const BASE_AREAS = correr('config-base.js', { input: [{ ...P, localidades: ['Porto, Portugal', { nome: 'Amarante, Portugal', area_km: 17 }] }] })[0];
ok('Config base: localidades só com nomes, áreas à parte', ver(BASE_AREAS.localidades) === ver(['Porto, Portugal', 'Amarante, Portugal']) && BASE_AREAS.areas_km['Amarante, Portugal'] === 17);
ok('Config ativa: área própria da localidade escolhida', ativa([], [], { ...BASE_AREAS, localidade_pedida: 'Amarante, Portugal' }).area_km === 17);
ok('Config ativa: 10 km por omissão', ativa([], [], BASE_AREAS).area_km === 10 && ativa([], [], { ...CFG }).area_km === 10);
const perfisReais = correr('config-base.js', { input: [manual()] })[0];
ok('perfis.json: Amarante 17, Marco 15, Santo Tirso 12', perfisReais.areas_km['Amarante, Portugal'] === 17 && perfisReais.areas_km['Marco de Canaveses, Portugal'] === 15 && perfisReais.areas_km['Santo Tirso, Portugal'] === 12);
const KM_LAT = 111.32;
const kmLado = (c, lat) => [(c.norte - c.sul) * KM_LAT, (c.este - c.oeste) * KM_LAT * Math.cos((lat * Math.PI) / 180)];
const grelhaDe = (viewport, area_km) => correr('02-criar-grelha.js', { input: [{ places: [{ viewport }] }], nos: { 'Config ativa': { first: { ...CFG, area_km, grelha: 2 } }, 'Índice do CRM': { first: { termos_sem_celulas: ['t'] } } } });
const limites = (cel) => ({ sul: Math.min(...cel.map((c) => c.sul)), norte: Math.max(...cel.map((c) => c.norte)), oeste: Math.min(...cel.map((c) => c.oeste)), este: Math.max(...cel.map((c) => c.este)) });
// Matosinhos como o Google o devolve: 3×3 km.
const matosinhos = { low: { latitude: 41.168, longitude: -8.705 }, high: { latitude: 41.195, longitude: -8.669 } };
let g = limites(grelhaDe(matosinhos, 10));
let [kmN, kmE] = kmLado(g, 41.18);
ok('retângulo de 3×3 km alarga para 10×10 km à volta do centro', Math.abs(kmN - 10) < 0.2 && Math.abs(kmE - 10) < 0.2
  && Math.abs((g.sul + g.norte) / 2 - 41.1815) < 1e-6 && Math.abs((g.oeste + g.este) / 2 - -8.687) < 1e-6, ver([kmN.toFixed(1), kmE.toFixed(1)]));
// Gondomar como o Google o devolve: 22×17 km — não muda.
const gondomar = { low: { latitude: 41.05, longitude: -8.60 }, high: { latitude: 41.25, longitude: -8.40 } };
g = limites(grelhaDe(gondomar, 10));
ok('retângulo maior do que a área fica igual', g.sul === 41.05 && g.norte === 41.25 && Math.abs(g.oeste - -8.60) < 1e-9 && Math.abs(g.este - -8.40) < 1e-9);
const cel = grelhaDe(matosinhos, 10);
ok('grelha 2×2 sem buracos: as células encostam umas às outras', cel.length === 4 && Math.abs(cel[0].norte - cel[2].sul) < 1e-12 && Math.abs(cel[0].este - cel[1].oeste) < 1e-12);

/* Lock. */
const lock = (linhas) => correr('lock.js', { nos: { 'Config base': { first: BASE_ANA }, 'Ler lock': { all: linhas } } })[0];
const L = lock([{}]);
ok('sem lock: fica com o lock desta execução', L.chave === BASE_ANA.lock_chave && L.execucao === 'teste' && !Number.isNaN(Date.parse(L.desde)));
msg = '';
try { lock([{ id: 1, chave: BASE_ANA.lock_chave, execucao: '901', desde: new Date(Date.now() - 5 * 60000).toISOString() }]); } catch (e) { msg = e.message; }
ok('lock ocupado há 10 min → pára', /Já está a correr/.test(msg) && /901/.test(msg), msg);
ok('lock com mais de 20 min expirou → corre', lock([{ id: 1, chave: BASE_ANA.lock_chave, execucao: '901', desde: new Date(Date.now() - 21 * 60000).toISOString() }]).execucao === 'teste');
ok('mensagem de erro do ramo que liberta o lock', correr('erro-antes-de-gastar.js', { input: [{ _parar: 'Notion em baixo' }] })[0].mensagem === 'Notion em baixo');
ok('lock libertado (execução vazia) → corre', lock([{ id: 1, chave: BASE_ANA.lock_chave, execucao: '', desde: '' }]).execucao === 'teste');
ok('lock de outro CRM não bloqueia', lock([{ id: 1, chave: 'leadgen:outro', execucao: '901', desde: new Date().toISOString() }]).execucao === 'teste');

/* ---------------------------------------------------------------- */
console.log('\n2. Índice do CRM');

const paginaNotion = (linhas) => ({
  object: 'list', has_more: false,
  results: linhas.map(([empresa, pid, site, tel]) => ({
    properties: {
      Empresa: { title: [{ plain_text: empresa }] },
      'Place ID': { rich_text: pid ? [{ plain_text: pid }] : [] },
      Website: { url: site },
      Telefone: { rich_text: tel ? [{ plain_text: tel }] : [] },
    },
  })),
});
const celulaDT = (termo, caminho, estado, extra = {}) => ({ id: 1, createdAt: 'x', updatedAt: 'x', chave: [CFG.estado_chave, CFG.nicho, CFG.cidade_chave, termo, caminho].join('|'), crm: CFG.estado_chave, nicho: CFG.nicho, cidade: CFG.cidade_chave, termo, sul: 41.4, oeste: -8.4, norte: 41.5, este: -8.2, nivel: 0, estado, resultados: 0, novos: 0, atualizada: '', ...extra });
const placeDT = (place_id, estado, desde, extra = {}) => ({ id: 1, place_id, crm: CFG.estado_chave, nicho: CFG.nicho, cidade: CFG.cidade_chave, termo: 'clínica de estética', estado, motivo: '', nome: '', atualizado: desde, ...extra });

const nosIndice = (celulas, places) => ({
  'Config ativa': { first: CFG },
  'Ler células': { all: celulas.length ? celulas : [{}] },
  'Ler places vistos': { all: places.length ? places : [{}] },
});
const indice = correr('01-indice-crm.js', {
  input: [
    paginaNotion([['Alfa', 'ChIJ-alfa', 'https://alfa.com.pt/', '912 345 678'], ['Laser Exemplo | Dragão', 'ChIJ-lp1', 'https://laserexemplo.pt/', '']]),
    paginaNotion([['Escola Exemplo', 'ChIJ-aur', 'https://www.facebook.com/escoladeconducaoexemplo/', '+351 22 000 0000']]),
  ],
  nos: nosIndice(
    [celulaDT('clínica de estética', '0-0', 'feita'), celulaDT('clínica de estética', '0-1', 'pendente')],
    [placeDT('ChIJ-f2', 'fila', '2026-10-10T10:00'), placeDT('ChIJ-f1', 'fila', '2026-10-09T10:00'), placeDT('ChIJ-p', 'processado', '2026-10-01'), placeDT('ChIJ-outra', 'fila', '2026-10-01', { cidade: 'braga, portugal' })],
  ),
})[0];
ok('junta as várias páginas do Notion', indice.total === 3, ver(indice.total));
ok('indexa Place IDs', indice.placeIds['ChIJ-alfa'] === 'Alfa');
ok('indexa domínios', indice.dominios['laserexemplo.pt'] === 'Laser Exemplo | Dragão');
ok('Facebook NÃO entra no índice de domínios', !indice.dominios['facebook.com']);
ok('indexa telefones pela chave', indice.telefones['912345678'] === 'Alfa');
ok('IDs já vistos vêm da Data Table', indice.vistos['ChIJ-p'] === 'processado' && indice.vistos['ChIJ-f1'] === 'fila');
ok('fila só desta localidade, mais antigos primeiro', ver(indice.fila.map((f) => f.place_id)) === ver(['ChIJ-f1', 'ChIJ-f2']));
ok('termo sem células é detetado', ver(indice.termos_sem_celulas) === ver(['depilação laser']));
ok('células vêm sem colunas de sistema', indice.celulas.length === 2 && indice.celulas[0].id === undefined);

const indiceVazio = correr('01-indice-crm.js', { input: [paginaNotion([])], nos: nosIndice([], []) })[0];
ok('Data Tables vazias ({}) não partem nada', indiceVazio.fila.length === 0 && indiceVazio.termos_sem_celulas.length === 2);

const parou = correr('01-indice-crm.js', { input: [{ error: { message: '401 unauthorized' } }], nos: nosIndice([], []) });
ok('se o Notion falhar, PÁRA: só _parar, sem índice vazio a seguir', parou.length === 1 && /paro para não criar duplicados/.test(parou[0]._parar) && parou[0].placeIds === undefined);

/* ---------------------------------------------------------------- */
console.log('\n3. Grelha e plano');

const viewport = { places: [{ viewport: { low: { latitude: 41.4, longitude: -8.4 }, high: { latitude: 41.6, longitude: -8.2 } } }] };
const grelha = correr('02-criar-grelha.js', { input: [viewport], nos: { 'Config ativa': { first: CFG }, 'Índice do CRM': { first: indice } } });
ok('grelha 2×2 só para o termo sem células', grelha.length === 4 && grelha.every((c) => c.termo === 'depilação laser'));
ok('células cobrem a localidade sem buracos', Math.abs(grelha[0].norte - grelha[2].sul) < 1e-9 && Math.abs(grelha[0].este - grelha[1].oeste) < 1e-9);
ok('chave inclui CRM, nicho, cidade, termo e caminho', grelha[3].chave === `${CFG.notion_db}|Clínica de estética|guimarães, portugal|depilação laser|1-1`);
const semLimites = correr('02-criar-grelha.js', { input: [{ places: [] }], nos: { 'Config ativa': { first: CFG }, 'Índice do CRM': { first: indice } } });
ok('localidade que o Google não conhece → _parar com mensagem clara (lock libertado pelo workflow)', semLimites.length === 1 && /não devolveu limites/.test(semLimites[0]._parar));

const nosPlano = (idx) => ({ 'Config ativa': { first: CFG }, 'Índice do CRM': { first: idx }, 'Criar grelha': { all: grelha } });
let plano = correr('03-plano.js', { nos: nosPlano(indice) });
ok('teto de pedidos: 12 pedidos → 4 células', plano.length === 4, ver(plano.length));
ok('primeiro o 1.º termo da Config', plano[0].termo === 'clínica de estética');
ok('pedido ao Google com retângulo', plano[0]._pedido.locationRestriction.rectangle.low.latitude === 41.4 && plano[0]._sem_pesquisa === false);
ok('células feitas não voltam a ser pesquisadas', !plano.some((c) => c.chave.endsWith('clínica de estética|0-0')));

plano = correr('03-plano.js', { nos: nosPlano({ ...indice, fila: Array(5).fill({ place_id: 'x' }) }) });
ok('fila já chega para o objetivo → não pesquisa', plano.length === 1 && plano[0]._sem_pesquisa === true);

const semGrelha = correr('03-plano.js', { nos: { 'Config ativa': { first: CFG }, 'Índice do CRM': { first: indice } } });
ok('sem "Criar grelha" executado, o plano corre na mesma', semGrelha.length === 1 && semGrelha[0].termo === 'clínica de estética');

/* ---------------------------------------------------------------- */
console.log('\n4. Fechar pesquisa e fila');

const planoCelulas = correr('03-plano.js', { nos: nosPlano(indice) });
const [c1, c2, c3, c4] = planoCelulas;
const ids = (prefixo, n) => Array.from({ length: n }, (_, i) => `${prefixo}${i}`);
const paginas = [
  { chave: c1.chave, ids: [...ids('A', 18), 'ChIJ-p', 'ChIJ-alfa'], erro: '' }, // 2 já conhecidos
  { chave: c1.chave, ids: ids('A', 5), erro: '' }, // repetidos da mesma célula
  { chave: c2.chave, ids: ids('B', 20), erro: '' },
  { chave: c2.chave, ids: ids('B2-', 20), erro: '' },
  { chave: c2.chave, ids: ids('B3-', 5), erro: '' }, // 45 → cheia
  { chave: c3.chave, ids: [], erro: '500 Internal' }, // erro → fica pendente
];
const fecho = correr('05-fechar-pesquisa.js', { input: paginas, nos: { 'Config ativa': { first: CFG }, 'Índice do CRM': { first: indice }, Plano: { all: planoCelulas } } })[0];
const est = Object.fromEntries(fecho.celulas.map((c) => [c.chave, c]));
ok('IDs novos vão para a fila (sem já vistos, CRM ou repetidos)', fecho.fila.length === 18 + 45, ver(fecho.fila.length));
ok('fila leva o termo de cada ID', fecho.fila[0].termo === c1.termo && fecho.fila[0].estado === 'fila');
ok('célula com poucos resultados → feita', est[c1.chave].estado === 'feita' && est[c1.chave].resultados === 25);
ok('célula com 45 resultados → saturada + 4 novas pendentes', est[c2.chave].estado === 'saturada' && fecho.celulas.filter((c) => c.chave.startsWith(c2.chave + '.')).length === 4);
ok('subcélulas ficam no nível seguinte', fecho.celulas.find((c) => c.chave === c2.chave + '.0').nivel === 1);
ok('célula com erro do Google NÃO é fechada', !est[c3.chave] && fecho.stats.celulas_com_erro.length === 2);
ok('célula sem resposta também não', !est[c4.chave]);
ok('conta pedidos e pendentes', fecho.stats.pedidos === 6 && fecho.stats.celulas_pendentes_depois === planoCelulas[0]._plano.pendentes_antes - 2 + 4, ver(fecho.stats));
ok('linhas só com colunas da Data Table', fecho.celulas.every((c) => !('_pedido' in c) && !('_plano' in c)));

const fechoVazio = correr('05-fechar-pesquisa.js', { input: [{ _sem_pesquisa: true }], nos: { 'Config ativa': { first: CFG }, 'Índice do CRM': { first: indice }, Plano: { all: [{ _sem_pesquisa: true, _plano: { pendentes_antes: 3 } }] } } })[0];
ok('sem pesquisa → nada a gravar, pendentes intactos', fechoVazio.celulas.length === 0 && fechoVazio.fila.length === 0 && fechoVazio.stats.celulas_pendentes_depois === 3);

const escolhidos = correr('06-escolher-da-fila.js', { nos: { 'Config ativa': { first: CFG }, 'Índice do CRM': { first: indice }, 'Fechar pesquisa': { first: fecho } } });
ok('escolhe N = leads_novos_desejados', escolhidos.length === 5);
ok('primeiro a fila antiga, depois a nova', escolhidos[0].place_id === 'ChIJ-f1' && escolhidos[2].place_id === 'A0');
ok('conta o que fica na fila', escolhidos[0]._pesquisa.fila_restante === 2 + 63 - 5);
const nenhum = correr('06-escolher-da-fila.js', { nos: { 'Config ativa': { first: CFG }, 'Índice do CRM': { first: indiceVazio }, 'Fechar pesquisa': { first: fechoVazio } } });
ok('fila vazia → sentinela', nenhum.length === 1 && nenhum[0]._sem_novos === true);

const det = correr('07-juntar-detalhes.js', { json: { id: 'A0', displayName: { text: 'X' } }, nos: { 'Escolher da fila': { item: escolhidos[2] } } });
ok('detalhes levam o termo', det._termo === c1.termo);
const detFalhou = correr('07-juntar-detalhes.js', { json: { error: { message: '404 - "<title>Not Found</title>"' } }, nos: { 'Escolher da fila': { item: escolhidos[2] } } });
ok('detalhe falhado fica marcado (volta à fila)', detFalhou._falhou_detalhe === true && detFalhou.place_id === 'A0');

/* ---------------------------------------------------------------- */
console.log('\n5. Filtrar novos');

const place = (id, nome, extra = {}) => ({ id, displayName: { text: nome }, formattedAddress: 'Porto', businessStatus: 'OPERATIONAL', _termo: 'clínica de estética', ...extra });
const novos = correr('08-filtrar-novos.js', {
  input: [
    place('ChIJ-alfa', 'Alfa', { websiteUri: 'https://alfa.com.pt/' }),
    place('ChIJ-novo1', 'Clínica Nova', { websiteUri: 'https://clinicanova-exemplo.pt/?utm_source=gmb', internationalPhoneNumber: '+351 22 111 2222' }),
    place('ChIJ-novo1', 'Clínica Nova (repetida)'),
    place('ChIJ-lp2', 'Laser Exemplo | Boavista', { websiteUri: 'https://www.laserexemplo.pt/boavista' }),
    place('ChIJ-tel', 'Studio Alfa 2', { nationalPhoneNumber: '912345678' }),
    place('ChIJ-fb', 'Estética Só Facebook', { websiteUri: 'https://www.facebook.com/esteticaexemplofb' }),
    place('ChIJ-fb2', 'Outra Só Facebook', { websiteUri: 'https://www.facebook.com/outra' }),
    place('ChIJ-fechada', 'Fechada', { businessStatus: 'CLOSED_PERMANENTLY' }),
    place('ChIJ-irma', 'Clínica Nova Gaia', { websiteUri: 'https://clinicanova-exemplo.pt/gaia' }),
    { _falhou_detalhe: true, place_id: 'ChIJ-erro', erro: '500' },
  ],
  nos: { 'Índice do CRM': { first: indice }, 'Config ativa': { first: CFG } },
});
const porNome = Object.fromEntries(novos.map((l) => [l.nome, l]));
const st = novos[0]._stats;
ok('Place ID já no CRM é descartado (Alfa)', !porNome.Alfa);
ok('Place ID repetido na mesma execução é descartado', !porNome['Clínica Nova (repetida)']);
ok('fechado é descartado', !porNome.Fechada && st.fechados.includes('Fechada'));
ok('URL guardado sem utm', porNome['Clínica Nova'].website === 'https://clinicanova-exemplo.pt/');
ok('telefone normalizado', porNome['Clínica Nova'].telefone === '+351221112222');
ok('termo de pesquisa segue com o lead', porNome['Clínica Nova'].termo === 'clínica de estética');
ok('mesmo domínio que o CRM → Filial de', porNome['Laser Exemplo | Boavista'].filial_de === 'Laser Exemplo | Dragão');
ok('mesmo telefone (outro formato) → Filial de', porNome['Studio Alfa 2'].filial_de === 'Alfa');
ok('mesmo domínio na mesma execução → Filial de', porNome['Clínica Nova Gaia'].filial_de === 'Clínica Nova');
ok('Facebook vai para rede_social, não para website', porNome['Estética Só Facebook'].website === '' && /facebook/.test(porNome['Estética Só Facebook'].rede_social));
ok('dois só-Facebook NÃO são filiais um do outro', porNome['Outra Só Facebook'].filial_de === '');
ok('estatísticas certas', st.encontrados === 9 && st.ja_no_crm.length === 2 && st.novos === 6, ver(st));
ok('detalhe falhado aparece no resumo', st.detalhes_falhados.length === 1);
ok('fechado e já-no-CRM ficam registados para a Data Table',
  st.descartados_ids.some((d) => d.place_id === 'ChIJ-fechada' && d.estado === 'descartado') && st.descartados_ids.some((d) => d.place_id === 'ChIJ-alfa' && d.estado === 'processado'));

const vazio = correr('08-filtrar-novos.js', { input: [place('ChIJ-alfa', 'Alfa')], nos: { 'Índice do CRM': { first: indice }, 'Config ativa': { first: CFG } } });
ok('sem novos → um único item-sentinela', vazio.length === 1 && vazio[0]._sem_novos === true);
const comTipos = correr('08-filtrar-novos.js', {
  input: [
    place('ChIJ-oficina', 'Valentim Auto', { primaryType: 'car_repair', types: ['car_repair', 'point_of_interest'] }),
    place('ChIJ-al', "Quarto 'Romeu' com Ar Condicionado", { types: ['private_guest_room', 'lodging'] }),
    place('ChIJ-clima', 'Clima Exemplo', { primaryType: 'electrician', primaryTypeDisplayName: { text: 'Eletricista' }, websiteUri: 'http://www.climaexemplo.com/' }),
    place('ChIJ-semtipo', 'Técnico sem categoria'),
  ],
  nos: { 'Índice do CRM': { first: indice }, 'Config ativa': { first: CFG_CLIMA } },
});
const stT = comTipos[0]._stats;
ok('categoria excluída (primaryType) → descartada antes de site/Claude', !comTipos.some((l) => l.nome === 'Valentim Auto'));
ok('categoria excluída (só em types) → descartada', !comTipos.some((l) => /Romeu/.test(l.nome)));
ok('categoria permitida e sem categoria → passam', comTipos.length === 2);
ok('categoria legível segue com o lead', comTipos.find((l) => l.nome === 'Clima Exemplo').tipo_google === 'Eletricista');
ok('excluídos por categoria ficam no resumo e na Data Table com o motivo',
  stT.excluidos_tipo.includes('Valentim Auto (car_repair)') &&
  stT.descartados_ids.some((d) => d.place_id === 'ChIJ-al' && d.estado === 'descartado' && /categoria excluída: private_guest_room/.test(d.motivo)));
const formatoAntigo = correr('08-filtrar-novos.js', { input: [{ places: [place('ChIJ-z', 'Z')] }], nos: { 'Índice do CRM': { first: indice }, 'Config ativa': { first: CFG } } });
ok('continua a aceitar {places: [...]}', formatoAntigo[0].nome === 'Z');

/* ---------------------------------------------------------------- */
console.log('\n6. Analisar website');

const leadSite = { ...porNome['Clínica Nova'] };
const textoLongo = 'Clínica com depilação laser, medicina estética e tratamentos corporais. '.repeat(6);

let a = correr('09-analisar-website.js', { json: { data: '<html><div id="root"></div><script>app()</script></html>' }, nos: { 'Filtrar novos': { item: leadSite } } });
ok('site em JavaScript (texto curto) → 2.ª leitura pelo Jina', a._segunda_tipo === 'jina' && a._segunda_leitura === 'https://r.jina.ai/https://clinicanova-exemplo.pt/');

a = correr('09-analisar-website.js', { json: { error: { message: '403 Forbidden' } }, nos: { 'Filtrar novos': { item: leadSite } } });
ok('site que bloqueia → Jina, e o erro fica registado', a._segunda_tipo === 'jina' && /403/.test(a.site_erro));

a = correr('09-analisar-website.js', { json: { data: `<p>${textoLongo}</p><a href="/contactos">Contactos</a>` }, nos: { 'Filtrar novos': { item: leadSite } } });
ok('texto bom sem email + link de contactos → ler contactos', a._segunda_tipo === 'contactos' && a._segunda_leitura === 'https://clinicanova-exemplo.pt/contactos');

a = correr('09-analisar-website.js', { json: { data: `<p>${textoLongo}</p><a href="mailto:geral@clinicanova-exemplo.pt">e</a>` }, nos: { 'Filtrar novos': { item: leadSite } } });
ok('texto bom com email → sem 2.ª leitura', a._segunda_leitura === '' && a.email === 'geral@clinicanova-exemplo.pt');

/* ---------------------------------------------------------------- */
console.log('\n7. Juntar 2.ª leitura');

const antesJina = { ...leadSite, site_texto: '', email: '', _segunda_tipo: 'jina' };
let j = correr('10-juntar-segunda-leitura.js', {
  json: { data: `Title: Clínica Nova\nURL Source: https://clinicanova-exemplo.pt/\nMarkdown Content:\n# Bem-vinda\n${textoLongo}\n[Email](mailto:info@clinicanova-exemplo.pt) ![logo](https://x/logo.png)` },
  nos: { 'Analisar website': { item: antesJina } },
});
ok('Jina: texto recuperado', j.site_texto.length > 200 && !/Markdown Content|logo\.png/.test(j.site_texto));
ok('Jina: email recuperado do markdown', j.email === 'info@clinicanova-exemplo.pt');
ok('Jina: marcado ok', j.segunda_leitura === 'jina (ok)');

j = correr('10-juntar-segunda-leitura.js', {
  json: { data: 'Title: \nURL Source: https://x\nWarning: Target URL returned error 403: Forbidden\nMarkdown Content:\n' + 'x '.repeat(200) },
  nos: { 'Analisar website': { item: antesJina } },
});
ok('Jina com aviso de erro → ignorado, lead segue', j.site_texto === '' && j.segunda_leitura === 'jina (falhou)');

/* ---------------------------------------------------------------- */
console.log('\n8. Preparar análise');

const cfg = CFG;
let pa = correr('11-preparar-analise.js', { json: { ...leadSite, site_texto: 'curto', tipo_google: 'Oficina de reparação automóvel' }, nos: { 'Config ativa': { first: cfg } } });
ok('sem texto suficiente → verificação curta pelo nome', pa.site_ok === false && pa.vai_a_claude === true && pa.analise_tipo === 'nome' && pa.claude_body.max_tokens <= 300);
ok('verificação pelo nome leva nicho, nome e categoria', /Clínica de estética/.test(pa.claude_body.messages[0].content) && pa.claude_body.messages[0].content.includes(leadSite.nome) && /Oficina de reparação automóvel/.test(pa.claude_body.messages[0].content));
/* Exec 96 (13/10): 4 empresas de climatização com categoria "Empreiteira"
   foram descartadas porque o exemplo dizia "construtora". */
ok('verificação pelo nome: categoria genérica nunca exclui sozinha; nome do nicho prevalece',
  /Nunca exclui sozinha/.test(pa.claude_body.messages[0].content) && /Se o nome indicar a atividade do nicho/.test(pa.claude_body.messages[0].content) && !/construtora/.test(pa.claude_body.messages[0].content));
pa = correr('11-preparar-analise.js', { json: { ...leadSite, site_texto: 'curto' }, nos: { 'Config ativa': { first: { ...cfg, verificar_sem_site: false } } } });
ok('verificar_sem_site=false → sem texto não vai à Claude', pa.vai_a_claude === false && !pa.claude_body);
pa = correr('11-preparar-analise.js', { json: { ...leadSite, site_texto: textoLongo }, nos: { 'Config ativa': { first: cfg } } });
ok('com texto → corpo para a Claude', pa.site_ok === true && pa.vai_a_claude === true && pa.analise_tipo === 'site' && pa.claude_body.max_tokens >= 1500 && /Clínica de estética/.test(pa.claude_body.messages[0].content));
ok('sem criterios_score → critérios de clínicas', /marcação online \+ lembretes/.test(pa.claude_body.messages[0].content));
const CRIT_CLIMA = '- Sobe: pedidos de orçamento por telefone ou formulário; assistência técnica.\n- Desce: grande cadeia nacional.';
pa = correr('11-preparar-analise.js', { json: { ...leadSite, site_texto: textoLongo }, nos: { 'Config ativa': { first: { ...cfg, criterios_score: CRIT_CLIMA } } } });
const corpoClima = pa.claude_body.messages[0].content;
ok('com criterios_score → usa os da Config e não os de clínicas', corpoClima.includes(CRIT_CLIMA) && !/marcação online \+ lembretes/.test(corpoClima));
pa = correr('11-preparar-analise.js', { json: { ...leadSite, site_texto: textoLongo }, nos: { 'Config ativa': { first: { ...cfg, enrich: false } } } });
ok('enrich=false → não analisa', pa.site_ok === false && pa.vai_a_claude === false);
pa = correr('11-preparar-analise.js', { json: { ...leadSite, site_texto: 'curto' }, nos: { 'Config ativa': { first: { ...cfg, enrich: false } } } });
ok('enrich=false → nem a verificação pelo nome', pa.vai_a_claude === false && !pa.claude_body);

/* ---------------------------------------------------------------- */
console.log('\n9. Ler resposta Claude');

const CFG_LIVRE = { ...CFG, sub_nichos: [] };
const doAnalisavel = { ...leadSite, site_ok: true, claude_body: { grande: 'x'.repeat(1000) } };
const resposta = (texto, stop = 'end_turn') => ({ content: [{ type: 'text', text: texto }], stop_reason: stop });

let c = correr('12-ler-resposta-claude.js', { json: resposta('{"sinais": ["Botão Agendar sem marc', 'max_tokens'), nos: { 'Analisável?': { item: doAnalisavel }, 'Config ativa': { first: CFG_LIVRE } } });
ok('resposta cortada → por reanalisar (não grava JSON partido)', c.analise_ok === false && /cortada/.test(c.por_reanalisar));
ok('claude_body não segue para a frente', c.claude_body === undefined);

c = correr('12-ler-resposta-claude.js', {
  json: resposta('```json\n{"no_nicho": true, "sub_nicho": "medicina estética, laser", "score": 8.6, "sinais": ["a","b","c","d","e","f"], "dor_provavel": "Marcações por telefone", "resumo": "Bom lead."}\n```'),
  nos: { 'Analisável?': { item: doAnalisavel }, 'Config ativa': { first: CFG_LIVRE } },
});
ok('JSON dentro de ``` é lido', c.analise_ok === true);
ok('score arredondado', c.score === 9);
ok('sub-nicho sem vírgulas e com maiúscula', c.sub_nicho === 'Medicina estética  laser'.replace(/\s+/g, ' '), ver(c.sub_nicho));
ok('no máximo 5 sinais', c.sinais.length === 5);

c = correr('12-ler-resposta-claude.js', { json: resposta('{"no_nicho": false, "score": 99, "sinais": [], "resumo": "Cabeleireiro."}'), nos: { 'Analisável?': { item: doAnalisavel }, 'Config ativa': { first: CFG_LIVRE } } });
ok('score fora de 1–10 → vazio', c.score === null);
ok('no_nicho false é respeitado', c.no_nicho === false);

c = correr('12-ler-resposta-claude.js', { json: resposta('{"no_nicho": true, "sub_nicho": "medicina ESTÉTICA", "score": 7, "sinais": [], "resumo": "x"}'), nos: { 'Analisável?': { item: doAnalisavel }, 'Config ativa': { first: CFG } } });
ok('com lista: sub-nicho é normalizado para o nome da lista', c.sub_nicho === 'Medicina estética', ver(c.sub_nicho));
c = correr('12-ler-resposta-claude.js', { json: resposta('{"no_nicho": true, "sub_nicho": "Estética avançada e neuroestética", "score": 7, "sinais": [], "resumo": "x"}'), nos: { 'Analisável?': { item: doAnalisavel }, 'Config ativa': { first: CFG } } });
ok('com lista: sub-nicho inventado → Outro', c.sub_nicho === 'Outro');

c = correr('12-ler-resposta-claude.js', { json: { error: { message: '529 overloaded' } }, nos: { 'Analisável?': { item: doAnalisavel }, 'Config ativa': { first: CFG_LIVRE } } });
ok('erro da API → por reanalisar com o motivo', /529/.test(c.por_reanalisar));

const doNome = { ...leadSite, website: '', site_ok: false, analise_tipo: 'nome', claude_body: { x: 1 } };
c = correr('12-ler-resposta-claude.js', { json: resposta('{"no_nicho": false, "sub_nicho": "Outro", "motivo": "Oficina automóvel."}'), nos: { 'Analisável?': { item: doNome }, 'Config ativa': { first: CFG } } });
ok('pelo nome: fora do nicho fica marcado, sem score nem análise completa', c.verificado_nome === true && c.no_nicho === false && c.analise_ok === undefined && c.score === undefined && c.motivo_nome === 'Oficina automóvel.');
c = correr('12-ler-resposta-claude.js', { json: resposta('{"no_nicho": true, "sub_nicho": "medicina estética"}'), nos: { 'Analisável?': { item: doNome }, 'Config ativa': { first: CFG } } });
ok('pelo nome: do nicho, sub-nicho normalizado para a lista', c.verificado_nome === true && c.no_nicho === true && c.sub_nicho === 'Medicina estética');
c = correr('12-ler-resposta-claude.js', { json: { error: { message: '529 overloaded' } }, nos: { 'Analisável?': { item: doNome }, 'Config ativa': { first: CFG } } });
ok('pelo nome: erro da API não bloqueia nem marca por reanalisar', c.verificado_nome === false && !c.por_reanalisar && c.claude_body === undefined);
c = correr('12-ler-resposta-claude.js', { json: resposta('não sei'), nos: { 'Analisável?': { item: doNome }, 'Config ativa': { first: CFG } } });
ok('pelo nome: resposta sem JSON → segue sem verificação', c.verificado_nome === false);

/* ---------------------------------------------------------------- */
console.log('\n9b. Factos para o email (verificação das citações)');

const SITE = 'Somos a Clima Exemplo, Lda.\nHá mais de 25\u00a0anos a instalar ar condicionado e bombas de calor no Grande Porto.\n'
  + 'Instaladores certificados pela Daikin e Mitsubishi Electric — assistência técnica em 24 horas.\n'
  + 'Trabalhamos com particulares e empresas.\nFale com o Márcio Santos para um orçamento “sem compromisso”.\n'
  + 'Consultas de manutenção com a Dra. Helena às quintas.\nMais de 1200 obras concluídas.';
const comSite = (texto) => ({ ...leadSite, site_ok: true, site_texto: texto, claude_body: { model: 'claude-sonnet-5' } });
const RESPOSTA = {
  no_nicho: true, sub_nicho: 'Medicina estética', score: 8,
  sinais: [
    { texto: 'Mais de 25 anos de atividade', origem: 'facto', ref: 'f1' },
    { texto: 'Certificados Daikin e Mitsubishi', origem: 'facto', ref: 'f2' },
    { texto: 'Líder de mercado no norte', origem: 'facto', ref: 'f4' },
    { texto: 'Sem marcação online', origem: 'canal', ref: 'marcacao_online' },
    { texto: '4,8 com 120 avaliações', origem: 'google', ref: '' },
    { texto: 'Site antigo', origem: 'facto', ref: '' },
  ],
  dor_provavel: { texto: 'Orçamentos pedidos ao responsável por telefone', ref: 'f5' },
  resumo: 'Bom lead.',
  factos_email: {
    factos: [
      { id: 'f1', texto: 'Mais de 25 anos de atividade', citacao: 'Ha mais de 25 anos a instalar ar condicionado', tipo: 'prova' },
      { id: 'f2', texto: 'Certificados Daikin e Mitsubishi', citacao: 'Instaladores certificados pela Daikin e Mitsubishi Electric - assistência técnica em 24 horas.', tipo: 'prova' },
      { id: 'f3', texto: 'Particulares e empresas', citacao: 'Trabalhamos com particulares e empresas', tipo: 'clientes' },
      { id: 'f4', texto: 'Líder de mercado', citacao: 'Líderes de mercado no norte do país', tipo: 'diferenciador' },
      { id: 'f5', texto: 'Orçamento sem compromisso', citacao: 'Fale com o Márcio Santos para um orçamento "sem compromisso"', tipo: 'servico' },
      { id: 'f6', texto: 'Manutenção às quintas', citacao: 'Consultas de manutenção com a Dra. Helena às quintas', tipo: 'servico' },
    ],
    servicos: ['ar condicionado', 'bombas de calor', 'piscinas'],
    clientes: ['residencial', 'empresas', 'outro'],
    zona: 'Grande Porto',
    provas: { anos_atividade: 25, projetos: 1500, certificacoes: ['Daikin'], marcas: ['Daikin', 'Mitsubishi Electric', 'LG'] },
    canais: { telefone: true, whatsapp: false, formulario: true, email: true, marcacao_online: false, chat: false },
    juizos: ['site simples, sem marcação'],
  },
};
const lerFactos = (resp, texto = SITE) => correr('12-ler-resposta-claude.js', {
  json: { ...resposta(JSON.stringify(resp)), usage: { input_tokens: 2000, output_tokens: 700 } },
  nos: { 'Analisável?': { item: comSite(texto) }, 'Config ativa': { first: CFG } },
});
const FE = lerFactos(RESPOSTA);
const idsF = FE.factos_email.factos.map((x) => x.id);
ok('citação que existe no site fica (sem acentos, espaço não separável)', idsF.includes('f1'), ver(idsF));
ok('travessão do site = hífen da citação; ponto final ignorado', idsF.includes('f2'));
ok('marca com maiúscula (Daikin, Mitsubishi Electric) não é nome de pessoa', idsF.includes('f2'));
ok('citação inventada sai', !idsF.includes('f4'));
ok('aspas diferentes (“ ” vs ") batem, mas nome de pessoa sai', !idsF.includes('f5') && FE._factos.nome_pessoa === 1, ver(FE._factos));
ok('o 6.º facto é ignorado (máximo 5)', !idsF.includes('f6'));
const dra = lerFactos({ ...RESPOSTA, factos_email: { ...RESPOSTA.factos_email, factos: [RESPOSTA.factos_email.factos[5]] } });
ok('título + nome (Dra. Helena) sai', dra.factos_email.factos.length === 0 && dra._factos.nome_pessoa === 1);
ok('contas dos descartados', FE._factos.pedidos === 5 && FE._factos.verificados === 3 && FE._factos.sem_citacao === 1, ver(FE._factos));
ok('no máximo 5 factos pedidos são considerados', FE._factos.pedidos === 5);
ok('sinais: ficam os provados por facto, canal e Google', ver(FE.sinais) === ver(['Mais de 25 anos de atividade', 'Certificados Daikin e Mitsubishi', 'Sem marcação online', '4,8 com 120 avaliações']), ver(FE.sinais));
ok('sinais sem prova saem e são contados', FE._factos.sinais_cortados === 2);
ok('dor provável ligada a facto descartado fica vazia', FE.dor_provavel === '');
ok('serviços, marcas e zona só se aparecem no site', ver(FE.factos_email.servicos) === ver(['ar condicionado', 'bombas de calor'])
  && ver(FE.factos_email.provas.marcas) === ver(['Daikin', 'Mitsubishi Electric']) && FE.factos_email.zona === 'Grande Porto');
ok('números só se o site os diz (25 sim, 1500 não)', FE.factos_email.provas.anos_atividade === 25 && FE.factos_email.provas.projetos === null);
ok('clientes só da lista permitida', ver(FE.factos_email.indicativo.clientes) === ver(['residencial', 'empresas']));
ok('bloco v2: canais e clientes só em "indicativo"; juízos ficam de fora', FE.factos_email.indicativo.canais.formulario === true && FE.factos_email.indicativo.canais.marcacao_online === false
  && ver(FE.factos_email.indicativo.clientes) === ver(['residencial', 'empresas']) && FE.factos_email.juizos === undefined && FE.factos_email.canais === undefined && FE.factos_email.clientes === undefined);
ok('bloco v2: no topo só dados verificados', ver(Object.keys(FE.factos_email)) === ver(['idioma_site', 'factos', 'servicos', 'zona', 'provas', 'indicativo']));
const coer = (sinais, canais) => lerFactos({ ...RESPOSTA, sinais, factos_email: { ...RESPOSTA.factos_email, canais: { ...RESPOSTA.factos_email.canais, ...canais } } }).sinais;
ok('sinal "Sem WhatsApp" sai se whatsapp é true; fica se é false', coer([{ texto: 'Sem WhatsApp para pedidos', origem: 'canal', ref: 'whatsapp' }], { whatsapp: true }).length === 0
  && coer([{ texto: 'Sem WhatsApp para pedidos', origem: 'canal', ref: 'whatsapp' }], { whatsapp: false }).length === 1);
ok('sinal "Tem formulário de contacto" sai se formulario é false', coer([{ texto: 'Tem formulário de contacto', origem: 'canal', ref: 'formulario' }], { formulario: false }).length === 0);
ok('"Orçamentos só por telefone, sem seguimento" com telefone true fica (o "sem" não é do telefone)', coer([{ texto: 'Orçamentos só por telefone, sem seguimento automático', origem: 'canal', ref: 'telefone' }], { telefone: true }).length === 1);
ok('sinal de canal sem a palavra do canal fica', coer([{ texto: 'Contacto apenas direto', origem: 'canal', ref: 'marcacao_online' }], { marcacao_online: false }).length === 1);
ok('uso e modelo seguem para o custo e o bloco', FE._uso.output_tokens === 700 && FE._modelo === 'claude-sonnet-5');

const comDor = lerFactos({ ...RESPOSTA, dor_provavel: { texto: 'Pedidos de orçamento por formulário manual', ref: 'formulario' } });
ok('dor provável ligada a um canal fica', comDor.dor_provavel === 'Pedidos de orçamento por formulário manual');
const cortado = SITE + '\nGarantia de 5 anos em todas as instalações.';
const soCortada = lerFactos({ ...RESPOSTA, factos_email: { ...RESPOSTA.factos_email, factos: [{ id: 'f1', texto: 'Garantia', citacao: 'Garantia de 5 anos em todas as instalações', tipo: 'diferenciador' }] } }, cortado.slice(0, SITE.length));
ok('citação que só existia na parte cortada do site sai', soCortada.factos_email.factos.length === 0 && soCortada._factos.sem_citacao === 1);
const longa = lerFactos({ ...RESPOSTA, factos_email: { ...RESPOSTA.factos_email, factos: [{ id: 'f1', texto: 'x', citacao: SITE.slice(0, 200), tipo: 'prova' }] } });
const cit = longa.factos_email.factos[0] ? longa.factos_email.factos[0].citacao : '';
const depois = SITE.charAt(cit.length);
ok('citação acima de 160 caracteres é cortada em fronteira de palavra', longa._factos.encurtadas === 1 && cit.length <= 160 && cit.length > 100 && SITE.startsWith(cit) && /[\s.,;:!?]/.test(depois), ver(cit) + ' | seguinte: ' + ver(depois));
ok('a versão encurtada foi verificada de novo e está no bloco', longa.factos_email.factos.length === 1);
const SEM_ESPACOS = 'https://www.climaexemplo.pt/catalogo/' + 'bombas-de-calor-ar-agua-'.repeat(7) + 'fim';
const semCorte = lerFactos({ ...RESPOSTA, factos_email: { ...RESPOSTA.factos_email, factos: [{ id: 'f1', texto: 'Catálogo', citacao: SEM_ESPACOS, tipo: 'servico' }] } }, SITE + '\n' + SEM_ESPACOS);
ok('citação longa sem fronteira de palavra onde cortar → descartada, não partida a meio', semCorte.factos_email.factos.length === 0 && semCorte._factos.encurtada_sem_prova === 1, ver(semCorte._factos));

/* Só os factos verificados chegam ao bloco que o outreach lê. */
const INVENTADOS = ['Líderes de mercado no norte do país', 'Mais de 3000 clientes satisfeitos', 'Prémio PME Excelência 2024'];
const misto = lerFactos({ ...RESPOSTA, factos_email: { ...RESPOSTA.factos_email, factos: [
  RESPOSTA.factos_email.factos[0], RESPOSTA.factos_email.factos[2],
  ...INVENTADOS.map((citacao, i) => ({ id: 'x' + i, texto: 'inventado ' + i, citacao, tipo: 'prova' })),
] } });
const blocoMisto = correr('13-preparar-notion.js', { json: { ...misto, _stats: st }, nos: { 'Config ativa': { first: cfg } } }).notion_body.children[1].code.rich_text.map((t) => t.text.content).join('');
const jm = JSON.parse(blocoMisto);
const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
ok('bloco: só os 2 factos verificados, os 3 inventados ficam de fora', jm.factos.length === 2 && misto._factos.sem_citacao === 3, ver(jm.factos.map((x) => x.id)));
ok('bloco: nenhuma citação inventada aparece em lado nenhum do JSON', INVENTADOS.every((c) => !blocoMisto.includes(c)) && !/inventado/.test(blocoMisto));
ok('bloco: todas as citações existem no texto do site', jm.factos.every((x) => norm(SITE).includes(norm(x.citacao).replace(/[.,;:!?]+$/, ''))));

/* Preparar para Notion: corpo da página e Resumo no formato antigo. */
const notionDe = (l) => correr('13-preparar-notion.js', { json: { ...l, _stats: st }, nos: { 'Config ativa': { first: cfg } } });
let nb = notionDe(FE);
const blocos = nb.notion_body.children || [];
ok('com factos: título e bloco de código JSON no corpo', blocos.length === 2 && blocos[0].heading_3.rich_text[0].text.content === 'Factos para email (auto)' && blocos[1].code.language === 'json');
const json = JSON.parse(blocos[1].code.rich_text.map((t) => t.text.content).join(''));
ok('o JSON traz versão, data, modelo e os factos verificados', json.versao === 2 && !Number.isNaN(Date.parse(json.gerado_em)) && json.modelo === 'claude-sonnet-5' && json.factos.length === 3 && json.indicativo.canais && json.juizos === undefined);
ok('Resumo com o formato antigo intacto', nb.resumo_final === 'Bom lead.\n\nSinais: Mais de 25 anos de atividade | Certificados Daikin e Mitsubishi | Sem marcação online | 4,8 com 120 avaliações', ver(nb.resumo_final));
ok('Resumo com dor provável na linha de sempre', /\nDor provável: Pedidos de orçamento por formulário manual$/.test(notionDe(comDor).resumo_final));
const grande = { ...FE, factos_email: { ...FE.factos_email, servicos: ['j'.repeat(1500), 'k'.repeat(1500)] } };
const partes = notionDe(grande).notion_body.children[1].code.rich_text;
ok('JSON acima de 2000 caracteres é partido em vários textos ≤ 2000', partes.length >= 2 && partes.every((t) => t.text.content.length <= 2000)
  && JSON.parse(partes.map((t) => t.text.content).join('')).servicos.length === 2);
nb = notionDe(soCortada);
ok('lead sem factos verificados: sem bloco no corpo', nb.notion_body.children === undefined);
nb = notionDe({ ...leadSite, analise_ok: true, no_nicho: true, sinais: ['Marcação só por telefone'], dor_provavel: 'Atender telefone', resumo: 'Bom lead.' });
ok('formato antigo (sem factos_email): sem bloco, Resumo como antes', nb.notion_body.children === undefined && /^Bom lead\.\n\nSinais: Marcação só por telefone\nDor provável: Atender telefone$/.test(nb.resumo_final), ver(nb.resumo_final));

/* Resumo da execução: contas dos factos e custo. */
const R = correr('15-resumo.js', { input: [{ ...nb, _gravar: false, _descartar: false }, { ...notionDe(FE), _gravar: false, _descartar: false }, { ...notionDe(soCortada), _gravar: false, _descartar: false }],
  nos: { 'Config ativa': { first: { ...cfg, gravar_no_notion: false } } } })[0];
ok('resumo: factos propostos, verificados e porque saíram', R.factos_email.leads_analisados === 2 && R.factos_email.leads_com_bloco === 1
  && R.factos_email.verificados === 3 && R.factos_email.descartados.citacao_nao_existe_no_site === 2 && R.factos_email.descartados.nome_de_pessoa === 1, ver(R.factos_email));
ok('resumo: custo da Claude (2 $ / 10 $ por milhão)', R.claude.chamadas === 2 && Math.abs(R.claude.custo_usd - 2 * (2000 * 2 + 700 * 10) / 1e6) < 0.0001, ver(R.claude));

/* Entidades HTML e espaços: tratados igual na citação e no site. */
ok('entidades HTML → caracteres, sem mexer em maiúsculas nem acentos',
  comum.decodificarEntidades('Instala&ccedil;&atilde;o &amp; Manuten&ccedil;&atilde;o&nbsp;&#233;&#xE9;&Eacute;&ndash;') === 'Instalação & Manutenção\u00a0ééÉ–');
ok('entidade desconhecida fica como está', comum.decodificarEntidades('a &foo; b &#0;') === 'a &foo; b &#0;');
ok('texto do site sai sem entidades nem espaços repetidos', comum.htmlParaTexto('<p>Instala&ccedil;&atilde;o&nbsp;de&#160;caldeiras</p>\n\n<p>e  bombas</p>') === 'Instalação de caldeiras e bombas');
const SITE_HTML = 'Instala&ccedil;&atilde;o&nbsp;e  manuten&ccedil;&atilde;o\nde caldeiras &amp; esquentadores &#8211; 24&#160;horas.';
const umFacto = (citacao) => ({ ...RESPOSTA, factos_email: { ...RESPOSTA.factos_email, factos: [{ id: 'f1', texto: 'Caldeiras', citacao, tipo: 'servico' }] } });
let ent = lerFactos(umFacto('Instalação e manutenção de caldeiras & esquentadores – 24 horas'), SITE_HTML);
ok('site com entidades, espaços duplos e quebra de linha; citação limpa → verificada', ent.factos_email.factos.length === 1, ver(ent._factos));
ent = lerFactos(umFacto('Instala&ccedil;&atilde;o e manuten&ccedil;&atilde;o de caldeiras &amp; esquentadores'), 'Instalação e manutenção de caldeiras & esquentadores – 24 horas.');
ok('citação com entidades, site limpo → verificada (a mesma normalização dos dois lados)', ent.factos_email.factos.length === 1, ver(ent._factos));
ent = lerFactos(umFacto('Instalação e manutenção de caldeiras e esquentadores'), SITE_HTML);
ok('palavra diferente (e vs &) continua a não bater', ent.factos_email.factos.length === 0);

/* Contactos não são factos; o bloco só leva o que foi provado; idioma do site. */
const SITE_CONTACTOS = 'Remodelações e obras no Porto desde 2009. Solicite o seu orçamento. Ligue para nós! +351 910 000 406\n'
  + 'Escreva para geral@obrasporto.pt. Fale connosco por WhatsApp. Contacte-nos para mais informações.\n'
  + 'Orçamento gratuito e sem compromisso. Obras concluídas em 2019, 2020 e 2021 no centro histórico. Atendimento 22 345 67 89.';
const factosDe = (citacoes) => ({ ...RESPOSTA, factos_email: { ...RESPOSTA.factos_email, factos: citacoes.map((citacao, i) => ({ id: 'f' + (i + 1), texto: 'livre ' + i, citacao, tipo: 'servico' })) } });
const ct1 = lerFactos(factosDe(['Solicite o seu orçamento. Ligue para nós! +351 910 000 406', 'Escreva para geral@obrasporto.pt', 'Fale connosco por WhatsApp', 'Contacte-nos para mais informações', 'Orçamento gratuito e sem compromisso']), SITE_CONTACTOS);
ok('contactos (telefone, email, WhatsApp, "contacte-nos", "solicite orçamento") saem do bloco', ct1._factos.contacto === 4 && ct1.factos_email.factos.length === 1, ver(ct1._factos));
ok('"Orçamento gratuito e sem compromisso" é facto e fica', ct1.factos_email.factos[0] && ct1.factos_email.factos[0].citacao === 'Orçamento gratuito e sem compromisso');
const ct2 = lerFactos(factosDe(['Obras concluídas em 2019, 2020 e 2021 no centro histórico', 'Atendimento 22 345 67 89']), SITE_CONTACTOS);
ok('lista de anos não é telefone; telefone fixo com espaços é', ct2.factos_email.factos.length === 1 && ct2._factos.contacto === 1, ver(ct2._factos));
const SITE_TEL = 'Equipa técnica +351 910 000 406 e 910.000.406 e 220000000 mais 1234567890123.';
const ct3 = lerFactos(factosDe(['Equipa técnica +351 910 000 406', 'e 910.000.406 e 220000000', 'mais 1234567890123']), SITE_TEL);
ok('telefone só com o número (+351 com espaços, com pontos, colado) sai; número longo que não é telefone fica', ct3._factos.contacto === 2 && ct3.factos_email.factos.length === 1 && ct3.factos_email.factos[0].citacao === 'mais 1234567890123', ver(ct3._factos));
ok('bloco: cada facto só tem id, citação e tipo (sem texto livre)', FE.factos_email.factos.every((x) => ver(Object.keys(x)) === ver(['id', 'citacao', 'tipo'])));
ok('idioma do site: português', FE.factos_email.idioma_site === 'pt', FE.factos_email.idioma_site);
const SITE_EN = 'We are the official distributor of HeatFlow heat recovery ventilation systems in Northern Portugal. Renovating property in Northern Portugal can be complex, especially for international clients. Our team delivers roofs, renovations and windows for you and your family, with the care and quality you expect from us.';
const en = lerFactos(factosDe(['We are the official distributor of HeatFlow heat recovery ventilation systems in Northern Portugal']), SITE_EN);
ok('idioma do site: inglês', en.factos_email.idioma_site === 'en' && en.factos_email.factos.length === 1, en.factos_email.idioma_site);
ok('idioma do site: texto curto demais → misto', lerFactos(factosDe([]), 'Porto, Portugal').factos_email.idioma_site === 'misto');

/* Resposta pela OpenRouter (formato de chat). */
const viaOR = (conteudo, extra = {}) => ({ choices: [{ message: { role: 'assistant', content: conteudo }, finish_reason: 'stop' }], usage: { prompt_tokens: 2100, completion_tokens: 650, cost: 0.0107 }, ...extra });
const or1 = correr('12-ler-resposta-claude.js', { json: viaOR(JSON.stringify(RESPOSTA)), nos: { 'Analisável?': { item: comSite(SITE) }, 'Config ativa': { first: CFG } } });
ok('OpenRouter: resposta lida e factos verificados como antes', or1.analise_ok === true && or1.factos_email.factos.length === 3);
ok('OpenRouter: tokens e custo normalizados', or1._uso.input_tokens === 2100 && or1._uso.output_tokens === 650 && or1._uso.custo_usd === 0.0107);
const or2 = correr('12-ler-resposta-claude.js', { json: { choices: [{ message: { content: '{"no_nicho": true, "sinais": [' }, finish_reason: 'length' }] }, nos: { 'Analisável?': { item: comSite(SITE) }, 'Config ativa': { first: CFG } } });
ok('OpenRouter: finish_reason length → por reanalisar (cortada)', or2.analise_ok === false && /cortada/.test(or2.por_reanalisar));
const or3 = correr('12-ler-resposta-claude.js', { json: { error: { message: '402 Insufficient credits' } }, nos: { 'Analisável?': { item: comSite(SITE) }, 'Config ativa': { first: CFG } } });
ok('OpenRouter: erro → por reanalisar com o motivo', /402/.test(or3.por_reanalisar));
const or4 = correr('12-ler-resposta-claude.js', { json: viaOR('{"no_nicho": false, "sub_nicho": "Outro", "motivo": "Oficina."}'), nos: { 'Analisável?': { item: { ...leadSite, website: '', analise_tipo: 'nome', claude_body: {} } }, 'Config ativa': { first: CFG } } });
ok('OpenRouter: verificação pelo nome funciona', or4.verificado_nome === true && or4.no_nicho === false);
const R2 = correr('15-resumo.js', { input: [{ ...or1, _gravar: false, _descartar: false }], nos: { 'Config ativa': { first: { ...cfg, gravar_no_notion: false } } } })[0];
ok('resumo: usa o custo que a OpenRouter devolve', R2.claude.custo_usd === 0.0107, ver(R2.claude));

/* Prova de sociedade (campo "entidade" do bloco), detetada em código. */
const LEAD_BC = { nome: 'Clima Beta', website: 'http://www.climabeta-online.com/' };
const entd = (texto, lead = LEAD_BC) => comum.detetarEntidade(texto, lead);
ok('NIF: controlo módulo 11 (501234560 sim, 501234567 não; 212345672 é singular)', comum.nifColetivoValido('501234560') && !comum.nifColetivoValido('501234567') && !comum.nifColetivoValido('212345672'));
let e1 = entd('Instalação e manutenção de ar condicionado. Contactos. © 2024 Clima Beta, Lda. Todos os direitos reservados.');
ok('forma no rodapé, logo a seguir ao nome do lead', e1 && e1.forma === 'Lda' && e1.nif_coletivo === false && /Clima Beta, Lda\.?$/.test(e1.citacao), ver(e1));
e1 = entd('Morada: Rua X, 100, Porto. NIF: 501 234 560. Telefone 22 000 0000.');
ok('NIF válido começado por 5, com rótulo', e1 && e1.forma === null && e1.nif_coletivo === true && /NIF: 501 234 560/.test(e1.citacao), ver(e1));
ok('NIF começado por 2 (pessoa singular) não conta', entd('Contribuinte n.º 212345672') === null);
ok('NIF com o dígito de controlo errado não conta', entd('NIF 501234567') === null);
ok('palavra que só contém "lda" não conta (Ldaclima, Soldado)', entd('Clima Beta Ldaclima e o Soldado') === null);
ok('site sem nada → sem campo', entd('Bem-vindo à Clima Beta. Fazemos instalações de ar condicionado.') === null);
ok('NIF sem rótulo nem PT não conta', entd('Ref. de produto 501234560 em stock.') === null);
e1 = entd('Faturação: PT501234560');
ok('NIF com prefixo PT conta', e1 && e1.nif_coletivo === true && e1.citacao === 'PT501234560', ver(e1));
ok('"Desenvolvido por WebAgência, Lda" não conta', entd('© 2024 Clima Beta. Desenvolvido por WebAgência Best, Lda.') === null);
ok('marca de terceiros com S.A. não conta', entd('Clima Beta trabalha com a Daikin Air Conditioning Portugal, S.A. desde 2010.') === null);
ok('"garantia limitada" e "contribuir para a sociedade" não contam', entd('Clima Beta oferece garantia limitada e quer contribuir para a sociedade.') === null);
e1 = entd('Clima Beta Unipessoal Lda — NIPC 501234560');
ok('Unipessoal Lda: forma Unipessoal, e o NIF logo a seguir entra na mesma citação', e1 && e1.forma === 'Unipessoal' && e1.nif_coletivo === true && /^Clima Beta Unipessoal Lda — NIPC 501234560$/.test(e1.citacao), ver(e1));
e1 = entd('XY-CLIMA - Ar Condicionado, Lda é uma empresa fundada em 2004.', { nome: 'Xy Clima-ar Condicionado Lda', website: 'http://xyclima.pt' });
ok('denominação longa com o nome do lead', e1 && e1.forma === 'Lda', ver(e1));
ok('empresa-mãe não conta: nome só no email e "Grupo X, Lda" (caso real)', entd('Contactos assistencia@tecexemplo.pt Empresa do Grupo Holdexemplo, Lda', { nome: 'TecExemplo', website: 'http://tecexemplo.pt/' }) === null);
ok('nome do lead longe da forma não conta', entd('A Clima Beta tem uma equipa dedicada à instalação e assistência técnica certificada, Lda') === null);
const textoCompleto = 'Serviços de climatização. '.repeat(260) + '© 2024 Clima Beta, Lda.';
const an = correr('09-analisar-website.js', { json: { data: '<p>' + textoCompleto + '</p>' }, nos: { 'Filtrar novos': { item: { ...leadSite, nome: 'Clima Beta', website: 'http://www.climabeta-online.com/' } } } });
ok('rodapé depois dos 5000 caracteres é detetado (antes do corte para a Claude)', an.site_texto.length === 5000 && !an.site_texto.includes('Lda') && an.entidade && an.entidade.forma === 'Lda', ver(an.entidade));
const comEnt = correr('12-ler-resposta-claude.js', {
  json: { ...resposta(JSON.stringify(RESPOSTA)), usage: { input_tokens: 1, output_tokens: 1 } },
  nos: { 'Analisável?': { item: { ...comSite(SITE), entidade: { forma: 'Lda', nif_coletivo: false, citacao: 'Clima Exemplo, Lda.' } } }, 'Config ativa': { first: CFG } },
});
ok('bloco: "entidade" no topo quando há prova', comEnt.factos_email.entidade && comEnt.factos_email.entidade.forma === 'Lda');
ok('bloco: sem prova, o campo não existe', !('entidade' in FE.factos_email));

/* ---------------------------------------------------------------- */
console.log('\n10. Preparar para Notion');

const analisado = { ...leadSite, analise_ok: true, no_nicho: true, sub_nicho: 'Medicina estética', score: 8, sinais: ['Marcação só por telefone'], dor_provavel: 'Atender telefone', resumo: 'Bom lead.', email: 'a'.repeat(115) + '@clinica.pt', _stats: st };
let n = correr('13-preparar-notion.js', { json: analisado, nos: { 'Config ativa': { first: cfg } } });
const p = n.notion_body.properties;
ok('email inválido NÃO vai para o Notion (evita o 400)', p.Email === undefined);
ok('Score IA e Sub-nicho preenchidos', p['Score IA'].number === 8 && p['Sub-nicho'].select.name === 'Medicina estética');
ok('Resumo com sinais e dor', /Sinais: Marcação só por telefone/.test(p.Resumo.rich_text[0].text.content));
ok('grava', n._gravar === true && n._descartar === false);
ok('escreve na tabela da Config', n.notion_body.parent.database_id === cfg.notion_db);
ok('texto do site não segue (histórico leve)', n.site_texto === undefined);

n = correr('13-preparar-notion.js', { json: { ...analisado, no_nicho: false }, nos: { 'Config ativa': { first: cfg } } });
ok('fora do nicho → descartado, não grava', n._descartar === true && n._gravar === false);

n = correr('13-preparar-notion.js', { json: analisado, nos: { 'Config ativa': { first: { ...cfg, gravar_no_notion: false } } } });
ok('modo ensaio → não grava', n._gravar === false && n._descartar === false);

n = correr('13-preparar-notion.js', { json: { ...porNome['Estética Só Facebook'], site_ok: false }, nos: { 'Config ativa': { first: cfg } } });
ok('só Facebook → Rede social preenchida e resumo explica', n.notion_body.properties['Rede social'].url.includes('facebook') && /Sem website próprio/.test(n.resumo_final));
ok('sem análise → Score vazio, Enriquecido falso', n.notion_body.properties['Score IA'].number === null && n.notion_body.properties.Enriquecido.checkbox === false);

n = correr('13-preparar-notion.js', { json: { ...leadSite, site_ok: false, analise_ok: false, por_reanalisar: 'Resposta da Claude cortada (max_tokens)' }, nos: { 'Config ativa': { first: cfg } } });
ok('por reanalisar fica escrito no Resumo', /^POR REANALISAR — Resposta da Claude cortada/.test(n.resumo_final));

const semSite = { ...leadSite, website: '', site_ok: false, tipo_google: 'Oficina de reparação automóvel', _stats: st };
n = correr('13-preparar-notion.js', { json: { ...semSite, verificado_nome: true, no_nicho: false }, nos: { 'Config ativa': { first: cfg } } });
ok('sem site, fora do nicho pelo nome → descartado, não grava', n._descartar === true && n._gravar === false);
n = correr('13-preparar-notion.js', { json: { ...semSite, verificado_nome: true, no_nicho: true, sub_nicho: 'Medicina estética' }, nos: { 'Config ativa': { first: cfg } } });
ok('sem site, do nicho pelo nome → grava com sub-nicho, sem Score nem Enriquecido',
  n._gravar === true && n.notion_body.properties['Sub-nicho'].select.name === 'Medicina estética' && n.notion_body.properties['Score IA'].number === null && n.notion_body.properties.Enriquecido.checkbox === false);
ok('sem análise → categoria do Google no Resumo', /Sem website no Google\.\nCategoria no Google: Oficina de reparação automóvel\./.test(n.resumo_final), ver(n.resumo_final));
n = correr('13-preparar-notion.js', { json: { ...semSite, verificado_nome: false }, nos: { 'Config ativa': { first: cfg } } });
ok('verificação pelo nome falhou → grava como antes', n._gravar === true && n._descartar === false);

/* ---------------------------------------------------------------- */
console.log('\n11. Resultado Notion');

const preparado = { nome: 'Clínica Nova', score: 8, filial_de: '', _stats: st };
let rn = correr('14-resultado-notion.js', { json: { object: 'page', id: 'abc', url: 'https://notion.so/abc' }, nos: { 'Preparar para Notion': { item: preparado } } });
ok('página criada → criado', rn._resultado === 'criado' && rn.notion_url);
rn = correr('14-resultado-notion.js', { json: { error: { message: '429 rate_limited' } }, nos: { 'Preparar para Notion': { item: preparado } } });
ok('erro do Notion → falhou, com motivo', rn._resultado === 'falhou' && /429/.test(rn.erro));
rn = correr('14-resultado-notion.js', { json: { object: 'page', id: 'abc', url: 'https://notion.so/abc' }, nos: { 'Preparar para Notion': { item: { ...preparado, _factos: { verificados: 2 }, _uso: { input_tokens: 1, output_tokens: 1 }, _modelo: 'claude-sonnet-5' } } } });
ok('gravado: as contas dos factos e o custo seguem para o resumo', rn._factos.verificados === 2 && rn._uso.input_tokens === 1 && rn._modelo === 'claude-sonnet-5');

/* ---------------------------------------------------------------- */
console.log('\n12. Resumo da execução');

let r = correr('15-resumo.js', {
  input: [
    { _resultado: 'criado', nome: 'A', _stats: st },
    { _resultado: 'falhou', nome: 'B', erro: '429', _stats: st },
    { _descartar: true, nome: 'Cabeleireiro X', sub_nicho: 'Cabeleireiro', _stats: st },
  ],
  nos: { 'Config ativa': { first: cfg } },
})[0];
ok('conta criados / falhados / fora do nicho', r.criados_no_notion === 1 && r.falhados.length === 1 && r.fora_do_nicho.length === 1);
ok('avisa que os falhados ficaram na fila', /ficaram na fila/.test(r.aviso));
r = correr('15-resumo.js', {
  input: [{ _descartar: true, nome: 'Auto X', verificado_nome: true, motivo_nome: 'Oficina automóvel.', _stats: stT }],
  nos: { 'Config ativa': { first: cfg } },
})[0];
ok('resumo mostra excluídos por categoria', r.excluidos_por_categoria.length === 2 && r.excluidos_por_categoria.includes('Valentim Auto (car_repair)'));
ok('resumo diz se o fora do nicho foi pelo nome, com o motivo', r.fora_do_nicho[0] === 'Auto X (pelo nome: Oficina automóvel.)', ver(r.fora_do_nicho));

const pesquisaComFila = { _pesquisa: { celulas_pesquisadas: 4, pedidos: 9, ids_encontrados: 70, novos_para_a_fila: 40, celulas_pendentes_depois: 6, fila_restante: 20 } };
r = correr('15-resumo.js', { input: [vazio[0]], nos: { 'Config ativa': { first: cfg }, 'Escolher da fila': { first: pesquisaComFila } } })[0];
ok('mostra os números da pesquisa no Google', r.google.pedidos_de_pesquisa === 9 && r.fila_restante === 20 && r.celulas_por_pesquisar === 6);
ok('sem leads mas com células por pesquisar → manda correr outra vez', /Nenhum lead novo/.test(r.aviso) && /6 célula/.test(r.aviso));

r = correr('15-resumo.js', { input: [vazio[0]], nos: { 'Config ativa': { first: cfg }, 'Escolher da fila': { first: { _pesquisa: { celulas_pendentes_depois: 0, fila_restante: 0 } } } } })[0];
ok('sem células e sem fila → localidade esgotada', /Localidade esgotada/.test(r.aviso));

r = correr('15-resumo.js', { input: [{ ...analisado, resumo_final: 'Bom lead.', _gravar: false, _descartar: false }], nos: { 'Config ativa': { first: { ...cfg, gravar_no_notion: false } } } })[0];
ok('modo ensaio lista os leads que seriam gravados', r.modo.startsWith('ENSAIO') && r.leads.length === 1);

/* ---------------------------------------------------------------- */
console.log('\n13. Estado final dos places');

const fim = [
  { _resultado: 'criado', place_id: 'P1', termo: 't', nome: 'Criado', _stats: st },
  { _resultado: 'falhou', place_id: 'P2', termo: 't', nome: 'Falhou', erro: '429', _stats: st },
  { _descartar: true, place_id: 'P3', termo: 't', nome: 'Cabeleireiro', _stats: st },
];
let linhas = correr('16-estado-final.js', { nos: { 'Config ativa': { first: CFG }, Fim: { all: fim } } });
const porId = Object.fromEntries(linhas.map((l) => [l.place_id, l]));
ok('criado → processado', porId.P1.estado === 'processado');
ok('falhado NÃO sai da fila (não é tocado)', !porId.P2);
ok('fora do nicho → descartado com motivo', porId.P3.estado === 'descartado' && porId.P3.motivo === 'fora do nicho');
ok('fechado e já-no-CRM também ficam registados', porId['ChIJ-fechada'].estado === 'descartado' && porId['ChIJ-alfa'].estado === 'processado');
ok('linhas no espaço de estado certo', linhas.every((l) => l.crm === CFG.estado_chave));
linhas = correr('16-estado-final.js', { nos: { 'Config ativa': { first: CFG_ENSAIO }, Fim: { all: [{ place_id: 'P9', termo: 't', nome: 'Simulado' }] } } });
ok('modo ensaio → processado só no espaço de ensaio', linhas.length === 1 && linhas[0].crm.startsWith('ensaio:') && linhas[0].motivo === 'ensaio');

/* ---------------------------------------------------------------- */
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo ok.\n');
process.exit(falhas ? 1 : 0);
