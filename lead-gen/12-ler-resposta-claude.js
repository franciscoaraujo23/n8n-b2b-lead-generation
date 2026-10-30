// @comum
/* Ler resposta Claude — corre por lead, a seguir ao HTTP da Claude.

   Antes, uma resposta cortada pelo max_tokens virava
   "Erro ao interpretar resposta da Claude: {"sinais_digitais"..."
   no Notion. Agora o lead fica marcado "por reanalisar", com o motivo,
   e o CRM não recebe JSON partido.

   Verificação dos factos para o email (23/10/2026): cada facto traz a
   frase do site que o prova. A frase tem de existir no texto que foi
   enviado à Claude (que pode ter sido cortado); senão, o facto sai.
   Saem também os factos com nomes de pessoas. Os sinais do Resumo que
   dizem vir do site só ficam se o facto que os prova ficou. */

const { claude_body, ...lead } = $('Analisável?').item.json;
const cfg = $('Config ativa').first().json;
const r = $json;

/* A resposta chega pela OpenRouter (formato de chat: choices[0].message)
   ou, como antes, diretamente da Anthropic (content em blocos). Daqui
   para baixo só se usa o que estas três funções devolvem. */
const escolha = Array.isArray(r.choices) ? r.choices[0] || {} : null;
const textoResposta = (resp) => {
  if (escolha) return typeof (escolha.message && escolha.message.content) === 'string' ? escolha.message.content : '';
  const bloco = (resp.content || []).find((b) => b && b.type === 'text' && typeof b.text === 'string');
  return bloco ? bloco.text : '';
};
const respostaValida = !r.error && (escolha ? !!escolha.message : Array.isArray(r.content));
const cortada = escolha ? escolha.finish_reason === 'length' : r.stop_reason === 'max_tokens';
const u = r.usage || null;
const uso = u ? { input_tokens: u.prompt_tokens ?? u.input_tokens ?? 0, output_tokens: u.completion_tokens ?? u.output_tokens ?? 0, ...(typeof u.cost === 'number' ? { custo_usd: u.cost } : {}) } : null;

const reanalisar = (motivo) => ({ json: { ...lead, analise_ok: false, por_reanalisar: motivo, _uso: uso } });

/* JSON da resposta, tolerante a ```json e a texto à volta. null se não houver. */
function lerJson(resp) {
  let s = textoResposta(resp).trim();
  s = s.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  if (!s.startsWith('{')) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
  }
  try { return { ok: true, valor: JSON.parse(s), bruto: s }; } catch (e) { return { ok: false, bruto: s }; }
}

/* Normalização para comparar citações, igual dos dois lados (citação e
   texto do site): primeiro as entidades HTML (&amp; &nbsp; &eacute;
   &#233;…) passam a caracteres e todos os espaços (duplos, quebras de
   linha, não separáveis, de largura zero) a um só; depois minúsculas,
   sem acentos, sem aspas, hífens e travessões iguais e reticências
   uniformes. */
function normalizar(t) {
  return decodificarEntidades(t)
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”„‟«»"'’‘‚‛`´]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/ ?- ?/g, '-')
    .trim();
}

/* Nomes próprios portugueses comuns (sem acentos). Ficaram de fora os
   que também são localidades, marcas ou palavras correntes (Maia, Rosa,
   Fátima, Mercedes, Luz, Paz, Glória, Vitória, Santiago). Só contam
   seguidos de outra palavra com maiúscula ("Marcio Santos"), para não
   apanhar marcas como Daikin ou Mitsubishi Electric. */
const NOMES = new Set(`ana antonio joao jose manuel maria francisco carlos paulo pedro luis luisa miguel rui nuno jorge ricardo tiago
diogo andre bruno david daniel fernando filipe goncalo hugo joaquim marco marcio mario nelson ricardo rodrigo sergio vitor vasco
alexandre alberto armando artur augusto bernardo cesar duarte eduardo emanuel fabio frederico gabriel gil guilherme henrique ivo
leonardo lourenco marcelo martim mauro norberto octavio orlando osvaldo raul renato rogerio romeu samuel simao telmo tomas valter
xavier afonso adriano agostinho alvaro amadeu americo anibal arnaldo baltazar benjamim caetano celso cristiano dinis domingos edgar
edson elias ernesto estevao fausto felix flavio gaspar gervasio gustavo helder horacio humberto inacio isaac jaime jeronimo joel
jonas julio leandro leonel lucas luciano manuel marcos mateus matias moises nicolau olavo patricio pascoal quim rafael reinaldo
roberto rolando ruben salvador saul silvio teodoro valdemar valentim vicente virgilio wilson zeferino
alice amelia andreia angela antonia aurora barbara beatriz bruna camila carla carolina catarina cecilia celia claudia cristina
daniela debora diana dulce edite elisa elsa emilia ester eva fernanda filipa flavia francisca gabriela helena ines irene isabel
isabela ivone jessica joana josefa julia juliana laura leonor leticia lia lidia liliana lucia madalena mafalda manuela marcia
margarida mariana marta matilde melissa micaela milena miriam monica natalia natacha noemia odete olga patricia paula raquel
rebeca regina rita sandra sara silvia simone sofia sonia susana tania teresa vanessa vera veronica yara zelia zulmira`.split(/\s+/));

function temNomePessoa(citacao) {
  const t = String(citacao || '');
  if (/(^|[^\p{L}])(dr|dra|eng|enga|eng\.ª|sr|sra|arq|prof|profª)\.?\s+\p{Lu}/iu.test(t)) return true;
  const palavras = t.split(/[^\p{L}]+/u).filter(Boolean);
  for (let i = 0; i < palavras.length - 1; i++) {
    const p = palavras[i];
    const seguinte = palavras[i + 1];
    if (/^\p{Lu}/u.test(p) && /^\p{Lu}/u.test(seguinte) && NOMES.has(normalizar(p))) return true;
  }
  return false;
}

/* Corta uma citação a 160 caracteres sem partir palavras: termina no fim
   de uma palavra inteira. Sem espaço onde cortar, devolve '' (descarta). */
function encurtarCitacao(c) {
  if (c.length <= 160) return c;
  const inicio = c.slice(0, 161);
  const fim = inicio.search(/\s\S*$/);
  return fim > 0 ? inicio.slice(0, fim).trimEnd() : '';
}

/* Contactos não são factos, são canais (e já estão em "canais"). Um
   telefone ou um email dentro de um facto ia parar a um email de
   outreach. "Orçamento gratuito" é um facto; "solicite o seu orçamento"
   é um pedido de contacto. */
function ehContacto(citacao) {
  const t = normalizar(citacao);
  // Telefone português: 9 dígitos a começar por 2 ou 9, em qualquer
  // agrupamento ("22 345 67 89", "910.000.406", "+351 910 000 406").
  const digitos = t.replace(/(\d)[ .](?=\d)/g, '$1');
  return /(^|\D)(351)?[29]\d{8}(?!\d)/.test(digitos)
    || /[\w.+-]+@[\w-]+\.[\w.]+/.test(t)
    || /\b(whatsapp|telefone|telemovel|telef\.?|tlm|e-mail|email)\b/.test(t)
    || /\b(ligue|ligue-nos|ligar|contacte|contacte-nos|contacta-nos|contactar|fale connosco|call us|contact us)\b/.test(t)
    || /\b(solicite|solicitar|peca|pedir|peca ja|request)\b[^.]{0,30}\b(orcamento|quote)/.test(t);
}

/* Idioma do texto do site, pelas palavras mais frequentes: "pt", "en"
   ou "misto". Serve ao outreach para decidir se parafraseia ou não. */
function idiomaDoTexto(texto) {
  const palavras = normalizar(texto).split(/[^a-z]+/);
  const PT = new Set(['de', 'da', 'do', 'das', 'dos', 'que', 'para', 'com', 'uma', 'nao', 'sao', 'em', 'os', 'as', 'no', 'na', 'ao', 'pelo', 'pela', 'mais', 'servicos']);
  const EN = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'our', 'we', 'are', 'of', 'to', 'is', 'in', 'on', 'services', 'from']);
  let pt = 0;
  let en = 0;
  for (const p of palavras) { if (PT.has(p)) pt++; if (EN.has(p)) en++; }
  if (pt + en < 10) return 'misto';
  return pt >= en * 2 ? 'pt' : en >= pt * 2 ? 'en' : 'misto';
}

/* Fica com o que a Claude disse sobre o site só quando se prova no
   texto enviado. Devolve os factos verificados e as contas do que saiu. */
function verificarFactos(fe, texto) {
  const contas = { pedidos: 0, verificados: 0, sem_citacao: 0, nome_pessoa: 0, contacto: 0, encurtadas: 0, encurtada_sem_prova: 0 };
  const alvo = normalizar(texto);
  const noTexto = (v) => !!normalizar(v) && alvo.includes(normalizar(v));
  const tipos = ['servico', 'prova', 'clientes', 'zona', 'diferenciador'];
  const factos = [];
  const pedidos = Array.isArray(fe && fe.factos) ? fe.factos.slice(0, 5) : [];
  contas.pedidos = pedidos.length;
  for (const x of pedidos) {
    let citacao = String((x && x.citacao) || '').trim();
    const comparar = citacao.replace(/[.,;:!?]+$/, '');
    if (!comparar || !noTexto(comparar)) { contas.sem_citacao++; continue; }
    if (temNomePessoa(citacao)) { contas.nome_pessoa++; continue; }
    if (ehContacto(citacao)) { contas.contacto++; continue; }
    // Acima de 160 caracteres, corta-se na última fronteira de palavra e
    // verifica-se de novo: só fica se a versão curta existir tal e qual no site.
    if (citacao.length > 160) {
      const curta = encurtarCitacao(citacao);
      if (!curta || !noTexto(curta.replace(/[.,;:!?]+$/, ''))) { contas.encurtada_sem_prova++; continue; }
      citacao = curta;
      contas.encurtadas++;
    }
    // Só o que foi provado viaja no bloco: a citação e o tipo, sem texto livre.
    factos.push({ id: String(x.id || ''), citacao, tipo: tipos.includes(x.tipo) ? x.tipo : 'diferenciador' });
  }
  contas.verificados = factos.length;

  const lista = (v, n) => (Array.isArray(v) ? v.filter((i) => typeof i === 'string' && noTexto(i)).slice(0, n).map((i) => curto(i, 80)) : []);
  const numero = (n) => (Number.isInteger(n) && new RegExp('(^|\\D)' + n + '(\\D|$)').test(texto) ? n : null);
  const p = (fe && fe.provas) || {};
  const c = (fe && fe.canais) || {};
  const canais = {};
  for (const k of ['telefone', 'whatsapp', 'formulario', 'email', 'marcacao_online', 'chat']) canais[k] = c[k] === true;

  /* Bloco versão 2: no topo só o que foi provado no texto do site.
     "indicativo" é a leitura da Claude, sem prova: os canais a false
     querem dizer "não vi no texto" (formulários e marcações em
     JavaScript não aparecem), e os clientes são uma classificação. Os
     juízos não saem daqui: nenhum email os deve usar. */
  return {
    contas,
    factos_email: {
      idioma_site: idiomaDoTexto(texto),
      factos,
      servicos: lista(fe && fe.servicos, 8),
      zona: typeof (fe && fe.zona) === 'string' && noTexto(fe.zona) ? curto(fe.zona, 120) : null,
      provas: { anos_atividade: numero(p.anos_atividade), projetos: numero(p.projetos), certificacoes: lista(p.certificacoes, 5), marcas: lista(p.marcas, 10) },
      indicativo: {
        canais,
        clientes: Array.isArray(fe && fe.clientes) ? fe.clientes.filter((i) => ['residencial', 'empresas', 'industria', 'publico'].includes(i)) : [],
      },
    },
  };
}

const curto = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
// Notion não aceita vírgulas em opções de seleção. Com lista na Config,
// só vale um nome da lista (sem olhar a maiúsculas).
function subNicho(valor) {
  const sub = curto(valor, 40).replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!sub) return '';
  return cfg.sub_nichos.length
    ? cfg.sub_nichos.find((s) => s.toLowerCase() === sub.toLowerCase()) || 'Outro'
    : sub[0].toUpperCase() + sub.slice(1);
}

/* Verificação pelo nome (lead sem site). Nunca bloqueia: se a Claude
   falhar ou responder mal, o lead segue como seguiria antes. */
if (lead.analise_tipo === 'nome') {
  const j = respostaValida && !cortada ? lerJson(r) : { ok: false };
  if (!j.ok || typeof j.valor !== 'object' || j.valor === null) {
    return { json: { ...lead, verificado_nome: false } };
  }
  return {
    json: {
      ...lead,
      _uso: uso,
      verificado_nome: true,
      no_nicho: j.valor.no_nicho !== false,
      sub_nicho: subNicho(j.valor.sub_nicho),
      motivo_nome: curto(j.valor.motivo, 120),
    },
  };
}

if (!respostaValida) {
  return reanalisar('Erro na chamada à Claude: ' + mensagemErro(r.error || r));
}
if (cortada) {
  return reanalisar('Resposta da Claude cortada (max_tokens)');
}

const lido = lerJson(r);
if (!lido.ok || typeof lido.valor !== 'object' || lido.valor === null) {
  return reanalisar('JSON inválido da Claude: ' + lido.bruto.slice(0, 120));
}
const p = lido.valor;
const score = Math.round(Number(p.score));
const { contas, factos_email } = verificarFactos(p.factos_email, String(lead.site_texto || '').trim());
// Prova de sociedade, detetada em código ao ler o site; sem prova, o campo não existe.
if (lead.entidade && lead.entidade.citacao) factos_email.entidade = lead.entidade;

/* Sinais: os do site só ficam se o facto ficou ou o canal existe; os
   do Google (rating, avaliações) ficam sempre. Aceita também o formato
   antigo (lista de frases), que não diz de onde vem. */
const ids = new Set(factos_email.factos.map((x) => x.id));
const canais = factos_email.indicativo.canais;

/* Um sinal sobre um canal tem de bater com o valor do canal: "Sem
   WhatsApp" com whatsapp true, ou "Tem formulário" com formulario
   false, saem. Só se olha para a palavra do canal; se o sinal não a
   tiver, fica. */
const PALAVRAS_CANAL = {
  telefone: 'telefone|telefonico', whatsapp: 'whatsapp', formulario: 'formulario', email: 'e-?mail',
  marcacao_online: 'marcac(?:ao|oes)|agendamento|reserva', chat: 'chat',
};
function sinalCoerente(texto, canal) {
  const t = normalizar(texto);
  const palavra = PALAVRAS_CANAL[canal];
  if (!palavra || !new RegExp('\\b(' + palavra + ')').test(t)) return true;
  const negado = new RegExp('\\b(sem|nao tem|nao ha|nenhum|nenhuma)\\b[^.,;|]{0,30}\\b(' + palavra + ')').test(t);
  return negado ? canais[canal] === false : canais[canal] === true;
}
const provado = (x) => x.origem === 'google'
  || (x.origem === 'facto' && ids.has(x.ref))
  || (x.origem === 'canal' && x.ref in canais && sinalCoerente(x.texto, x.ref));
const brutos = Array.isArray(p.sinais) ? p.sinais : [];
const sinais = brutos
  .map((x) => (typeof x === 'string' ? { texto: x, origem: 'antigo' } : x || {}))
  .filter((x) => typeof x.texto === 'string' && x.texto.trim() && (x.origem === 'antigo' || provado(x)))
  .slice(0, 5)
  .map((x) => x.texto.trim().slice(0, 120));
contas.sinais_cortados = brutos.length - sinais.length;

// A dor tem de apontar para um facto verificado ou um canal; senão fica vazia.
const d = p.dor_provavel;
const dor = typeof d === 'string' ? curto(d, 200)
  : d && (ids.has(d.ref) || (d.ref in canais && sinalCoerente(d.texto, d.ref))) ? curto(d.texto, 200) : '';

return {
  json: {
    ...lead,
    analise_ok: true,
    no_nicho: p.no_nicho !== false,
    sub_nicho: subNicho(p.sub_nicho),
    score: score >= 1 && score <= 10 ? score : null,
    sinais,
    dor_provavel: dor,
    resumo: curto(p.resumo, 300),
    factos_email,
    _factos: contas,
    _uso: uso,
    _modelo: claude_body && claude_body.model,
  },
};
