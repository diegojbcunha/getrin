'use strict';

const supabase = require('../supabaseClient');

function getTokenFromHeader(req) {
  return (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
}

async function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    // Busca o perfil para obter o company_id
    const { data: profile } = await supabase
      .from('users_profile')
      .select('company_id, role, name')
      .eq('id', user.id)
      .single();

    req.user = user;
    // Injeta company_id e dados do perfil no req.session para compatibilidade
    req.session = {
      user_id: user.id,
      email: user.email,
      company_id: profile?.company_id || user.user_metadata?.company_id || '00000000-0000-0000-0000-000000000000',
      role: profile?.role || user.user_metadata?.role || 'worker',
      name: profile?.name || user.user_metadata?.full_name || 'Usuário'
    };
    
    next();
  } catch (err) {
    console.error('Erro na autenticação:', err);
    res.status(401).json({ error: 'Erro ao validar sessão.' });
  }
}

function requireManager(req, res, next) {
  const role = req.user?.user_metadata?.role || req.session?.role;
  if (!['manager', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Acesso restrito a gestores e administradores.' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireManager,
  getTokenFromHeader
};
