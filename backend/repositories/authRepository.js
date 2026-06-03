// backend/repositories/authRepository.js
const crypto = require('crypto');
const supabase = require('../supabaseClient');

// ── Supabase Auth ────────────────────────────────────────────

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data; // { user, session }
}

async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signOut(token) {
  // Invalida o token no lado do Supabase
  const client = supabase;
  await client.auth.admin.signOut(token);
}

async function getUserFromToken(token) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Token inválido ou expirado.');
  return user;
}

async function getOrCreateAuthUser(email) {
  const password = crypto.randomBytes(12).toString('hex');
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return data.user;
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists')) {
      const { data, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) throw listErr;
      const found = (data?.users || []).find(u => u.email === email);
      if (found) return found;
    }
    throw err;
  }
}

// ── Profile (users_profile) ──────────────────────────────────

async function getProfile(userId) {
  const { data } = await supabase
    .from('users_profile')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data || null;
}

async function upsertProfile({ id, companyId, name, role }) {
  const { error } = await supabase.from('users_profile').upsert([{
    id,
    company_id: companyId,
    name,
    role,
  }]);
  if (error) throw error;
}

module.exports = {
  signIn,
  signUp,
  signOut,
  getUserFromToken,
  getOrCreateAuthUser,
  getProfile,
  upsertProfile,
};