// @comum
/* Criar grelha — só corre quando há termos sem células nesta
   localidade (a primeira vez, ou quando se acrescenta um termo).

   Divide os limites da localidade que o Google devolve (`viewport`)
   numa grelha N×N, para cada termo novo. As células que vierem cheias
   são subdivididas mais tarde, em "Fechar pesquisa". */

const cfg = $('Config ativa').first().json;
const idx = $('Índice do CRM').first().json;
const lugar = ($input.first().json.places || [])[0] || {};
const v = lugar.viewport;

if (!v || !v.low || !v.high) {
  // Devolve { _parar }: o workflow liberta o lock e pára com a mensagem.
  return [{ json: { _parar: `O Google não devolveu limites para "${cfg.location}". Corrige o nome no perfis.json (como no Google Maps, ex.: "Guimarães, Portugal").` } }];
}

/* O Google devolve às vezes só o centro da cidade (Matosinhos: 3×3 km,
   o concelho tem 62 km²). Abaixo da área da localidade (cfg.area_km de
   lado), o retângulo alarga-se à volta do centro. Pode entrar nos
   vizinhos: não cria duplicados, porque cada Place ID só é tratado uma
   vez, e as pesquisas só de IDs são grátis. */
const KM_POR_GRAU_LAT = 111.32;
const area = Number(cfg.area_km) || 0;
let sul = v.low.latitude;
let norte = v.high.latitude;
let oeste = v.low.longitude;
let este = v.high.longitude;
if (area > 0) {
  const latC = (sul + norte) / 2;
  const lngC = (oeste + este) / 2;
  const kmPorGrauLng = KM_POR_GRAU_LAT * Math.cos((latC * Math.PI) / 180);
  const meiaLat = Math.max((norte - sul) / 2, area / 2 / KM_POR_GRAU_LAT);
  const meiaLng = Math.max((este - oeste) / 2, area / 2 / kmPorGrauLng);
  sul = latC - meiaLat; norte = latC + meiaLat;
  oeste = lngC - meiaLng; este = lngC + meiaLng;
}

const n = cfg.grelha;
const agora = new Date().toISOString();
const dLat = (norte - sul) / n;
const dLng = (este - oeste) / n;

const celulas = [];
for (const termo of idx.termos_sem_celulas) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      celulas.push(novaCelula(cfg, termo, `${i}-${j}`, 0, {
        sul: sul + i * dLat,
        norte: sul + (i + 1) * dLat,
        oeste: oeste + j * dLng,
        este: oeste + (j + 1) * dLng,
      }, agora));
    }
  }
}

return celulas.map((json) => ({ json }));
