/* =============================================================
   GETRIN — Backend API
   backend/server.js

   ARQUITETURA DE AUTENTICAÇÃO:
   O sistema usa autenticação LOCAL (users.json + sessions.json),
   sem depender do Supabase Auth. Os dados de negócio (workers,
   trainings, worker_trainings, alerts) ficam no Supabase.
   Existe um fallback para local_db.json caso o Supabase esteja
   indisponível ou restringido por RLS.

   PERFIS DE ACESSO:
   - worker  → qualquer e-mail
   - manager → exige GETRIN_MANAGER_INVITE_CODE no cadastro
   - admin   → exige GETRIN_ADMIN_INVITE_CODE no cadastro
   ============================================================= */

'use strict';

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3003;
const PROJECT_ROOT = path.join(__dirname, '..');

// ── Middlewares ────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));

// Arquivos estáticos do frontend
app.use('/css',  express.static(path.join(PROJECT_ROOT, 'css')));
app.use('/js',   express.static(path.join(PROJECT_ROOT, 'js')));
app.use('/html', express.static(path.join(PROJECT_ROOT, 'html')));
app.use(express.static(PROJECT_ROOT));

app.get('/',      (_req, res) => res.redirect('/html/login.html'));
app.get('/login', (_req, res) => res.redirect('/html/login.html'));

// ═══════════════════════════════════════════════════════════════
// ARMAZENAMENTO LOCAL (autenticação e fallback de dados)
// ═══════════════════════════════════════════════════════════════

const USERS_FILE    = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const LOCAL_DB_FILE = path.join(__dirname, 'local_db.json');

const INVITE_CODES = {
  manager: process.env.GETRIN_MANAGER_INVITE_CODE || '',
  admin:   process.env.GETRIN_ADMIN_INVITE_CODE   || '',
};

// ── Helpers de arquivo ─────────────────────────────────────────
function readJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath))
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Erro ao escrever ${filePath}:`, err.message);
  }
}

const loadUsers    = () => readJSON(USERS_FILE,    {});
const saveUsers    = (d) => writeJSON(USERS_FILE,    d);
const loadSessions = () => readJSON(SESSIONS_FILE, {});
const saveSessions = (d) => writeJSON(SESSIONS_FILE, d);
const loadLocalDb  = () => {
  const raw = readJSON(LOCAL_DB_FILE, {});
  return {
    trainings:   Array.isArray(raw.trainings)   ? raw.trainings   : [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    workers:     Array.isArray(raw.workers)     ? raw.workers     : [],
  };
};
const saveLocalDb = (d) => writeJSON(LOCAL_DB_FILE, d);

// ── Helpers de senha e sessão ──────────────────────────────────
/**
 * Gera hash seguro com PBKDF2 + salt.
 * Formato salvo: "salt:hash"
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  // Suporte a senhas antigas (SHA-256 sem salt, formato legado)
  if (!stored.includes(':')) {
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    return legacyHash === stored;
  }
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  // Comparação em tempo constante para evitar timing attacks
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
}

function createSession(user) {
  const token    = crypto.randomBytes(48).toString('hex');
  const sessions = loadSessions();
  // Limpa sessões com mais de 8 horas automaticamente
  const cutoff = Date.now() - 8 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(sessions)) {
    if (new Date(v.createdAt).getTime() < cutoff) delete sessions[k];
  }
  sessions[token] = {
    email:     user.email,
    role:      user.role,
    name:      user.name,
    initials:  makeInitials(user.name),
    createdAt: new Date().toISOString(),
  };
  saveSessions(sessions);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const sessions = loadSessions();
  const s = sessions[token];
  if (!s) return null;
  // Valida TTL de 8 horas
  if (Date.now() - new Date(s.createdAt).getTime() > 8 * 60 * 60 * 1000) {
    delete sessions[token];
    saveSessions(sessions);
    return null;
  }
  return s;
}

function deleteSession(token) {
  if (!token) return;
  const sessions = loadSessions();
  delete sessions[token];
  saveSessions(sessions);
}

function getTokenFromHeader(req) {
  return (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
}

// ── Middleware de autenticação ─────────────────────────────────
/**
 * Protege rotas exigindo sessão válida.
 * Injeta req.session com os dados do usuário.
 */
function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Não autenticado. Faça login novamente.' });
  req.session = session;
  next();
}

/**
 * Só permite acesso a gestores e admins.
 */
function requireManager(req, res, next) {
  if (!['manager', 'admin'].includes(req.session?.role)) {
    return res.status(403).json({ error: 'Acesso restrito a gestores e administradores.' });
  }
  next();
}

// ── Helpers de texto ───────────────────────────────────────────
function makeInitials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2)
    .map(n => n[0].toUpperCase()).join('');
}

function formatNameFromEmail(email) {
  if (!email) return 'Usuário';
  return email.split('@')[0].split(/[._-]/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function isPrivilegedSignupAllowed(role, inviteCode) {
  const expected = INVITE_CODES[role];
  return Boolean(expected && inviteCode && inviteCode.trim() === expected);
}

// ── Helpers de local_db ────────────────────────────────────────
function addLocalWorker(email) {
  const db = loadLocalDb();
  const existing = db.workers.find(w => w.email === email);
  if (existing) return existing;
  const worker = {
    id:           `local-worker-${Date.now()}`,
    name:         formatNameFromEmail(email),
    initials:     makeInitials(formatNameFromEmail(email)),
    matricula:    `#${Date.now().toString().slice(-5)}`,
    role:         'Colaborador',
    sector:       '—',
    manager:      '—',
    admission:    new Date().toLocaleDateString('pt-BR'),
    email,
    phone:        '—',
    compliance:   0,
    status:       'gray',
    status_label: 'Pendente',
    trainings:    [],
  };
  db.workers.push(worker);
  saveLocalDb(db);
  return worker;
}

function addLocalTraining(training) {
  const db = loadLocalDb();
  db.trainings.push(training);
  saveLocalDb(db);
  return training;
}

function addLocalAssignment(assignment) {
  const db = loadLocalDb();
  db.assignments.push(assignment);
  saveLocalDb(db);
  return assignment;
}

function getLocalAssignmentsByEmail(email) {
  return loadLocalDb().assignments.filter(a => a.worker_email === email);
}

function getLocalTrainingById(id) {
  return loadLocalDb().trainings.find(t => t.id === id) || null;
}

// ── Helpers de Supabase ────────────────────────────────────────
async function findWorkerByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase.from('workers').select('*')
    .eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureWorkerRecord(email) {
  try {
    const existing = await findWorkerByEmail(email);
    if (existing) return existing;
  } catch (_) { /* Supabase indisponível → usa fallback local */ }
  return addLocalWorker(email);
}

// ═══════════════════════════════════════════════════════════════
// ROTAS — AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════

// Cadastro
app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, role, inviteCode } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });

    // Sanitização básica
    const safeEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail))
      return res.status(400).json({ error: 'E-mail inválido.' });

    const users = loadUsers();
    if (users[safeEmail])
      return res.status(400).json({ error: 'Este e-mail já foi registrado.' });

    const requestedRole = ['worker', 'manager', 'admin'].includes(role) ? role : 'worker';
    if (requestedRole !== 'worker' && !isPrivilegedSignupAllowed(requestedRole, inviteCode))
      return res.status(403).json({ error: 'Criação de contas administrativas exige código de convite válido.' });

    const name = formatNameFromEmail(safeEmail);
    users[safeEmail] = {
      email:     safeEmail,
      password:  hashPassword(password),   // PBKDF2 + salt
      role:      requestedRole,
      name,
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);

    res.status(201).json({ message: 'Conta criada com sucesso!', user: { email: safeEmail, name, role: requestedRole } });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const safeEmail = String(email).trim().toLowerCase();
    const users = loadUsers();
    const user  = users[safeEmail];

    // Mensagem genérica para não revelar se o e-mail existe
    if (!user || !verifyPassword(password, user.password))
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });

    const token = createSession(user);
    res.json({
      token,
      user: {
        id:       safeEmail,
        email:    user.email,
        name:     user.name,
        initials: makeInitials(user.name),
        role:     user.role,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  deleteSession(getTokenFromHeader(req));
  res.json({ message: 'Logout realizado com sucesso.' });
});

// Sessão atual
app.get('/api/auth/me', requireAuth, (req, res) => {
  const s = req.session;
  res.json({ id: s.email, email: s.email, name: s.name, initials: s.initials, role: s.role });
});

// ═══════════════════════════════════════════════════════════════
// ROTAS — TRABALHADORES
// ═══════════════════════════════════════════════════════════════

// Listar todos (gestor/admin)
app.get('/api/workers', requireAuth, requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from('workers').select('*').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trabalhador logado — retorna seus próprios dados e treinamentos
app.get('/api/workers/me', requireAuth, async (req, res) => {
  try {
    const email  = req.session.email;
    const worker = await ensureWorkerRecord(email);

    let trainings = [];

    if (String(worker.id).startsWith('local-worker-')) {
      // Worker local: busca atribuições locais
      trainings = getLocalAssignmentsByEmail(email).map(a => {
        const t = getLocalTrainingById(a.training_id) || {};
        return {
          id: a.id, training_id: a.training_id,
          name: t.name || a.training_name || 'Treinamento', norm: t.norm || a.training_norm || '—',
          progress: a.progress, done: a.done, expires: a.expires,
          expiresColor: a.expires_color || null, status: a.status, statusLabel: a.status_label,
        };
      });
    } else {
      // Worker do Supabase
      const { data, error } = await supabase.from('worker_trainings')
        .select('id, progress, done, expires, expires_color, status, status_label, trainings(id,name,norm)')
        .eq('worker_id', worker.id);
      if (error) throw error;

      trainings = (data || []).map(t => ({
        id: t.id, training_id: t.trainings?.id,
        name: t.trainings?.name, norm: t.trainings?.norm,
        progress: t.progress, done: t.done, expires: t.expires,
        expiresColor: t.expires_color, status: t.status, statusLabel: t.status_label,
      }));

      // Mescla atribuições locais sem duplicar
      const existingIds = new Set(trainings.map(t => t.training_id));
      getLocalAssignmentsByEmail(email).forEach(a => {
        if (existingIds.has(a.training_id)) return;
        const t = getLocalTrainingById(a.training_id) || {};
        trainings.push({
          id: a.id, training_id: a.training_id,
          name: t.name || a.training_name || 'Treinamento', norm: t.norm || a.training_norm || '—',
          progress: a.progress, done: a.done, expires: a.expires,
          expiresColor: a.expires_color || null, status: a.status, statusLabel: a.status_label,
        });
      });
    }

    res.json({ ...worker, trainings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detalhe de um trabalhador pelo ID (gestor/admin)
app.get('/api/workers/:id', requireAuth, requireManager, async (req, res) => {
  try {
    const { data: worker, error: wErr } = await supabase.from('workers')
      .select('*').eq('id', req.params.id).single();
    if (wErr) throw wErr;

    const { data: trainings, error: tErr } = await supabase.from('worker_trainings')
      .select('id, progress, done, expires, expires_color, status, status_label, trainings(id,name,norm)')
      .eq('worker_id', req.params.id);
    if (tErr) throw tErr;

    res.json({
      ...worker,
      trainings: trainings.map(t => ({
        id: t.id, training_id: t.trainings?.id,
        name: t.trainings?.name, norm: t.trainings?.norm,
        progress: t.progress, done: t.done, expires: t.expires,
        expiresColor: t.expires_color, status: t.status, statusLabel: t.status_label,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar trabalhador (gestor/admin)
app.post('/api/workers', requireAuth, requireManager, async (req, res) => {
  try {
    const { name, initials, matricula, role, sector, manager, admission, email, phone } = req.body;
    if (!name || !email || !role || !sector)
      return res.status(400).json({ error: 'Campos obrigatórios: name, email, role, sector.' });

    const { data, error } = await supabase.from('workers')
      .insert([{ name, initials, matricula, role, sector, manager, admission, email, phone,
                 compliance: 0, status: 'gray', status_label: 'Pendente' }])
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar trabalhador (gestor/admin)
app.put('/api/workers/:id', requireAuth, requireManager, async (req, res) => {
  try {
    // Impede que compliance/status sejam sobrescritos diretamente via PUT externo
    const { compliance: _c, status: _s, status_label: _sl, ...safeBody } = req.body;
    const { data, error } = await supabase.from('workers')
      .update(safeBody).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar trabalhador (admin)
app.delete('/api/workers/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ error: 'Somente administradores podem excluir trabalhadores.' });
  try {
    const { error } = await supabase.from('workers').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Trabalhador removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS — TREINAMENTOS
// ═══════════════════════════════════════════════════════════════

// Listar catálogo
app.get('/api/trainings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('trainings').select('*').order('name');
    if (error) throw error;
    const local = loadLocalDb().trainings;
    res.json([...(data || []), ...local]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar treinamento (gestor/admin)
app.post('/api/trainings', requireAuth, requireManager, async (req, res) => {
  try {
    const { name, norm, hours, validity, roles, mode, worker_email } = req.body;
    if (!name || !norm || !hours || !validity || !mode)
      return res.status(400).json({ error: 'Campos obrigatórios: name, norm, hours, validity, mode.' });

    // Tenta salvar no Supabase; se falhar por RLS, salva localmente
    let training;
    try {
      const { data, error } = await supabase.from('trainings')
        .insert([{ name, norm, hours, validity, roles, mode, status: 'green', status_label: 'Ativo' }])
        .select().single();
      if (error) throw error;
      training = data;
    } catch (_) {
      training = addLocalTraining({
        id: `local-training-${Date.now()}`, name, norm, hours, validity, roles, mode,
        status: 'green', status_label: 'Ativo', source: 'local',
      });
    }

    let assignment = null;
    if (worker_email) {
      const worker = await ensureWorkerRecord(worker_email);
      assignment = addLocalAssignment({
        id: `local-assignment-${Date.now()}`,
        worker_email: worker.email, worker_id: worker.id,
        training_id: training.id, progress: 0,
        done: '—', expires: '—', status: 'gray', status_label: 'Pendente',
      });
    }

    res.status(201).json({ training, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar treinamento (admin)
app.delete('/api/trainings/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ error: 'Somente administradores podem excluir treinamentos.' });
  try {
    const { error } = await supabase.from('trainings').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Treinamento removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS — ATRIBUIÇÕES DE TREINAMENTO
// ═══════════════════════════════════════════════════════════════

// Atribuir treinamento a trabalhador (gestor/admin)
app.post('/api/worker-trainings', requireAuth, requireManager, async (req, res) => {
  try {
    const { worker_id, worker_email, training_id, progress, done, expires, status, status_label } = req.body;
    if (!worker_id && !worker_email)
      return res.status(400).json({ error: 'worker_id ou worker_email é obrigatório.' });
    if (!training_id)
      return res.status(400).json({ error: 'training_id é obrigatório.' });

    // Resolve e-mail a partir do worker_id se necessário
    let resolvedEmail = worker_email || '';
    if (!resolvedEmail && worker_id) {
      const { data } = await supabase.from('workers').select('email').eq('id', worker_id).maybeSingle();
      resolvedEmail = data?.email || '';
    }

    // Calcula data de vencimento se done informado
    let finalExpires = expires || '—';
    let finalExpiresColor = '';
    if (done && done !== '—') {
      const { data: tr } = await supabase.from('trainings').select('validity').eq('id', training_id).maybeSingle();
      if (tr?.validity) {
        finalExpires = calcExpiryDate(done, tr.validity);
        finalExpiresColor = calcExpiryColor(finalExpires);
      }
    }

    // Tenta inserir no Supabase, com fallback local
    try {
      const resolvedWorkerId = worker_id || (await ensureWorkerRecord(resolvedEmail))?.id;
      const { data, error } = await supabase.from('worker_trainings')
        .insert([{
          worker_id: resolvedWorkerId, training_id,
          progress: progress ?? 0, done: done || '—',
          expires: finalExpires, expires_color: finalExpiresColor,
          status: status || 'gray', status_label: status_label || 'Pendente',
        }]).select().single();
      if (error) throw error;
      await recalculateCompliance(resolvedWorkerId);
      return res.status(201).json(data);
    } catch (_) {
      const localWorker = await ensureWorkerRecord(resolvedEmail || `worker-${worker_id}`);
      const t = getLocalTrainingById(training_id) || { id: training_id, name: 'Treinamento', norm: '—' };
      const assignment = addLocalAssignment({
        id: `local-assignment-${Date.now()}`,
        worker_email: localWorker.email, worker_id: localWorker.id,
        training_id: t.id, training_name: t.name, training_norm: t.norm,
        progress: progress ?? 0, done: done || '—',
        expires: finalExpires, status: status || 'gray', status_label: status_label || 'Pendente',
      });
      return res.status(201).json(assignment);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar progresso/status (gestor/admin)
app.put('/api/worker-trainings/:id', requireAuth, requireManager, async (req, res) => {
  try {
    const { progress, done, training_id, status, status_label } = req.body;

    // Recalcula vencimento se done foi atualizado
    let expires = req.body.expires;
    let expires_color = req.body.expires_color;
    if (done && done !== '—' && training_id) {
      const { data: tr } = await supabase.from('trainings').select('validity').eq('id', training_id).maybeSingle();
      if (tr?.validity) {
        expires       = calcExpiryDate(done, tr.validity);
        expires_color = calcExpiryColor(expires);
      }
    }

    const { data, error } = await supabase.from('worker_trainings')
      .update({ progress, done, expires, expires_color, status, status_label })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    await recalculateCompliance(data.worker_id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remover atribuição (admin)
app.delete('/api/worker-trainings/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ error: 'Somente administradores podem remover atribuições.' });
  try {
    const { data: wt } = await supabase.from('worker_trainings')
      .select('worker_id').eq('id', req.params.id).maybeSingle();
    const { error } = await supabase.from('worker_trainings').delete().eq('id', req.params.id);
    if (error) throw error;
    if (wt?.worker_id) await recalculateCompliance(wt.worker_id);
    res.json({ message: 'Atribuição removida com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS — ALERTAS
// ═══════════════════════════════════════════════════════════════

app.get('/api/alerts', requireAuth, requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from('alerts').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS — DASHBOARD  (RF14: filtro de vencimento 30/60/90 dias)
// GET /api/dashboard?days=30  →  padrão 30, aceita 60 e 90
// ═══════════════════════════════════════════════════════════════

app.get('/api/dashboard', requireAuth, requireManager, async (req, res) => {
  try {
    // Valida o parâmetro days; aceita somente 30, 60 ou 90
    const allowedDays = [30, 60, 90];
    const days = allowedDays.includes(parseInt(req.query.days))
      ? parseInt(req.query.days) : 30;

    // 1. Trabalhadores
    const { data: workers, error: wErr } = await supabase.from('workers').select('compliance, status');
    if (wErr) throw wErr;

    // 2. Alertas
    const { data: alerts, error: aErr } = await supabase.from('alerts').select('*')
      .order('created_at', { ascending: false });
    if (aErr) throw aErr;

    // 3. Atividade recente
    const { data: activities, error: actErr } = await supabase.from('worker_trainings')
      .select('done, status, status_label, created_at, workers(name), trainings(name,norm)')
      .order('created_at', { ascending: false }).limit(5);
    if (actErr) throw actErr;

    // 4. Treinamentos vencendo dentro do período (RF14)
    const { data: allWt, error: wtErr } = await supabase.from('worker_trainings')
      .select('expires, status').in('status', ['green', 'amber']);
    if (wtErr) throw wtErr;

    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + days);

    const expiringCount = (allWt || []).filter(wt => {
      const exp = parseExpiryDate(wt.expires);
      return exp && exp >= today && exp <= cutoff;
    }).length;

    // Métricas
    const total          = workers.length;
    const nonCompliant   = workers.filter(w => w.status === 'red').length;
    const avgCompliance  = total > 0
      ? Math.round(workers.reduce((acc, w) => acc + (w.compliance || 0), 0) / total) : 0;

    res.json({
      metrics: { compliance: avgCompliance, workers: total, expiring: expiringCount,
                 nonCompliant, expiringDays: days },
      alerts,
      recentActivity: (activities || []).map(wt => ({
        name:        wt.workers?.name     || 'Desconhecido',
        training:    wt.trainings?.name   || 'Desconhecido',
        norm:        wt.trainings?.norm   || '—',
        date:        wt.done !== '—' ? wt.done : 'Em andamento',
        status:      wt.status,
        statusLabel: wt.status_label,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS — RELATÓRIOS  (RF18: filtros reais + summary)
// GET /api/reports?sector=X&role=Y&norm=Z
// ═══════════════════════════════════════════════════════════════

app.get('/api/reports', requireAuth, requireManager, async (req, res) => {
  try {
    const { sector, role, norm } = req.query;

    // 1. Trabalhadores com filtros opcionais
    let q = supabase.from('workers')
      .select('id, name, sector, role, compliance, status, status_label, worker_trainings(status)');
    if (sector) q = q.eq('sector', sector);
    if (role)   q = q.eq('role',   role);

    const { data: workers, error: wErr } = await q;
    if (wErr) throw wErr;

  
    const reportWorkers = workers.map(w => ({
      name:        w.name,
      sector:      w.sector,
      role:        w.role,
      valid:       (w.worker_trainings || []).filter(wt => wt.status === 'green').length,
      expired:     (w.worker_trainings || []).filter(wt => wt.status === 'red' || wt.status === 'amber').length,
      pct:         w.compliance,
      status:      w.status,
      statusLabel: w.status_label,
    }));

    // 2. Conformidade por setor (a partir dos trabalhadores já filtrados)
    const deptMap = {};
    workers.forEach(w => {
      if (!deptMap[w.sector]) deptMap[w.sector] = { sum: 0, count: 0 };
      deptMap[w.sector].sum   += w.compliance;
      deptMap[w.sector].count += 1;
    });
    const departments = Object.keys(deptMap).map(name => ({
      name,
      pct: Math.round(deptMap[name].sum / deptMap[name].count),
    }));

    // 3. Conformidade por norma (com filtro opcional)
    let wtQ = supabase.from('worker_trainings').select('status, trainings(norm)');
    if (norm) wtQ = wtQ.eq('trainings.norm', norm);
    const { data: wts, error: wtErr } = await wtQ;
    if (wtErr) throw wtErr;

    const normMap = {};
    (wts || []).forEach(wt => {
      if (!wt.trainings) return;
      const n = wt.trainings.norm;
      if (!normMap[n]) normMap[n] = { valid: 0, expired: 0 };
      if (wt.status === 'green') normMap[n].valid++;
      else if (wt.status === 'red' || wt.status === 'amber') normMap[n].expired++;
    });
    const normCompliance = Object.keys(normMap).map(n => {
      const { valid, expired } = normMap[n];
      const total = valid + expired;
      return { norm: n, pct: total > 0 ? Math.round((valid / total) * 100) : 100, valid, expired };
    });

    // 4. Resumo calculado dinamicamente
    const total        = reportWorkers.length;
    const conformes    = reportWorkers.filter(w => w.status === 'green').length;
    const emRisco      = reportWorkers.filter(w => w.status === 'amber').length;
    const naoConformes = reportWorkers.filter(w => w.status === 'red').length;
    const avgPct = total > 0
      ? Math.round(reportWorkers.reduce((a, w) => a + w.pct, 0) / total) : 0;

    res.json({
      reportWorkers, departments, normCompliance,
      summary: { totalWorkers: total, conformes, emRisco, naoConformes, avgCompliance: avgPct },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS — CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════

const CONFIG_FILE = path.join(__dirname, 'config.json');

app.get('/api/settings', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ error: 'Somente administradores podem ver as configurações.' });
  try {
    const config = readJSON(CONFIG_FILE, {
      alertDays: 30, autoRecalculate: true, theme: 'light',
    });
    // Nunca expõe as chaves do Supabase para o frontend
    const { supabaseUrl: _u, supabaseAnonKey: _k, ...safeConfig } = config;
    res.json(safeConfig);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ error: 'Somente administradores podem alterar as configurações.' });
  try {
    // Só salva campos permitidos — nunca aceita chaves do Supabase via request
    const { alertDays, autoRecalculate, theme } = req.body;
    const existing = readJSON(CONFIG_FILE, {});
    const updated  = { ...existing, alertDays, autoRecalculate, theme };
    writeJSON(CONFIG_FILE, updated);
    res.json({ message: 'Configurações salvas com sucesso!', config: { alertDays, autoRecalculate, theme } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES — CONFORMIDADE E DATAS
// ═══════════════════════════════════════════════════════════════

/**
 * Recalcula compliance, status e status_label de um trabalhador
 * com base em todos os seus worker_trainings no Supabase.
 */
async function recalculateCompliance(workerId) {
  if (!workerId || String(workerId).startsWith('local-')) return;
  try {
    const { data: trainings, error } = await supabase.from('worker_trainings')
      .select('status').eq('worker_id', workerId);
    if (error || !trainings?.length) return;

    const total      = trainings.length;
    const validCount = trainings.filter(t => t.status === 'green').length;
    const pct        = Math.round((validCount / total) * 100);

    const hasExpired = trainings.some(t => t.status === 'red' || t.status === 'amber');
    const hasPending = trainings.some(t => t.status === 'gray' || t.status === 'blue');

    let overallStatus = 'green', overallLabel = 'Conforme';
    if (hasExpired)                         { overallStatus = 'red';   overallLabel = 'Não conforme'; }
    else if (hasPending || pct < 100)       { overallStatus = 'amber'; overallLabel = 'Em risco';     }

    await supabase.from('workers')
      .update({ compliance: pct, status: overallStatus, status_label: overallLabel })
      .eq('id', workerId);
  } catch (err) {
    console.error('Falha ao recalcular conformidade:', err.message);
  }
}

/**
 * Meses em pt-BR para parsing/formatação de datas no formato "Jun 2026".
 */
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/**
 * Parseia "Jun 2026" → Date (dia 1 do mês).
 * Retorna null se o formato for inválido ou a string for "—".
 */
function parseExpiryDate(str) {
  if (!str || str === '—') return null;
  const parts = String(str).trim().split(' ');
  if (parts.length !== 2) return null;
  const m = MESES.indexOf(parts[0]);
  if (m < 0) return null;
  const year = parseInt(parts[1]);
  if (isNaN(year)) return null;
  return new Date(year, m, 1);
}

/**
 * Calcula data de vencimento a partir de:
 *   doneStr:     "Jun 2024" ou ISO "2024-06-01"
 *   validityStr: "2 anos" | "1 ano" | "6 meses"
 * Retorna string "Mmm YYYY" ou "—" se inválido.
 */
function calcExpiryDate(doneStr, validityStr) {
  try {
    let base;
    const parts = String(doneStr).trim().split(' ');
    if (parts.length === 2 && MESES.includes(parts[0])) {
      base = new Date(parseInt(parts[1]), MESES.indexOf(parts[0]), 1);
    } else {
      base = new Date(doneStr);
    }
    if (isNaN(base.getTime())) return '—';

    const match = String(validityStr).match(/(\d+)\s*(ano|mes|mês)/i);
    if (!match) return '—';

    const qty  = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('ano')) base.setFullYear(base.getFullYear() + qty);
    else                        base.setMonth(base.getMonth() + qty);

    return `${MESES[base.getMonth()]} ${base.getFullYear()}`;
  } catch (_) {
    return '—';
  }
}

/**
 * Retorna a cor de alerta com base nos dias restantes até o vencimento.
 *   > 60 dias  → 'green'
 *   30–60 dias → 'amber'
 *   < 30 dias ou passado → 'red'
 *   Inválido → ''
 */
function calcExpiryColor(expiresStr) {
  const exp = parseExpiryDate(expiresStr);
  if (!exp) return '';
  const diffDays = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
  if (diffDays > 60) return 'green';
  if (diffDays > 30) return 'amber';
  return 'red';
}

// ═══════════════════════════════════════════════════════════════
// INICIALIZAÇÃO DO SERVIDOR
// ═══════════════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
  console.log(`✓ Getrin rodando em http://localhost:${PORT}`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Porta ${PORT} já está em uso. Encerre o processo anterior ou altere a variável PORT.`);
    process.exit(0);
  } else {
    console.error('Erro ao iniciar servidor:', err);
    process.exit(1);
  }
});