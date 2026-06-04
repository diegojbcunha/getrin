'use strict';

/**
 * Este arquivo anteriormente continha lógica para autenticação local.
 * Com a migração para Supabase Auth, a maioria das funções foi removida.
 * Mantemos o arquivo para evitar quebras de importação se necessário, 
 * mas a lógica de hash e sessão agora é gerenciada pelo Supabase.
 */

module.exports = {
  // Funções legadas removidas pois o Supabase Auth agora gerencia senhas e sessões.
};
