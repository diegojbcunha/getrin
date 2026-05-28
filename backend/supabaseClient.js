const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let supabaseUrl = process.env.SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_ANON_KEY;

// Tentar ler de config.json primeiro
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.supabaseUrl && !config.supabaseUrl.includes('sua-url-do-supabase')) {
      supabaseUrl = config.supabaseUrl;
      supabaseKey = config.supabaseAnonKey;
    }
  } catch (err) {
    console.error("Erro ao ler config.json:", err);
  }
}

if (!supabaseUrl || supabaseUrl.includes("sua-url-do-supabase")) {
  console.warn("AVISO: SUPABASE_URL padrão detectado. Configure o arquivo .env ou o painel de configurações com suas credenciais reais.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
