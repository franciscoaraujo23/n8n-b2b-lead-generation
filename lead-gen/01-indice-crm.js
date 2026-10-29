// @comum
/* Índice do CRM — corre UMA vez, no arranque.

   Junta numa só peça tudo o que é preciso para não repetir trabalho:
   - do Notion: Place ID, domínio e telefone de cada lead (duplicados
     e filiais);
   - da Data Table leadgen_places: IDs já vistos e a fila de IDs à
     espera de detalhes;
   - da Data Table leadgen_celulas: as células desta localidade.

   Se o Notion falhar, PÁRA (devolve { _parar }: o workflow liberta o
   lock e pára com a mensagem). Um índice vazio faria tudo parecer novo
   e enchia o CRM de duplicados — exatamente o que estamos a corrigir. */

const cfg = $('Config ativa').first().json;
const idx = { placeIds: {}, dominios: {}, telefones: {}, total: 0, vistos: {}, fila: [], celulas: [], termos_sem_celulas: [] };

for (const pagina of $input.all()) {
  const r = pagina.json;
  if (r.error || !Array.isArray(r.results)) {
    return [{ json: { _parar: 'Não consegui ler o CRM no Notion — paro para não criar duplicados. ' + mensagemErro(r.error) } }];
  }
  for (const p of r.results) {
    const pr = p.properties || {};
    const txt = (k) => ((pr[k] && (pr[k].rich_text || pr[k].title)) || []).map((t) => t.plain_text).join('').trim();
    const empresa = txt('Empresa') || '(sem nome)';
    idx.total++;

    const pid = txt('Place ID');
    if (pid) idx.placeIds[pid] = empresa;

    const host = hostDe(pr.Website && pr.Website.url);
    if (host && !ehPlataforma(host) && !idx.dominios[host]) idx.dominios[host] = empresa;

    const tel = chaveTelefone(txt('Telefone'));
    if (tel && !idx.telefones[tel]) idx.telefones[tel] = empresa;
  }
}

/* As Data Tables vazias devolvem um item {} (alwaysOutputData). */
const linhas = (no) => $(no).all().map((i) => i.json).filter((j) => j && j.id !== undefined);

for (const p of linhas('Ler places vistos')) {
  idx.vistos[p.place_id] = p.estado;
  if (p.estado === 'fila' && p.nicho === cfg.nicho && p.cidade === cfg.cidade_chave) {
    idx.fila.push({ place_id: p.place_id, termo: p.termo, desde: p.atualizado || '' });
  }
}
// Os mais antigos primeiro: a fila não deixa ninguém para trás.
idx.fila.sort((a, b) => String(a.desde).localeCompare(String(b.desde)));

idx.celulas = linhas('Ler células')
  .filter((c) => c.nicho === cfg.nicho && c.cidade === cfg.cidade_chave)
  .map((c) => soColunas(c, COLUNAS_CELULA));

const comCelulas = new Set(idx.celulas.map((c) => c.termo));
idx.termos_sem_celulas = cfg.termos.filter((t) => !comCelulas.has(t));

return [{ json: idx }];
