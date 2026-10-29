/* =================================================================
   Construtor do workflow "Lead Gen" (v3)
   -----------------------------------------------------------------
   Junta lead-gen/*.js num JSON importável, como o build-site-leads.js.
   Os nós que começam por `// @comum` recebem lead-gen/00-comum.js à
   cabeça (o n8n não tem imports entre nós).

   Ordem do pipeline:

     Formulário / Manual → perfil (lead-gen/perfis.json) → lock
       → estado (células, IDs vistos, CRM) → localidade (rotação pelas
         localidades do perfil)
       → grelha da localidade (só a 1.ª vez de cada termo)
       → pesquisa de IDs por célula (grátis, até 3 páginas)
       → fila: os N mais antigos → detalhes (pagos)
       → FILTRAR NOVOS → site (+ 2.ª leitura) → Claude → Notion
       → resumo + estado final dos IDs

   Correr:
     node build-lead-gen.js                    gera lead-gen.json
     node build-lead-gen.js --enviar <id>      e substitui esse workflow no n8n
                                               (precisa de N8N_API_URL / N8N_API_KEY)
     node build-lead-gen.js --dev ...          versão "(dev)": CRM sempre o de TESTES
                                               e formulário em /form/leadgen-dev

   Perfis: lead-gen/perfis.json é a única fonte. O build valida-o
   (validar-perfis.js) e embute-o no nó "Perfil escolhido"; o dropdown
   do formulário é gerado a partir dele. Perfil novo = editar o JSON e
   voltar a enviar.

   Com LEADGEN_WEBHOOK_PATH definido, junta um webhook de ensaio que
   permite correr o workflow sem abrir o n8n. NÃO é para produção:
   gera-se sem a variável antes de substituir o workflow em uso.
   ================================================================= */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validarPerfis, nomeLocalidade } = require('./validar-perfis');

const DIR = path.join(__dirname, 'lead-gen');
const SAIDA = path.join(__dirname, 'lead-gen.json');
const COMUM = fs.readFileSync(path.join(DIR, '00-comum.js'), 'utf8');

const CRED = {
  places: { httpHeaderAuth: { id: 'GOOGLE_PLACES_CREDENTIAL_ID', name: 'Google Places' } },
  // A Claude vai pela OpenRouter desde 29/10/2026 (conta da Anthropic sem crédito).
  claude: { openRouterApi: { id: 'OPENROUTER_CREDENTIAL_ID', name: 'OpenRouter' } },
  notion: { httpHeaderAuth: { id: 'NOTION_CREDENTIAL_ID', name: 'Notion' } },
};
const NOTION_DB = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';          // CRM de produção
const NOTION_DB_TESTES = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';   // CRM de testes
const DEV = process.argv.includes('--dev');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* Perfis: recusa construir se o perfis.json estiver errado. */
const PERFIS = JSON.parse(fs.readFileSync(path.join(DIR, 'perfis.json'), 'utf8'));
const errosPerfis = validarPerfis(PERFIS);
if (errosPerfis.length) {
  console.error('\n  perfis.json recusado:\n  - ' + errosPerfis.join('\n  - ') + '\n');
  process.exit(1);
}
// Valores embutidos nos nós: o marcador "/*@nome*/" seguido de {} ou ''.
const EMBUTIR = {
  perfis: JSON.stringify(PERFIS, null, 2),
  notion_db: JSON.stringify(DEV ? NOTION_DB_TESTES : NOTION_DB),
};
const embutir = (src) => src.replace(/\/\*@(\w+)\*\/ (\{\}|'')/g, (m, nome) => (nome in EMBUTIR ? EMBUTIR[nome] : m));

function js(ficheiro) {
  let src = embutir(fs.readFileSync(path.join(DIR, ficheiro), 'utf8'));
  if (src.startsWith('// @comum')) src = COMUM + '\n' + src.replace(/^\/\/ @comum\r?\n/, '');
  try {
    new Function(src);
  } catch (e) {
    console.error(`\n  ERRO DE SINTAXE em lead-gen/${ficheiro}\n  ${e.message}\n`);
    process.exit(1);
  }
  return src;
}

const id = (nome) => nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

const code = (nome, ficheiro, pos, porItem) => ({
  parameters: { ...(porItem ? { mode: 'runOnceForEachItem' } : {}), jsCode: js(ficheiro) },
  id: id(nome), name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
});

const se = (nome, condicoes, pos) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: condicoes.map((c, i) => ({ id: `${id(nome)}-${i}`, ...c })),
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  },
  id: id(nome), name: nome, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos,
});
const verdadeiro = (expr) => ({ leftValue: `={{ ${expr} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } });
const vazio = (expr) => ({ leftValue: `={{ ${expr} || '' }}`, rightValue: '', operator: { type: 'string', operation: 'empty', singleValue: true } });
const naoVazio = (expr) => ({ leftValue: `={{ ${expr} }}`, rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } });

const juntar = (nome, entradas, pos) => ({
  parameters: entradas > 2 ? { numberInputs: entradas } : {},
  id: id(nome), name: nome, type: 'n8n-nodes-base.merge', typeVersion: 3, position: pos,
});

const http = (nome, pos, parameters, extra = {}) => ({
  parameters: { ...parameters, options: parameters.options || {} },
  id: id(nome), name: nome, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, ...extra,
});
const cabecalhos = (obj) => ({ sendHeaders: true, headerParameters: { parameters: Object.entries(obj).map(([name, value]) => ({ name, value })) } });
const credencial = () => ({ authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' });

const atribuicoes = (lista) => ({
  assignments: { assignments: lista.map(([name, type, value], i) => ({ id: `cfg-${i}`, name, type, value })) },
  options: {},
});

/* ---------------------------------------------------------------- */

const DT = {
  celulas: 'CELLS_DATA_TABLE_ID', // leadgen_celulas
  places: 'PLACES_DATA_TABLE_ID',  // leadgen_places
  lock: 'LOCK_DATA_TABLE_ID',    // leadgen_lock
};

/* Data Table: ler linhas com condições (todas têm de bater). Uma tabela
   vazia devolve um item {} para o workflow não parar ali. */
const dtLer = (nome, tabela, condicoes, pos) => ({
  parameters: {
    resource: 'row', operation: 'get',
    dataTableId: { __rl: true, mode: 'id', value: tabela },
    matchType: 'allConditions',
    filters: { conditions: condicoes.map(([keyName, keyValue]) => ({ keyName, condition: 'eq', keyValue })) },
    returnAll: true,
  },
  id: id(nome), name: nome, type: 'n8n-nodes-base.dataTable', typeVersion: 1, position: pos,
  executeOnce: true, alwaysOutputData: true,
});

/* Data Table: gravar (cria ou atualiza) cada item, identificado pelas
   colunas-chave. As colunas vêm dos próprios itens. */
const dtGravar = (nome, tabela, chaves, pos) => ({
  parameters: {
    resource: 'row', operation: 'upsert',
    dataTableId: { __rl: true, mode: 'id', value: tabela },
    matchType: 'allConditions',
    filters: { conditions: chaves.map((k) => ({ keyName: k, condition: 'eq', keyValue: `={{ $json.${k} }}` })) },
    columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
    options: {},
  },
  id: id(nome), name: nome, type: 'n8n-nodes-base.dataTable', typeVersion: 1, position: pos,
});

const CFG = "$('Config ativa').first().json";
/* A Google cobra o pedido de detalhes só pelo SKU mais alto dos campos
   pedidos. Site, telefone e rating já são Enterprise: `types`
   (Essentials) e `primaryType*` (Pro) não acrescentam custo. */
const CAMPOS_DETALHES = [
  'id', 'displayName', 'formattedAddress', 'websiteUri', 'rating', 'userRatingCount',
  'nationalPhoneNumber', 'internationalPhoneNumber', 'businessStatus',
  'types', 'primaryType', 'primaryTypeDisplayName',
].join(',');

const BASE = "$('Config base').first().json";

/* Manual Trigger (testes no editor): escolhe-se o perfil aqui. */
const escolhaManual = [
  ['perfil', 'string', 'ana-climatizacao'],
  ['localidade', 'string', ''],                 // vazio = rotação pelas localidades do perfil
  ['leads_novos_desejados', 'string', ''],      // vazio = o do perfil
  ['gravar_no_notion', 'boolean', !DEV],
];

/* Agendamento do outreach (29/10/2026): dias úteis às 7h (hora de
   Lisboa), 10 leads do perfil de outreach, a gravar. Só corre com o
   workflow ativo. Fica fora da versão dev: a cópia, ativa para ensaios,
   não pode correr sozinha. */
const AGENDA = { cron: '0 7 * * 1-5', perfil: 'outreach-remodelacoes', leads: 10 };
if (!PERFIS[AGENDA.perfil]) throw new Error(`O agendamento usa o perfil "${AGENDA.perfil}", que não existe no perfis.json.`);
const agendamento = DEV ? [] : [
  {
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: AGENDA.cron }] } },
    id: 'agendamento', name: 'Agendamento (dias úteis, 7h)', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [-1320, 440],
  },
  {
    parameters: atribuicoes([
      ['perfil', 'string', AGENDA.perfil],
      ['localidade', 'string', ''],
      ['leads_novos_desejados', 'number', AGENDA.leads],
      ['gravar_no_notion', 'boolean', true],
    ]),
    id: 'escolha-agendada', name: 'Escolha agendada', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [-1100, 440],
  },
];

/* Formulário: só abre a quem tem sessão iniciada no n8n ("n8n User
   Auth", Form Trigger 2.6), porque cada execução gasta Google Places e
   Claude. Sem sessão, o link manda para o login do n8n. */
const FORM_PATH = DEV ? 'leadgen-dev' : 'leadgen';
const todasLocalidades = [...new Set(Object.values(PERFIS).flatMap((p) => p.localidades.map(nomeLocalidade)))];
const opcoes = (lista) => ({ values: lista.map((option) => ({ option })) });
const formulario = {
  parameters: {
    authentication: 'n8nUserAuth',
    formTitle: DEV ? 'Lead Gen (dev — CRM de TESTES)' : 'Lead Gen',
    formDescription: 'Escolhe o perfil. Sem localidade, o workflow passa para a próxima localidade do perfil que ainda tenha trabalho. O resultado fica nas execuções do n8n.\n\n'
      + Object.entries(PERFIS).map(([n, p]) => `${n}: ${p.nicho} → ${p.responsavel}`).join('\n'),
    formFields: {
      values: [
        { fieldLabel: 'Perfil', fieldType: 'dropdown', fieldOptions: opcoes(Object.keys(PERFIS)), requiredField: true },
        { fieldLabel: 'Localidade', fieldType: 'dropdown', fieldOptions: opcoes(['Automática', ...todasLocalidades]), requiredField: true },
        { fieldLabel: 'Leads novos', fieldType: 'number', placeholder: 'vazio = o do perfil' },
        { fieldLabel: 'Modo', fieldType: 'dropdown', fieldOptions: opcoes(['Ensaio (não grava)', 'Gravar no CRM']), requiredField: true },
      ],
    },
    options: { path: FORM_PATH, appendAttribution: false },
  },
  id: 'formulario', name: 'Formulário', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.6, position: [-1320, 220],
  webhookId: crypto.createHash('md5').update('leadgen-' + FORM_PATH).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'),
};

const nodes = [
  { parameters: {}, id: 'manual-trigger', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [-1320, 0] },
  {
    parameters: atribuicoes(escolhaManual),
    id: 'escolha-manual', name: 'Escolha manual', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [-1100, 0],
  },
  formulario,
  ...agendamento,
  code('Perfil escolhido', 'perfil.js', [-880, 0]),
  code('Config base', 'config-base.js', [-660, 0]),

  /* 0. Lock: uma execução de cada vez por CRM. */
  dtLer('Ler lock', DT.lock, [['chave', `={{ ${BASE}.lock_chave }}`]], [-440, 0]),
  code('Verificar lock', 'lock.js', [-220, 0]),
  dtGravar('Gravar lock', DT.lock, ['chave'], [0, 0]),

  /* 1. Estado: células (todas as cidades do nicho, para a rotação), IDs já vistos e o CRM. */
  dtLer('Ler células', DT.celulas, [
    ['crm', `={{ ${BASE}.estado_chave }}`], ['nicho', `={{ ${BASE}.nicho }}`],
  ], [220, 0]),
  dtLer('Ler places vistos', DT.places, [['crm', `={{ ${BASE}.estado_chave }}`]], [440, 0]),
  code('Config ativa', 'config-ativa.js', [660, 0]),
  /* Depois do lock, os nós não lançam erros: devolvem _parar e estes IFs
     desviam para o ramo que liberta o lock antes de parar. */
  se('Config ok?', [vazio('$json._parar')], [880, 0]),
  http('Notion - Ler CRM', [1100, 0], {
    method: 'POST',
    url: `={{ 'https://api.notion.com/v1/databases/' + ${CFG}.notion_db + '/query' }}`,
    ...credencial(),
    ...cabecalhos({ 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }),
    options: {
      pagination: {
        pagination: {
          parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
          paginationCompleteWhen: 'other',
          completeExpression: '={{ !$response.body.has_more }}',
          limitPagesFetched: true,
          maxRequests: 200,
          requestInterval: 350,
        },
      },
    },
  }, { credentials: CRED.notion, executeOnce: true }),
  code('Índice do CRM', '01-indice-crm.js', [1320, 0]),
  se('CRM lido?', [vazio('$json._parar')], [1430, 0]),

  /* 2. Grelha: só na primeira vez de cada termo nesta localidade. */
  se('Precisa de grelha?', [verdadeiro('$json.termos_sem_celulas.length > 0')], [1540, 0]),
  http('Google - Limites da localidade', [1760, -120], {
    method: 'POST',
    url: 'https://places.googleapis.com/v1/places:searchText',
    ...credencial(),
    ...cabecalhos({ 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'places.id,places.displayName,places.viewport' }),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ textQuery: ${CFG}.location, languageCode: 'pt', regionCode: 'PT', pageSize: 1 }) }}`,
  }, { credentials: CRED.places, executeOnce: true }),
  code('Criar grelha', '02-criar-grelha.js', [1980, -120]),
  se('Grelha criada?', [vazio('$json._parar')], [2090, -120]),
  dtGravar('Gravar células novas', DT.celulas, ['chave'], [2200, -120]),

  /* 3. Pesquisa: células escolhidas, só IDs (grátis), até 3 páginas cada. */
  code('Plano', '03-plano.js', [2420, 0]),
  se('Há células para pesquisar?', [{ leftValue: '={{ $json._sem_pesquisa }}', rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } }], [2640, 0]),
  http('Google - Pesquisar IDs', [2860, -120], {
    method: 'POST',
    url: 'https://places.googleapis.com/v1/places:searchText',
    ...credencial(),
    // Só IDs e o token da página seguinte: é o SKU gratuito. Sem o
    // nextPageToken aqui, o Google não o devolve e a "página 2" é a 1.
    ...cabecalhos({ 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'places.id,nextPageToken' }),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json._pedido) }}',
    options: {
      pagination: {
        pagination: {
          parameters: { parameters: [{ type: 'body', name: 'pageToken', value: '={{ $response.body.nextPageToken }}' }] },
          paginationCompleteWhen: 'other',
          completeExpression: '={{ !$response.body.nextPageToken }}',
          limitPagesFetched: true,
          maxRequests: 3,
          requestInterval: 500,
        },
      },
    },
  }, { credentials: CRED.places, onError: 'continueRegularOutput' }),
  code('IDs por página', '04-ids-por-pagina.js', [3080, -120], true),
  code('Fechar pesquisa', '05-fechar-pesquisa.js', [3300, 0]),
  code('Linhas de células', '05a-linhas-celulas.js', [3520, -160]),
  dtGravar('Gravar células', DT.celulas, ['chave'], [3740, -160]),
  code('Linhas da fila', '05b-linhas-fila.js', [3520, 0]),
  dtGravar('Gravar fila', DT.places, ['place_id', 'crm'], [3740, 0]),
  juntar('Estado gravado', 3, [3960, 0]),

  /* 4. Fila: os N mais antigos → detalhes (pagos, só para estes). */
  code('Escolher da fila', '06-escolher-da-fila.js', [4180, 0]),
  se('Há leads na fila?', [{ leftValue: '={{ $json._sem_novos }}', rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } }], [4400, 0]),
  http('Google - Detalhes', [4620, -120], {
    url: "={{ 'https://places.googleapis.com/v1/places/' + $json.place_id + '?languageCode=pt&regionCode=PT' }}",
    ...credencial(),
    ...cabecalhos({ 'X-Goog-FieldMask': CAMPOS_DETALHES }),
    options: { batching: { batch: { batchSize: 5, batchInterval: 300 } } },
  }, { credentials: CRED.places, onError: 'continueRegularOutput' }),
  code('Juntar detalhes', '07-juntar-detalhes.js', [4840, -120], true),

  /* 5. Daqui para a frente é a Fase 1: filtrar → site → Claude → Notion. */
  code('Filtrar novos', '08-filtrar-novos.js', [5060, -120]),
  se('Há leads novos?', [{ leftValue: '={{ $json._sem_novos }}', rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } }], [5280, -120]),

  se('Tem website?', [naoVazio('$json.website'), verdadeiro(`${CFG}.enrich`)], [5500, -220]),
  http('Ler website', [5720, -320], {
    url: '={{ $json.website }}',
    ...cabecalhos({ 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9' }),
    options: { allowUnauthorizedCerts: true, redirect: { redirect: {} }, response: { response: { responseFormat: 'text' } }, timeout: 10000 },
  }, { onError: 'continueRegularOutput' }),
  code('Analisar website', '09-analisar-website.js', [5940, -320], true),
  se('Precisa de 2.ª leitura?', [naoVazio('$json._segunda_leitura')], [6160, -320]),
  http('Ler website (2.ª leitura)', [6380, -420], {
    url: '={{ $json._segunda_leitura }}',
    /* O Jina está atrás da Cloudflare: com User-Agent de browser responde
       403 "Just a moment...". Para o Jina vai um UA honesto; a página de
       contactos vai com o de browser, como a homepage. */
    ...cabecalhos({
      'User-Agent': `={{ $json._segunda_tipo === 'jina' ? 'leadgen/1.0' : '${UA}' }}`,
      'X-Timeout': '15',
    }),
    options: {
      allowUnauthorizedCerts: true,
      redirect: { redirect: {} },
      response: { response: { responseFormat: 'text' } },
      timeout: 30000,
      // O Jina Reader sem chave aceita ~20 pedidos por minuto.
      batching: { batch: { batchSize: 1, batchInterval: 3000 } },
    },
  }, { onError: 'continueRegularOutput' }),
  code('Juntar 2.ª leitura', '10-juntar-segunda-leitura.js', [6600, -420], true),
  juntar('Website lido', 2, [6820, -320]),
  juntar('Juntar leads', 2, [7040, -220]),

  code('Preparar análise', '11-preparar-analise.js', [7260, -220], true),
  // Vai à Claude quem tem site lido (análise completa) ou, sem site, para a verificação pelo nome.
  se('Analisável?', [verdadeiro('$json.vai_a_claude')], [7480, -220]),
  http('Claude - Analisar lead', [7700, -320], {
    method: 'POST',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'openRouterApi',
    ...cabecalhos({ 'Content-Type': 'application/json', 'X-Title': 'Lead Gen' }),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.claude_body) }}',
    options: { timeout: 90000 },
  }, { credentials: CRED.claude, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }),
  code('Ler resposta Claude', '12-ler-resposta-claude.js', [7920, -320], true),
  juntar('Analisados', 2, [8140, -220]),

  code('Preparar para Notion', '13-preparar-notion.js', [8360, -220], true),
  se('Gravar?', [verdadeiro('$json._gravar')], [8580, -220]),
  http('Notion - Criar Lead', [8800, -320], {
    method: 'POST',
    url: 'https://api.notion.com/v1/pages',
    ...credencial(),
    ...cabecalhos({ 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.notion_body) }}',
    // Um de cada vez, abaixo do limite de ~3 pedidos/s do Notion.
    options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } },
  }, { credentials: CRED.notion, onError: 'continueRegularOutput' }),
  code('Resultado Notion', '14-resultado-notion.js', [9020, -320], true),

  /* 6. Fim: resumo e estado dos IDs tratados. */
  juntar('Fim', 3, [9240, 0]),
  code('Resumo da execução', '15-resumo.js', [9460, 0]),
  code('Estado final dos places', '16-estado-final.js', [9680, 0]),
  dtGravar('Gravar estado dos places', DT.places, ['place_id', 'crm'], [9900, 0]),
  {
    parameters: atribuicoes([['chave', 'string', `={{ ${BASE}.lock_chave }}`], ['execucao', 'string', ''], ['desde', 'string', '']]),
    id: 'libertar-lock', name: 'Libertar lock', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [9680, 220],
  },
  dtGravar('Gravar lock libertado', DT.lock, ['chave'], [9900, 220]),

  /* Ramo de erro depois do lock: liberta o lock e pára com a mensagem. */
  code('Mensagem de erro', 'erro-antes-de-gastar.js', [1760, 440]),
  {
    parameters: atribuicoes([['chave', 'string', `={{ ${BASE}.lock_chave }}`], ['execucao', 'string', ''], ['desde', 'string', '']]),
    id: 'libertar-lock-erro', name: 'Libertar lock (erro)', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [1980, 440],
  },
  dtGravar('Gravar lock libertado (erro)', DT.lock, ['chave'], [2200, 440]),
  {
    parameters: { errorMessage: "={{ $('Mensagem de erro').first().json.mensagem }}" },
    id: 'parar-com-erro', name: 'Parar com erro', type: 'n8n-nodes-base.stopAndError', typeVersion: 1, position: [2420, 440],
  },
];

const liga = (...destinos) => ({ main: destinos.map((d) => (d ? [].concat(Array.isArray(d[0]) ? d : [d]).map(([node, index]) => ({ node, type: 'main', index: index || 0 })) : [])) });

const connections = {
  'Manual Trigger': liga(['Escolha manual']),
  'Escolha manual': liga(['Perfil escolhido']),
  ...(DEV ? {} : { 'Agendamento (dias úteis, 7h)': liga(['Escolha agendada']), 'Escolha agendada': liga(['Perfil escolhido']) }),
  'Formulário': liga(['Perfil escolhido']),
  'Perfil escolhido': liga(['Config base']),
  'Config base': liga(['Ler lock']),
  'Ler lock': liga(['Verificar lock']),
  'Verificar lock': liga(['Gravar lock']),
  'Gravar lock': liga(['Ler células']),
  'Ler células': liga(['Ler places vistos']),
  'Ler places vistos': liga(['Config ativa']),
  'Config ativa': liga(['Config ok?']),
  'Config ok?': liga(['Notion - Ler CRM'], ['Mensagem de erro']),
  'Notion - Ler CRM': liga(['Índice do CRM']),
  'Índice do CRM': liga(['CRM lido?']),
  'CRM lido?': liga(['Precisa de grelha?'], ['Mensagem de erro']),
  'Precisa de grelha?': liga(['Google - Limites da localidade'], ['Plano']),
  'Google - Limites da localidade': liga(['Criar grelha']),
  'Criar grelha': liga(['Grelha criada?']),
  'Grelha criada?': liga(['Gravar células novas'], ['Mensagem de erro']),
  'Mensagem de erro': liga(['Libertar lock (erro)']),
  'Libertar lock (erro)': liga(['Gravar lock libertado (erro)']),
  'Gravar lock libertado (erro)': liga(['Parar com erro']),
  'Gravar células novas': liga(['Plano']),
  'Plano': liga(['Há células para pesquisar?']),
  'Há células para pesquisar?': liga(['Google - Pesquisar IDs'], ['Fechar pesquisa']),
  'Google - Pesquisar IDs': liga(['IDs por página']),
  'IDs por página': liga(['Fechar pesquisa']),
  'Fechar pesquisa': liga([['Linhas de células'], ['Linhas da fila'], ['Estado gravado', 2]]),
  'Linhas de células': liga(['Gravar células']),
  'Gravar células': liga(['Estado gravado', 0]),
  'Linhas da fila': liga(['Gravar fila']),
  'Gravar fila': liga(['Estado gravado', 1]),
  'Estado gravado': liga(['Escolher da fila']),
  'Escolher da fila': liga(['Há leads na fila?']),
  'Há leads na fila?': liga(['Google - Detalhes'], ['Fim', 2]),
  'Google - Detalhes': liga(['Juntar detalhes']),
  'Juntar detalhes': liga(['Filtrar novos']),
  'Filtrar novos': liga(['Há leads novos?']),
  'Há leads novos?': liga(['Tem website?'], ['Fim', 2]),
  'Tem website?': liga(['Ler website'], ['Juntar leads', 1]),
  'Ler website': liga(['Analisar website']),
  'Analisar website': liga(['Precisa de 2.ª leitura?']),
  'Precisa de 2.ª leitura?': liga(['Ler website (2.ª leitura)'], ['Website lido', 1]),
  'Ler website (2.ª leitura)': liga(['Juntar 2.ª leitura']),
  'Juntar 2.ª leitura': liga(['Website lido', 0]),
  'Website lido': liga(['Juntar leads', 0]),
  'Juntar leads': liga(['Preparar análise']),
  'Preparar análise': liga(['Analisável?']),
  'Analisável?': liga(['Claude - Analisar lead'], ['Analisados', 1]),
  'Claude - Analisar lead': liga(['Ler resposta Claude']),
  'Ler resposta Claude': liga(['Analisados', 0]),
  'Analisados': liga(['Preparar para Notion']),
  'Preparar para Notion': liga(['Gravar?']),
  'Gravar?': liga(['Notion - Criar Lead'], ['Fim', 1]),
  'Notion - Criar Lead': liga(['Resultado Notion']),
  'Resultado Notion': liga(['Fim', 0]),
  'Fim': liga(['Resumo da execução']),
  'Resumo da execução': liga([['Estado final dos places'], ['Libertar lock']]),
  'Libertar lock': liga(['Gravar lock libertado']),
  'Estado final dos places': liga(['Gravar estado dos places']),
};

/* Webhook de ensaio: só existe se LEADGEN_WEBHOOK_PATH estiver definido.
   Recebe { perfil, localidade, leads_novos_desejados, gravar_no_notion };
   por omissão NÃO grava no Notion. NÃO é para produção. */
const webhookPath = process.env.LEADGEN_WEBHOOK_PATH;
if (webhookPath) {
  nodes.push({
    parameters: { httpMethod: 'POST', path: webhookPath, options: {} },
    id: 'webhook-ensaio', name: 'Ensaio (remover antes de produção)', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [-1320, 440], webhookId: webhookPath,
  });
  connections['Ensaio (remover antes de produção)'] = liga(['Perfil escolhido']);
}

const workflow = {
  name: DEV ? 'Lead Gen (dev)' : 'Lead Gen',
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: 'Europe/Lisbon', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
};

/* Verificações que já custaram execuções: ligação para um nó que não
   existe, e nó sem nada a entrar (fica pendurado, nunca corre). */
const nomes = new Set(nodes.map((n) => n.name));
const comEntrada = new Set();
for (const [origem, lig] of Object.entries(connections)) {
  if (!nomes.has(origem)) throw new Error(`Ligação a partir de nó inexistente: ${origem}`);
  for (const saida of lig.main) for (const alvo of saida) {
    if (!nomes.has(alvo.node)) throw new Error(`"${origem}" liga a nó inexistente: ${alvo.node}`);
    comEntrada.add(alvo.node);
  }
}
const soltos = nodes.filter((n) => !/Trigger|webhook/i.test(n.type) && !comEntrada.has(n.name)).map((n) => n.name);
if (soltos.length) throw new Error('Nós sem entrada: ' + soltos.join(', '));

fs.writeFileSync(SAIDA, JSON.stringify(workflow, null, 2), 'utf8');
console.log(`OK — ${nodes.length} nós escritos em ${path.relative(process.cwd(), SAIDA)}${DEV ? ' (DEV: CRM de TESTES)' : ''}${webhookPath ? ' (COM webhook de ensaio)' : ''}`);

const i = process.argv.indexOf('--enviar');
if (i > -1) {
  const destino = process.argv[i + 1];
  const API_URL = (process.env.N8N_API_URL || '').replace(/\/+$/, '');
  const API_KEY = process.env.N8N_API_KEY || '';
  if (!destino || !API_URL || !API_KEY) {
    console.error('  --enviar precisa de um ID de workflow e de N8N_API_URL / N8N_API_KEY.');
    process.exit(1);
  }
  fetch(`${API_URL}/api/v1/workflows/${destino}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  }).then(async (r) => {
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) { console.error(`  n8n recusou (${r.status}):`, corpo.message || corpo); process.exit(1); }
    console.log(`  Enviado para o n8n: ${corpo.name} (${corpo.id}), ${corpo.nodes.length} nós.`);
  });
}
