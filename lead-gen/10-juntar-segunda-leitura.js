// @comum
/* Juntar 2.ª leitura — corre por lead, a seguir a "Ler website (2.ª)".

   Se a 2.ª leitura falhar, o lead segue com o que já tinha: uma
   página de contactos que não abre não é razão para perder o lead. */

const lead = $('Analisar website').item.json;
const bruto = typeof $json.data === 'string' ? $json.data : '';
const host = hostDe(lead.website);

let { site_texto, email, telefone } = lead;

/* O Jina devolve 200 com um aviso quando o site lhe responde com erro;
   esse texto não é o site. */
const falhou = !!$json.error || !bruto || /Target URL returned error|^Warning: .*(blocked|captcha)/im.test(bruto);

if (!falhou) {
  if (lead._segunda_tipo === 'jina') {
    const t = markdownParaTexto(bruto);
    if (t.length > site_texto.length) site_texto = t.slice(0, 5000);
    email = email || extrairEmail(bruto, t, host);
    telefone = telefone || extrairTelefone(bruto, t);
  } else {
    const t = htmlParaTexto(bruto);
    email = email || extrairEmail(bruto, t, host);
    telefone = telefone || extrairTelefone(bruto, t);
    site_texto = (site_texto + '\n\n[Página de contactos] ' + t.slice(0, 1500)).slice(0, 6500);
  }
}

return {
  json: {
    ...lead,
    site_texto,
    email,
    telefone,
    segunda_leitura: lead._segunda_tipo + (falhou ? ' (falhou)' : ' (ok)'),
  },
};
