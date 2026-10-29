/* Validação do lead-gen/perfis.json — usada pelo build-lead-gen.js
   (recusa construir com um perfis.json errado) e pelo banco de ensaio. */

const RESPONSAVEIS = ['Bruno', 'Ana', 'Outreach'];

/* Uma localidade é o nome ("Porto, Portugal") ou { nome, area_km },
   para concelhos maiores do que a área mínima por omissão. */
const nomeLocalidade = (l) => (l && typeof l === 'object' ? l.nome : l);
const chaveLocalidade = (l) => String(nomeLocalidade(l)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function validarPerfis(perfis) {
  const erros = [];
  const nomes = Object.keys(perfis || {});
  if (!nomes.length) erros.push('não há perfis.');

  for (const nome of nomes) {
    const p = perfis[nome];
    const e = (m) => erros.push(`${nome}: ${m}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(nome)) e('o nome só pode ter minúsculas, números e hífens (ex.: ana-climatizacao).');
    if (!RESPONSAVEIS.includes(p.responsavel)) e(`responsavel tem de ser um de ${RESPONSAVEIS.join(', ')}.`);
    if (!String(p.nicho || '').trim()) e('falta o nicho.');
    if (!Array.isArray(p.termos) || !p.termos.length) e('termos tem de ser uma lista com pelo menos um termo.');
    if (!Array.isArray(p.localidades) || !p.localidades.length) e('localidades tem de ser uma lista com pelo menos uma localidade.');
    for (const campo of ['sub_nichos', 'tipos_excluir']) {
      if (p[campo] !== undefined && !Array.isArray(p[campo])) e(`${campo} tem de ser uma lista.`);
    }
    if (String(p.criterios_score || '').length > 1500) e('criterios_score tem mais de 1500 caracteres.');
    const vistas = new Set();
    for (const l of p.localidades || []) {
      if (!String(nomeLocalidade(l) || '').trim()) { e('há uma localidade sem nome.'); continue; }
      if (l && typeof l === 'object' && !(Number.isFinite(l.area_km) && l.area_km >= 1 && l.area_km <= 100)) e(`area_km de "${l.nome}" tem de ser um número entre 1 e 100.`);
      if (vistas.has(chaveLocalidade(l))) e(`a localidade "${nomeLocalidade(l)}" aparece duas vezes.`);
      vistas.add(chaveLocalidade(l));
    }
  }

  /* Células e fila são guardadas por nicho + cidade: dois perfis do mesmo
     nicho na mesma localidade tiravam leads um ao outro. */
  for (let i = 0; i < nomes.length; i++) {
    for (let j = i + 1; j < nomes.length; j++) {
      const a = perfis[nomes[i]];
      const b = perfis[nomes[j]];
      if (!a.nicho || a.nicho !== b.nicho) continue;
      const deB = new Set((b.localidades || []).map(chaveLocalidade));
      const comuns = (a.localidades || []).filter((l) => deB.has(chaveLocalidade(l))).map(nomeLocalidade);
      if (comuns.length) erros.push(`${nomes[i]} e ${nomes[j]} têm o mesmo nicho e localidades em comum (${comuns.join('; ')}). Divide as zonas entre os dois.`);
    }
  }

  return erros;
}

module.exports = { validarPerfis, nomeLocalidade, RESPONSAVEIS };
