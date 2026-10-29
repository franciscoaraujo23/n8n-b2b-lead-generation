/* Linhas de células — uma por item, para a Data Table. Sem linhas,
   não sai nada e a gravação simplesmente não corre. */
return $input.first().json.celulas.map((json) => ({ json }));
