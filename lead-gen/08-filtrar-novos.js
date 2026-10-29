// @comum
/* Filtrar novos — recebe os detalhes do Google (um item por ID da fila)
   e deixa passar só o que deve ir para o CRM. Corre ANTES de ler sites
   e de chamar a Claude: não se paga análise a quem vai ser descartado.

   - Place ID já no CRM (ou repetido nesta execução) → descartado.
     (A fila já filtra isto; fica como rede de segurança.)
   - Mesmo domínio ou telefone de um lead existente → passa, mas com
     "Filial de" preenchido. Franquias podem ter donos diferentes;
     a decisão de ligar ou não é do comercial, não do workflow.
   - Negócio fechado no Google → descartado.
   - Categoria do Google na lista `tipos_excluir` da Config (ex.: oficina,
     alojamento) → descartado. Apanha também quem não tem site, que de
     outra forma só seria filtrado pela verificação pelo nome.
   - Pedido de detalhes falhado → fica na fila para a próxima.

   Se não sobrar nenhum, devolve um único item-sentinela para o
   resumo final correr na mesma e dizer porquê. */

const crm = $('Índice do CRM').first().json;
const cfg = $('Config ativa').first().json;
const excluir = new Set(cfg.tipos_excluir || []);
const entrada = $input.all().map((i) => i.json);
const places = entrada.length === 1 && Array.isArray(entrada[0].places)
  ? entrada[0].places
  : entrada.filter((j) => j.id && !j._falhou_detalhe);

const stats = {
  crm_total: crm.total,
  encontrados: places.length,
  fechados: [],
  excluidos_tipo: [],
  ja_no_crm: [],
  filiais: [],
  detalhes_falhados: entrada.filter((j) => j._falhou_detalhe).map((j) => `${j.place_id}: ${j.erro}`),
  novos: 0,
  // Para a Data Table: o que já foi decidido sobre cada ID.
  descartados_ids: [],
};

const run = { placeIds: new Set(), dominios: {}, telefones: {} };
const novos = [];

for (const p of places) {
  const nome = (p.displayName && p.displayName.text) || '';
  const termo = p._termo || '';

  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') {
    stats.fechados.push(nome);
    stats.descartados_ids.push({ place_id: p.id, termo, nome, motivo: 'fechado no Google', estado: 'descartado' });
    continue;
  }
  const tipos = [p.primaryType, ...(Array.isArray(p.types) ? p.types : [])].filter(Boolean).map((t) => String(t).toLowerCase());
  const tipoExcluido = tipos.find((t) => excluir.has(t));
  if (tipoExcluido) {
    stats.excluidos_tipo.push(`${nome} (${tipoExcluido})`);
    stats.descartados_ids.push({ place_id: p.id, termo, nome, motivo: 'categoria excluída: ' + tipoExcluido, estado: 'descartado' });
    continue;
  }
  if (!p.id || crm.placeIds[p.id] !== undefined || run.placeIds.has(p.id)) {
    stats.ja_no_crm.push(nome);
    if (p.id) stats.descartados_ids.push({ place_id: p.id, termo, nome, motivo: 'já no CRM', estado: 'processado' });
    continue;
  }
  run.placeIds.add(p.id);

  const url = limparUrl(p.websiteUri || '');
  const host = hostDe(url);
  const plataforma = ehPlataforma(host);
  const website = host && !plataforma ? url : '';
  const rede_social = plataforma ? url : '';

  const telefone = normalizarTelefone(p.internationalPhoneNumber || p.nationalPhoneNumber || '');
  const kTel = chaveTelefone(telefone);
  const kDom = website ? host : '';

  const filial_de =
    (kDom && (crm.dominios[kDom] || run.dominios[kDom])) ||
    (kTel && (crm.telefones[kTel] || run.telefones[kTel])) ||
    '';
  if (filial_de) stats.filiais.push(`${nome} → ${filial_de}`);
  if (kDom && !run.dominios[kDom]) run.dominios[kDom] = nome;
  if (kTel && !run.telefones[kTel]) run.telefones[kTel] = nome;

  novos.push({
    place_id: p.id,
    termo,
    nome,
    morada: p.formattedAddress || '',
    website,
    rede_social,
    telefone,
    email: '',
    rating: typeof p.rating === 'number' ? p.rating : null,
    n_reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    // Categoria legível (ex.: "Eletricista"); ajuda a Claude quando não há site.
    tipo_google: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || p.primaryType || '',
    filial_de,
  });
}

stats.novos = novos.length;

if (!novos.length) return [{ json: { _sem_novos: true, _stats: stats } }];
return novos.map((l) => ({ json: { ...l, _sem_novos: false, _stats: stats } }));
