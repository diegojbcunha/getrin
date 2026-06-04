'use strict';

const supabase = require('../supabaseClient');

/**
 * Script para executar a limpeza de alertas antigos no Supabase.
 * Chama a função RPC 'clean_expired_alerts' definida no banco de dados.
 */
async function runAlertCleanup() {
  console.log('Iniciando limpeza de alertas antigos...');
  
  try {
    const { data, error } = await supabase.rpc('clean_expired_alerts');
    
    if (error) {
      console.error('Erro ao limpar alertas:', error.message);
      return;
    }
    
    console.log(`✓ Limpeza concluída. Registros removidos: ${data}`);
  } catch (err) {
    console.error('Falha na execução do script:', err.message);
  }
}

runAlertCleanup();
