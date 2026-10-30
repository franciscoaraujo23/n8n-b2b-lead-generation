/* ---------------------------------------------------------------
   Funções partilhadas pelos nós Code do Lead Gen.

   O construtor injeta este ficheiro no início de cada nó que o pede:
   o n8n não tem imports entre nós, e copiar à mão estas funções para
   quatro sítios garantia que, mais tarde, ficavam diferentes.
   --------------------------------------------------------------- */

/* Hosts que o Google devolve como "website" mas que não são o site
   do negócio. Não se lêem (não há texto útil, ou bloqueiam), não
   contam para deduplicar por domínio (todos os negócios com só
   Facebook ficariam "filiais" uns dos outros) e vão para a coluna
   "Rede social". */
const PLATAFORMAS = [
  // redes sociais
  'facebook.com', 'fb.com', 'instagram.com', 'tiktok.com', 'linkedin.com',
  'youtube.com', 'twitter.com', 'x.com', 'linktr.ee', 'wa.me', 'whatsapp.com',
  // plataformas de marcação / lojas
  'fresha.com', 'booksy.com', 'treatwell.pt', 'treatwell.com', 'zappysoftware.com',
  'sumupstore.com', 'sumup.com', 'calendly.com', 'doctoralia.pt', 'setmore.com',
  'square.site', 'buk.pt', 'noona.app',
  // diretórios e agregadores
  'escolasconducao.com', 'testesdecodigogratis.com', 'paginasamarelas.pt',
  'google.com', 'goo.gl', 'g.page', 'business.site',
  'racius.com', 'einforma.pt', 'iberinform.pt', 'heylink.me',
  // alojamento local (anúncios que o Google mostra como "site")
  'holidu.com', 'holidu.pt', 'bluepillow.com', 'freecancellations.com',
  'booking.com', 'airbnb.com', 'airbnb.pt', 'vrbo.com',
];

/* Emails que aparecem em sites mas não são do negócio: telemetria,
   construtores de sites, exemplos de formulário. */
const EMAILS_LIXO = [
  'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com', 'wix.com',
  'example.com', 'exemplo.com', 'exemplo.pt', 'domain.com', 'email.com',
  'yourdomain.com', 'seudominio.com', 'godaddy.com', 'cloudflare.com',
];

/* Hostname sem "www.", sem depender de URL (o sandbox do n8n nem
   sempre o expõe). '' se não houver nada que pareça um host. */
function hostDe(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  return s
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/)[0]
    .split('@').pop()
    .split(':')[0]
    .toLowerCase()
    .replace(/^www\./, '');
}

function ehPlataforma(host) {
  return !!host && PLATAFORMAS.some((p) => host === p || host.endsWith('.' + p));
}

/* Tira parâmetros de tracking que o Google Business acrescenta
   (?utm_source=...), para o URL guardado ser o do site. */
function limparUrl(url) {
  const s = String(url || '').trim();
  if (!s.includes('?')) return s;
  const [base, resto] = s.split('?');
  const [query, hash] = resto.split('#');
  const fica = query
    .split('&')
    .filter((p) => p && !/^(utm_[a-z]+|fbclid|gclid|igshid|ref|locale)=/i.test(p));
  return base + (fica.length ? '?' + fica.join('&') : '') + (hash ? '#' + hash : '');
}

/* Chave para comparar telefones: os últimos 9 dígitos de um número
   português. "22 123 4567", "+351 22 123 4567" e "+351221234567"
   dão todos "221234567". '' se não for comparável. */
function chaveTelefone(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('351') && d.length === 12) d = d.slice(3);
  return d.length === 9 ? d : '';
}

/* Formato único guardado no Notion: +351XXXXXXXXX para PT, +<dígitos>
   para estrangeiros. Mantém o que veio se não se perceber. */
function normalizarTelefone(tel) {
  const s = String(tel || '').trim();
  if (!s) return '';
  const pt = chaveTelefone(s);
  if (pt && /^[29]/.test(pt)) return '+351' + pt;
  const d = s.replace(/\D/g, '');
  if (s.startsWith('+')) return '+' + d;
  if (d.startsWith('00')) return '+' + d.slice(2);
  return s;
}

function emailValido(e) {
  if (typeof e !== 'string' || e.length > 100) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e)) return false;
  if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e)) return false;
  const dominio = e.split('@')[1].toLowerCase();
  return !EMAILS_LIXO.some((d) => dominio === d || dominio.endsWith('.' + d));
}

/* Entidades HTML → caracteres: numéricas (&#233; &#xE9;) e as nomeadas
   que aparecem em sites portugueses. Não mexe em maiúsculas nem acentos
   (só os escreve como caracteres: &Eacute; → É). */
const ENTIDADES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', Agrave: 'À', acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  ordm: 'º', ordf: 'ª', deg: '°', euro: '€', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•',
};
function decodificarEntidades(t) {
  return String(t || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES, e) ? ENTIDADES[e] : m;
  });
}

function htmlParaTexto(html) {
  return decodificarEntidades(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/* O Jina Reader devolve markdown com um cabeçalho (Title/URL Source).
   Fica só o texto: imagens fora, links reduzidos ao texto. */
/* ---------------------------------------------------------------
   Prova de sociedade (pessoa coletiva), para o outreach: um lead com
   email gratuito só recebe a sequência completa se o site provar que é
   uma sociedade. Detetado em código, no texto do site já lido (antes do
   corte para a Claude, porque o rodapé fica no fim da página).

   Um falso positivo é o erro grave (uma pessoa singular receberia a
   sequência sem base legal), por isso:
   - a forma (Lda, Unipessoal, S.A., "…, Limitada", "Sociedade por
     Quotas"…) só conta como palavra isolada e logo a seguir a uma
     palavra distintiva do nome do lead ou do domínio do site; nunca em
     créditos ("desenvolvido por X, Lda") nem em marcas de terceiros;
   - o NIF só conta com rótulo (NIF, NIPC, Contribuinte, VAT) ou prefixo
     PT, 9 dígitos começados por 5 e dígito de controlo válido;
   - a citação é o excerto literal do texto e prova tudo o que se afirma.
   --------------------------------------------------------------- */
const PALAVRAS_GENERICAS = new Set(('clima climatizacao condicionado obras remodelacoes remodelacao construcao construcoes ' +
  'reparacoes reparacao servicos solucoes engenharia tecnica tecnicas energia energias assistencia manutencao instalacoes ' +
  'casa casas unipessoal limitada sociedade porto lisboa norte portugal grupo empresa clinica estetica beleza centro ' +
  'studio estudio caixilharia janelas aquecimento online site www').split(' '));
const CREDITOS = /desenvolvid|developed|powered|design|criad[oa]s? por|feito por|alojamento|hosting|parceir|distribuidor|representante|marca registada/i;
const RELACAO = /\b(com|para|por|grupo|trabalha\w*|representa\w*|cliente\w*|fornece\w*|marca\w*|parceir\w*|distribui\w*)\b/;
const soLetras = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function palavrasDoLead(lead) {
  const host = hostDe(lead.website || '');
  const etiqueta = host ? host.split('.')[0].replace(/-/g, '') : '';
  const doNome = soLetras(lead.nome).split(/[^a-z0-9]+/);
  return [...new Set([...doNome, etiqueta])].filter((p) => p.length >= 4 && !PALAVRAS_GENERICAS.has(p));
}

function nifColetivoValido(digitos) {
  if (!/^5\d{8}$/.test(digitos)) return false;
  const d = digitos.split('').map(Number);
  const r = d.slice(0, 8).reduce((a, x, i) => a + x * (9 - i), 0) % 11;
  return (r < 2 ? 0 : 11 - r) === d[8];
}

function nifsColetivos(texto) {
  const out = [];
  const re = /(?:\b(?:nif|nipc|contribuinte|vat)\b|n\.?\s?i\.?\s?p\.?\s?c\.?)[^0-9\n]{0,25}?(?:pt\s?)?(\d{3}[ .]?\d{3}[ .]?\d{3})(?!\d)|\bPT\s?(\d{3}[ .]?\d{3}[ .]?\d{3})(?!\d)/gi;
  let m;
  while ((m = re.exec(texto))) {
    const digitos = (m[1] || m[2]).replace(/[ .]/g, '');
    if (nifColetivoValido(digitos)) out.push({ inicio: m.index, fim: m.index + m[0].length });
  }
  return out;
}

function detetarEntidade(texto, lead) {
  const t = String(texto || '');
  if (!t) return null;
  const palavras = palavrasDoLead(lead || {});
  const nifs = nifsColetivos(t).filter((n) => !CREDITOS.test(t.slice(Math.max(0, n.inicio - 60), n.inicio)));
  const FORMAS = [
    [/(?<![\p{L}\d])unipessoal(?:,?\s+(?:lda\.?|limitada))?(?![\p{L}\d])/giu, 'Unipessoal'],
    [/(?<![\p{L}\d])sociedade\s+unipessoal(?![\p{L}\d])/giu, 'Unipessoal'],
    [/(?<![\p{L}\d])(?:lda\.?|l\.da)(?![\p{L}\d])/giu, 'Lda'],
    [/,\s*limitada(?![\p{L}\d])/giu, 'Lda'],
    [/(?<![\p{L}\d])sociedade\s+por\s+quotas(?![\p{L}\d])/giu, 'Lda'],
    [/(?<![\p{L}\d])S\.\s?A\.(?![\p{L}\d])/gu, 'S.A.'],
    [/(?<![\p{L}\d])sociedade\s+an[oó]nima(?![\p{L}\d])/giu, 'S.A.'],
  ];
  let melhor = null;
  if (palavras.length) {
    for (const [re, forma] of FORMAS) {
      let m;
      while ((m = re.exec(t))) {
        // O nome do lead tem de vir logo antes da forma, sem "com", "para",
        // "representa"… pelo meio ("Clima Beta trabalha com a Daikin, S.A." não conta).
        // Emails e endereços não contam como nome ("geral@tecexemplo.pt Empresa do Grupo X, Lda").
        const antes = t.slice(Math.max(0, m.index - 45), m.index).replace(/\S+@\S+|https?:\/\/\S+|www\.\S+/gi, ' ');
        if (CREDITOS.test(t.slice(Math.max(0, m.index - 80), m.index))) continue;
        const norm = soLetras(antes);
        const juntas = norm.replace(/[^a-z0-9]/g, '');
        const p = palavras.find((x) => juntas.includes(x));
        if (!p) continue;
        const pos = norm.lastIndexOf(p);
        const entre = pos >= 0 ? norm.slice(pos + p.length) : norm;
        if (RELACAO.test(entre)) continue;
        if (!melhor || m.index < melhor.inicio) melhor = { forma, inicio: m.index, fim: m.index + m[0].length };
      }
    }
  }
  if (melhor) {
    // Citação: do princípio da palavra uns 60 caracteres antes até ao fim da forma.
    let ini = Math.max(0, melhor.inicio - 60);
    if (ini > 0) ini = t.indexOf(' ', ini) + 1 || ini;
    let fim = melhor.fim;
    // Se um NIF válido vier logo a seguir, entra na mesma citação.
    const nifPerto = nifs.find((n) => n.inicio >= melhor.fim && n.fim - ini <= 160);
    if (nifPerto) fim = nifPerto.fim;
    return { forma: melhor.forma, nif_coletivo: !!nifPerto, citacao: t.slice(ini, fim).trim() };
  }
  if (nifs.length) return { forma: null, nif_coletivo: true, citacao: t.slice(nifs[0].inicio, nifs[0].fim).trim() };
  return null;
}

function markdownParaTexto(md) {
  const s = String(md || '');
  const corpo = s.includes('Markdown Content:') ? s.split('Markdown Content:').slice(1).join(' ') : s;
  return corpo
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Email do negócio: mailto primeiro, depois texto. Entre vários,
   prefere um do mesmo domínio do site (geral@clinica.pt ganha a
   um gmail de um formulário embebido). */
function extrairEmail(bruto, texto, hostSite) {
  const candidatos = [];
  const reMailto = /mailto:([^"'?\s)<>]+)/gi;
  let m;
  while ((m = reMailto.exec(String(bruto || '')))) candidatos.push(decodeURIComponent(m[1]));
  const reTexto = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
  while ((m = reTexto.exec(String(texto || '')))) candidatos.push(m[0]);
  const validos = [...new Set(candidatos.map((e) => e.trim().toLowerCase()))].filter(emailValido);
  if (!validos.length) return '';
  const raiz = String(hostSite || '').split('.').slice(-2).join('.');
  return validos.find((e) => raiz && (e.endsWith('@' + raiz) || e.endsWith('.' + raiz))) || validos[0];
}

function extrairTelefone(bruto, texto) {
  const mTel = String(bruto || '').match(/tel:([+0-9\s().-]{9,})/i);
  if (mTel && chaveTelefone(mTel[1])) return normalizarTelefone(mTel[1]);
  const t = String(texto || '');
  const m351 = t.match(/\+351[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}/);
  if (m351 && chaveTelefone(m351[0])) return normalizarTelefone(m351[0]);
  const mPt = t.match(/\b[29]\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/);
  if (mPt && chaveTelefone(mPt[0])) return normalizarTelefone(mPt[0]);
  return '';
}

/* Link para a página de contactos do próprio site, se houver. */
function paginaContactos(html, website) {
  const origem = (String(website || '').match(/^(https?:\/\/[^/?#]+)/i) || [])[1];
  if (!origem) return '';
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const href = m[1].trim();
    if (!/contact|contato|contacto/i.test(href) || /^(mailto|tel|javascript):/i.test(href)) continue;
    let abs;
    if (/^https?:\/\//i.test(href)) abs = href;
    else if (href.startsWith('//')) abs = 'https:' + href;
    else if (href.startsWith('/')) abs = origem + href;
    else abs = origem + '/' + href;
    if (hostDe(abs) === hostDe(website)) return abs;
  }
  return '';
}

/* ---------------------------------------------------------------
   Células (termo × retângulo da localidade)

   O Text Search só aceita retângulos em `locationRestriction`, por
   isso a grelha é de retângulos, não de círculos. A chave identifica
   a célula de forma estável: estado|nicho|cidade|termo|caminho, em
   que o caminho cresce a cada subdivisão ("0-1" → "0-1.2").
   --------------------------------------------------------------- */
const COLUNAS_CELULA = ['chave', 'crm', 'nicho', 'cidade', 'termo', 'sul', 'oeste', 'norte', 'este', 'nivel', 'estado', 'resultados', 'novos', 'atualizada'];
const COLUNAS_PLACE = ['place_id', 'crm', 'nicho', 'cidade', 'termo', 'estado', 'motivo', 'nome', 'atualizado'];

/* Uma Data Table recusa colunas que não existem: só passam estas. */
function soColunas(obj, colunas) {
  const r = {};
  for (const c of colunas) if (obj[c] !== undefined) r[c] = obj[c];
  return r;
}

function novaCelula(cfg, termo, caminho, nivel, ret, agora) {
  return {
    chave: [cfg.estado_chave, cfg.nicho, cfg.cidade_chave, termo, caminho].join('|'),
    crm: cfg.estado_chave,
    nicho: cfg.nicho,
    cidade: cfg.cidade_chave,
    termo,
    sul: ret.sul, oeste: ret.oeste, norte: ret.norte, este: ret.este,
    nivel,
    estado: 'pendente',
    resultados: 0,
    novos: 0,
    atualizada: agora,
  };
}

/* Quatro quadrantes de uma célula: [sufixo, retângulo]. */
function quadrantes(c) {
  const mLat = (c.sul + c.norte) / 2;
  const mLng = (c.oeste + c.este) / 2;
  return [
    ['0', { sul: c.sul, norte: mLat, oeste: c.oeste, este: mLng }],
    ['1', { sul: c.sul, norte: mLat, oeste: mLng, este: c.este }],
    ['2', { sul: mLat, norte: c.norte, oeste: c.oeste, este: mLng }],
    ['3', { sul: mLat, norte: c.norte, oeste: mLng, este: c.este }],
  ];
}

function linhaPlace(cfg, place_id, termo, estado, motivo, nome, agora) {
  return { place_id, crm: cfg.estado_chave, nicho: cfg.nicho, cidade: cfg.cidade_chave, termo: termo || '', estado, motivo: motivo || '', nome: nome || '', atualizado: agora };
}

/* Mensagem curta: "403 Forbidden" em vez do HTML inteiro da página de
   erro que o n8n mete na mensagem. */
function mensagemErro(err) {
  if (!err) return '';
  const msg = typeof err === 'string' ? err : String(err.message || err.description || JSON.stringify(err));
  const codigo = msg.match(/^(\d{3})\b/);
  if (codigo) {
    const titulo = msg.match(/<title>([^<]*)<\/title>/i);
    const notion = msg.match(/\\"message\\":\\"([^\\]*)/);
    return codigo[1] + (titulo ? ' ' + titulo[1].trim() : notion ? ' ' + notion[1] : '');
  }
  return msg.slice(0, 300);
}
/* --------------------------- fim do comum --------------------------- */
