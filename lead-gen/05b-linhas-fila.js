/* Linhas da fila — um ID novo por item, para a Data Table. Gravar a
   fila ANTES de pedir detalhes é o que garante que um ID encontrado
   nunca se perde, mesmo que a execução falhe a seguir. */
return $input.first().json.fila.map((json) => ({ json }));
