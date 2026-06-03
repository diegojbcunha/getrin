// backend/scripts/migrateUsers.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function migrate() {
  const usersPath = path.join(__dirname, '..', 'users.json');
  const raw = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const users = Array.isArray(raw) ? raw : Object.values(raw);

  // Senha temporária — você vai pedir para os usuários redefinir depois
  const TEMP_PASSWORD = 'Getrin@2026!';

  for (const user of users) {
    console.log(`Migrando: ${user.email}`);
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: TEMP_PASSWORD,
        email_confirm: true,
        user_metadata: { name: user.name, role: user.role }
      });

      if (error) {
        // Usuário já existe no Supabase, só busca o ID
        if (error.message.toLowerCase().includes('already')) {
          console.log(`  → já existe, pulando criação`);
          continue;
        }
        throw error;
      }

      // Criar perfil na tabela users_profile
      await supabase.from('users_profile').upsert([{
        id: data.user.id,
        company_id: 'c0000000-0000-0000-0000-000000000001',
        name: user.name,
        role: user.role,
      }]);

      console.log(`  ✅ Criado com ID: ${data.user.id}`);
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
    }
  }

  console.log('\nMigração concluída!');
  console.log(`Senha temporária de todos os usuários: ${TEMP_PASSWORD}`);
  console.log('Avise os usuários para redefinir a senha no primeiro acesso.');
}

migrate();