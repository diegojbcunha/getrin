const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let supabaseUrl = process.env.SUPABASE_URL;
let supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Tentar ler de config.json primeiro
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.supabaseUrl && !config.supabaseUrl.includes('sua-url-do-supabase')) {
      // Limpa a URL para garantir que seja apenas o domínio base
      supabaseUrl = config.supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
      supabaseAnonKey = config.supabaseAnonKey;
    }
  } catch (err) {
    console.error("Erro ao ler config.json:", err);
  }
}

if (!supabaseUrl || supabaseUrl.includes("sua-url-do-supabase")) {
  console.warn("AVISO: SUPABASE_URL padrão detectado. Configure o arquivo .env ou o painel de configurações com suas credenciais reais.");
}

const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey;
if (!supabaseUrl || supabaseUrl.includes('sua-url-do-supabase') || !supabaseKey) {
  console.error('ERRO: SUPABASE_URL e SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY não configurados corretamente. Verifique .env ou backend/config.json.');
  throw new Error('Supabase não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY).');
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

if (supabaseServiceRoleKey) {
  console.log('Supabase service role key carregada. Backend está usando credenciais de serviço para operações seguras.');
} else {
  console.warn('AVISO: SUPABASE_SERVICE_ROLE_KEY não está definido. Operações de escrita podem ser bloqueadas por Row-Level Security.');
}

module.exports = supabase;

