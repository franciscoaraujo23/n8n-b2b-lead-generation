// @comum
/* Preparar análise — corre por lead, depois de juntar os leads com
   e sem website. Três saídas:

   - texto de site que se aproveite → análise completa (score, sinais);
   - sem texto, com `verificar_sem_site` → pergunta curta à Claude, só
     com nome, morada e categoria: é do nicho ou não? Sem isto, quem
     não tem site entrava no CRM sem filtro nenhum (oficinas e
     alojamento local no nicho de climatização, 13/10/2026);
   - de resto → não vai à Claude. */

/* A Claude é chamada pela OpenRouter (formato de chat da OpenAI), com o
   mesmo modelo e o mesmo preço da Anthropic (29/10/2026). Raciocínio
   desligado: extrair factos de um texto não ganha nada com ele, e ele
   gastava o max_tokens (respostas cortadas, 23/10/2026). */
const MODELO = 'anthropic/claude-sonnet-5';

const corpoPedido = (cfg, conteudo, maxTokens, esquema) => ({
  model: MODELO,
  max_tokens: maxTokens,
  reasoning: { enabled: false },
  ...(esquema ? { response_format: { type: 'json_schema', json_schema: { name: 'analise_lead', strict: true, schema: esquema } } } : {}),
  usage: { include: true },
  user: cfg.customer_id || 'leadgen',
  messages: [{ role: 'user', content: conteudo }],
});

/* Usados quando a Config não traz `criterios_score`. São os de
   clínicas, o primeiro nicho: deixar vazio não muda nada para o Bruno. */
const CRITERIOS_PADRAO = `- Sobe: marcações por telefone/WhatsApp/formulário manual; vários serviços ou várias moradas; procura visível (promoções, campanhas, muitas avaliações); equipa pequena/média que atende ela própria.
- Desce: já tem marcação online + lembretes + chat automáticos; grande cadeia com sistemas próprios; site abandonado; pouco a ver com o nicho.`;

const cfg = $('Config ativa').first().json;
const criterios = cfg.criterios_score || CRITERIOS_PADRAO;
const lead = $json;
const texto = String(lead.site_texto || '').trim();

const listaSub = cfg.sub_nichos.length ? '<exatamente um destes: ' + cfg.sub_nichos.join(' | ') + '>' : '<2 a 4 palavras, genérico>';

if (!cfg.enrich || texto.length < 200) {
  if (!cfg.enrich || !cfg.verificar_sem_site) {
    return { json: { ...lead, site_ok: false, vai_a_claude: false } };
  }
  const promptNome = `Classificação rápida para prospeção B2B. Nicho pesquisado: "${cfg.nicho}".
Este negócio não tem website legível. Decide, APENAS pelo nome, morada e categoria do Google Maps, se é do nicho.

REGRAS:
- A categoria do Google é muitas vezes genérica ou imprecisa (ex.: "Empreiteira", "Serviços", "Escritório da empresa"). Nunca exclui sozinha: decide sobretudo pelo nome.
- Se o nome indicar a atividade do nicho, "no_nicho" é true, mesmo que a categoria diga outra coisa.
- "no_nicho" é false só quando o negócio é claramente de outro tipo (ex.: alojamento local, oficina automóvel, restaurante, loja de eletrodomésticos).
- Na dúvida, true.
- Responde APENAS com JSON válido, sem markdown.

Formato exato:
{"no_nicho": true|false, "sub_nicho": "${listaSub}", "motivo": "<máx. 100 caracteres>"}

Nome: ${lead.nome}
Morada: ${lead.morada}
Categoria no Google Maps: ${lead.tipo_google || 'desconhecida'}`;

  return {
    json: {
      ...lead,
      site_ok: false,
      vai_a_claude: true,
      analise_tipo: 'nome',
      claude_body: corpoPedido(cfg, promptNome, 300, null),
    },
  };
}

/* Esquema da resposta (structured outputs): a API garante JSON válido
   neste formato, por isso deixa de haver "JSON inválido da Claude".
   Os limites de tamanho não cabem no esquema: são verificados no nó
   seguinte, junto com as citações. */
/* Com o esquema (structured outputs) a API garante o JSON, mas acrescenta
   ~2700 tokens de entrada por lead (medido a 23/10/2026). Sem ele, o
   formato vai descrito no prompt e o nó seguinte tolera desvios. */
const COM_ESQUEMA = true;
const FORMATO = '{"no_nicho": true|false, "sub_nicho": "' + listaSub + '", "score": <inteiro 1-10>, "sinais": [{"texto": "...", "origem": "facto|canal|google", "ref": "f1|<campo de canais>|"}], "dor_provavel": {"texto": "...", "ref": "..."}, "resumo": "...", "factos_email": {"factos": [{"id": "f1", "citacao": "...", "tipo": "servico|prova|clientes|zona|diferenciador"}], "servicos": ["..."], "clientes": ["residencial|empresas|industria|publico"], "zona": "..."|null, "provas": {"anos_atividade": <n>|null, "projetos": <n>|null, "certificacoes": ["..."], "marcas": ["..."]}, "canais": {"telefone": true|false, "whatsapp": true|false, "formulario": true|false, "email": true|false, "marcacao_online": true|false, "chat": true|false}, "juizos": ["..."]}}';

const textoOuNulo = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const inteiroOuNulo = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const listaTexto = { type: 'array', items: { type: 'string' } };
const objeto = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
/* A ordem conta: a resposta é escrita por esta ordem, por isso as
   decisões (nicho, score) vêm no fim, depois de ler os factos. Com o
   no_nicho à cabeça, a Claude chegou a responder true a uma loja de
   telecomunicações e a dizer no resumo que não era do nicho (29/10). */
const ESQUEMA = objeto({
  factos_email: objeto({
    factos: { type: 'array', items: objeto({ id: { type: 'string' }, citacao: { type: 'string' }, tipo: { type: 'string', enum: ['servico', 'prova', 'clientes', 'zona', 'diferenciador'] } }) },
    servicos: listaTexto,
    clientes: { type: 'array', items: { type: 'string', enum: ['residencial', 'empresas', 'industria', 'publico'] } },
    zona: textoOuNulo,
    provas: objeto({ anos_atividade: inteiroOuNulo, projetos: inteiroOuNulo, certificacoes: listaTexto, marcas: listaTexto }),
    canais: objeto({ telefone: { type: 'boolean' }, whatsapp: { type: 'boolean' }, formulario: { type: 'boolean' }, email: { type: 'boolean' }, marcacao_online: { type: 'boolean' }, chat: { type: 'boolean' } }),
    juizos: listaTexto,
  }),
  sinais: { type: 'array', items: objeto({ texto: { type: 'string' }, origem: { type: 'string', enum: ['facto', 'canal', 'google'] }, ref: { type: 'string' } }) },
  dor_provavel: objeto({ texto: { type: 'string' }, ref: { type: 'string' } }),
  resumo: { type: 'string' },
  sub_nicho: cfg.sub_nichos.length ? { type: 'string', enum: cfg.sub_nichos } : { type: 'string' },
  score: { type: 'integer' },
  no_nicho: { type: 'boolean', description: 'true se o negócio é do nicho pesquisado; false só se o site mostra claramente que não é' },
});

const prompt = `Analisa este negócio para prospeção B2B de uma agência portuguesa de automação com IA (marcações, lembretes, follow-up, atendimento por WhatsApp/telefone, CRM).
Nicho pesquisado: "${cfg.nicho}".

A resposta serve dois leitores:
- o comercial, que lê "sinais", "dor_provavel" e "resumo" para decidir se liga;
- um email de primeiro contacto, que só pode usar "factos_email": factos concretos que o próprio site mostra.

REGRAS OBRIGATÓRIAS:
1. Baseia-te APENAS no texto do website abaixo. Não uses conhecimento externo sobre a marca.
2. Nunca inventes serviços, preços, equipa, horários ou números.
3. "factos_email.factos": no máximo 5. Cada facto é positivo ou neutro e diretamente visível no site: um serviço, uma prova (anos, obras, certificações, marcas), o tipo de clientes, a zona que servem, ou o que os distingue. Nada de ausências ("não tem…") nem de juízos ("site desatualizado").
   - "citacao": a frase do site que prova o facto, copiada letra a letra do texto abaixo, sem corrigir nada, com no máximo 160 caracteres. Se não houver frase que o prove, o facto não entra.
   - Nunca uses frases com nomes de pessoas (ex.: "fale com o João Silva").
   - Contactos (telefone, email, WhatsApp, "ligue-nos", "peça orçamento") não são factos: vão para "canais".
   - "id": f1, f2, f3…
4. "servicos", "certificacoes" e "marcas": nas palavras exatas do site. "zona": como o site a escreve, ou null. "anos_atividade" e "projetos": só se o site disser o número.
5. "canais": true só se o site mostrar esse canal (telefone, WhatsApp, formulário de contacto, email, marcação ou orçamento online, chat). As ausências ficam aqui, como false, e não em frases.
6. "juizos": as tuas apreciações de qualificação (ex.: "site com pouca informação"). Ficam à parte; nunca vão para um email.
7. "sinais": no máximo 5, cada um com 90 caracteres no máximo, para o comercial. Cada sinal diz de onde vem:
   - origem "facto" e ref = id do facto que o prova;
   - origem "canal" e ref = nome do campo em "canais" (ex.: "marcacao_online"), para sinais sobre canais, incluindo ausências;
   - origem "google" e ref = "", só para o rating e o número de avaliações.
   Sinais sem facto ou canal que os prove não entram.
8. "dor_provavel": uma frase, máx. 160 caracteres, sobre o processo manual que lhes consome tempo, específica deste negócio. "ref" = id do facto ou nome do canal em que se baseia. Se não houver nada específico, texto e ref vazios: nunca uma frase genérica.
9. "resumo": 1 frase, máx. 200 caracteres: porque é ou não um bom lead.
10. "no_nicho" é false só se o site mostrar claramente que o negócio NÃO é do nicho pesquisado (ex.: cabeleireiro quando se pesquisou clínica de estética).

CRITÉRIOS DO SCORE (1 a 10):
${criterios}

${COM_ESQUEMA ? 'Sub-nicho: ' + listaSub : 'Responde APENAS com JSON válido, sem markdown, sem texto antes ou depois, neste formato exato:\n' + FORMATO}

Dados do negócio:
Nome: ${lead.nome}
Morada: ${lead.morada}
Website: ${lead.website}
Rating: ${lead.rating ?? 'sem rating'} (${lead.n_reviews ?? 0} avaliações)

Texto do website:
${texto}`;

return {
  json: {
    ...lead,
    site_ok: true,
    vai_a_claude: true,
    analise_tipo: 'site',
    claude_body: corpoPedido(cfg, prompt, 3000, COM_ESQUEMA ? ESQUEMA : null),
  },
};
