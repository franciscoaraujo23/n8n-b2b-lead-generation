// @comum
/* Analisar website — corre por lead, logo a seguir a "Ler website".

   O HTTP Request devolve a resposta e perde o lead: o lead vem de
   $('Filtrar novos').item, a resposta de $json.

   Decide se é preciso uma 2.ª leitura:
   - texto < 200 caracteres (site em JavaScript, bloqueio, erro) →
     ler a homepage pelo Jina Reader, que corre o JavaScript;
   - texto bom mas sem email, e há link para contactos → ler essa página. */

const lead = $('Filtrar novos').item.json;
const bruto = typeof $json.data === 'string' ? $json.data : '';
const host = hostDe(lead.website);

const texto = htmlParaTexto(bruto);
const email = extrairEmail(bruto, texto, host);
const telefone = lead.telefone || extrairTelefone(bruto, texto);
const contactos = paginaContactos(bruto, lead.website);

let segunda = '';
let tipo = '';
if (texto.length < 200) {
  segunda = 'https://r.jina.ai/' + lead.website;
  tipo = 'jina';
} else if (!email && contactos) {
  segunda = contactos;
  tipo = 'contactos';
}

return {
  json: {
    ...lead,
    email,
    telefone,
    site_texto: texto.slice(0, 5000),
    site_erro: $json.error ? mensagemErro($json.error) : '',
    _segunda_leitura: segunda,
    _segunda_tipo: tipo,
  },
};
