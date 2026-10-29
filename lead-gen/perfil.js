/* Perfil escolhido — primeiro nó depois de qualquer trigger.

   Junta o perfil pedido (lead-gen/perfis.json, embutido pelo build) com
   as opções de quem corre: localidade, número de leads e modo ensaio.
   Devolve a configuração no formato que o Config tinha, para o resto do
   workflow não mudar. A localidade só é escolhida mais à frente, em
   "Config ativa", depois de ler o estado das células.

   Entradas possíveis:
   - formulário: { Perfil, Localidade, 'Leads novos', Modo };
   - Manual Trigger → "Escolha manual": { perfil, localidade, leads_novos_desejados, gravar_no_notion };
   - webhook de ensaio: { body: { perfil, localidade, leads_novos_desejados, gravar_no_notion } }. */

const PERFIS = /*@perfis*/ {};
const NOTION_DB = /*@notion_db*/ '';

const e = $input.first().json || {};
const doForm = e.Perfil !== undefined;
const pedido = doForm
  ? {
    perfil: e.Perfil,
    localidade: e.Localidade === 'Automática' ? '' : e.Localidade,
    leads_novos_desejados: e['Leads novos'],
    gravar_no_notion: e.Modo === 'Gravar no CRM',
  }
  : (e.body && typeof e.body === 'object' ? { ...e.body, gravar_no_notion: e.body.gravar_no_notion === true } : e);

const nome = String(pedido.perfil || '').trim();
const perfil = PERFIS[nome];
if (!perfil) {
  throw new Error(`Perfil "${nome}" não existe. Perfis disponíveis — ${Object.keys(PERFIS).join(', ')}.`);
}

const lista = (v) => (Array.isArray(v) ? v.join('; ') : String(v || ''));
const vazio = (v) => v === undefined || v === null || String(v).trim() === '';

return [{
  json: {
    perfil: nome,
    responsavel: perfil.responsavel,
    nicho: perfil.nicho,
    termos: lista(perfil.termos),
    sub_nichos: lista(perfil.sub_nichos),
    criterios_score: perfil.criterios_score || '',
    tipos_excluir: lista(perfil.tipos_excluir),
    verificar_sem_site: perfil.verificar_sem_site !== false,
    localidades: perfil.localidades,
    localidade_pedida: String(pedido.localidade || '').trim(),
    location: '',
    leads_novos_desejados: vazio(pedido.leads_novos_desejados) ? (perfil.leads_novos_desejados ?? 20) : pedido.leads_novos_desejados,
    max_pedidos_google: perfil.max_pedidos_google ?? 60,
    grelha: perfil.grelha ?? 2,
    enrich: perfil.enrich !== false,
    descartar_fora_do_nicho: perfil.descartar_fora_do_nicho !== false,
    gravar_no_notion: pedido.gravar_no_notion === true,
    customer_id: 'leadgen',
    notion_db: NOTION_DB,
  },
}];
