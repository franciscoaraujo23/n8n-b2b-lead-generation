/* Mensagem de erro — ramo de saída de "Config ok?", "CRM lido?" e
   "Grelha criada?". Guarda a mensagem para o nó "Parar com erro",
   depois de o lock ser libertado. */

return [{ json: { mensagem: String($input.first().json._parar || 'Erro sem mensagem.') } }];
