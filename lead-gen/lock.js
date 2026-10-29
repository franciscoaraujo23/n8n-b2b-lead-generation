/* Verificar lock — uma execução de cada vez por CRM.

   A linha da Data Table leadgen_lock com esta chave diz que execução
   está a correr e desde quando. Se outra execução a tiver há menos de
   EXPIRA_MIN minutos, pára aqui, antes de gastar pedidos. Uma execução
   que falhe a meio não liberta o lock: ele expira sozinho. No fim, o nó
   "Libertar lock" grava a linha com a execução vazia. */

const EXPIRA_MIN = 20;
const cfg = $('Config base').first().json;
const execucao = typeof $execution !== 'undefined' ? String($execution.id) : 'teste';

const agora = Date.now();
const atual = $('Ler lock').all().map((i) => i.json).find((j) => j && j.chave === cfg.lock_chave && j.execucao);
if (atual && atual.execucao !== execucao) {
  const desde = Date.parse(atual.desde);
  const expira = desde + EXPIRA_MIN * 60 * 1000;
  if (Number.isFinite(desde) && agora < expira) {
    const hora = (t) => new Date(t).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
    throw new Error(`Já está a correr outra execução do Lead Gen (n.º ${atual.execucao}, desde as ${hora(desde)}). Espera que acabe; se ficou presa, o bloqueio expira às ${hora(expira)}.`);
  }
}

return [{ json: { chave: cfg.lock_chave, execucao, desde: new Date(agora).toISOString() } }];
