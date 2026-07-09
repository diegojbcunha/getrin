'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, getTokenFromHeader } = require('../middlewares/auth');
const { formatNameFromEmail, makeInitials } = require('../utils/helpers');

const INVITE_CODES = {
  manager: process.env.GETRIN_MANAGER_INVITE_CODE || '123',
  admin:   process.env.GETRIN_ADMIN_INVITE_CODE   || '1234',
};

function isPrivilegedSignupAllowed(role, inviteCode) {
  const expected = INVITE_CODES[role];
  return Boolean(expected && inviteCode && inviteCode.trim() === expected);
}

// Cadastro
router.post('/signup', async (req, res) => {
  try {
    const { email, password, role, inviteCode, company_id } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });

    const safeEmail = String(email).trim().toLowerCase();
    const requestedRole = ['worker', 'manager', 'admin'].includes(role) ? role : 'worker';
    
    if (requestedRole !== 'worker' && !isPrivilegedSignupAllowed(requestedRole, inviteCode))
      return res.status(403).json({ error: 'Criação de contas administrativas exige código de convite válido.' });

    const name = formatNameFromEmail(safeEmail);
    
    // UUID padrão para empresa se não for fornecido (evita erro no trigger public.handle_new_user)
    const finalCompanyId = company_id || '00000000-0000-0000-0000-000000000000';
    
    const { data, error } = await supabase.auth.signUp({
      email: safeEmail,
      password: password,
      options: {
        data: {
          role: requestedRole,
          full_name: name,
          name: name, // Alinhado com o trigger COALESCE(NEW.raw_user_meta_data->>'name', 'Novo Usuário')
          initials: makeInitials(name),
          company_id: finalCompanyId // Exigido pelo trigger public.handle_new_user
        }
      }
    });

    if (error) {
      console.error('Supabase Auth Error:', error);
      throw error;
    }

    if (!data.user) {
      throw new Error('Falha ao criar usuário (sem retorno do servidor).');
    }

    res.status(201).json({ 
      message: 'Conta criada com sucesso! Verifique seu e-mail para confirmar o cadastro.', 
      user: { 
        id: data.user.id,
        email: data.user.email, 
        name: data.user.user_metadata?.full_name || name, 
        role: data.user.user_metadata?.role || requestedRole
      } 
    });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(400).json({ error: err.message || 'Erro ao criar conta.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: password
    });

    if (error) throw error;

    res.json({
      token: data.session.access_token,
      user: {
        id:       data.user.id,
        email:    data.user.email,
        name:     data.user.user_metadata.full_name,
        initials: data.user.user_metadata.initials,
        role:     data.user.user_metadata.role,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(401).json({ error: 'Credenciais inválidas ou erro no servidor.' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    res.json({ message: 'Logout realizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deslogar.' });
  }
});

// Sessão atual
router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({ 
    id: u.id, 
    email: u.email, 
    name: u.user_metadata.full_name, 
    initials: u.user_metadata.initials, 
    role: u.user_metadata.role 
  });
});

module.exports = router;
