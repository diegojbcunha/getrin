const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

// Raiz do projeto (um nível acima de /backend)
const PROJECT_ROOT = path.join(__dirname, '..');

// Middlewares
app.use(cors());
app.use(express.json());

// Serve arquivos estáticos do frontend (css, js, html, etc.)
app.use('/css',  express.static(path.join(PROJECT_ROOT, 'css')));
app.use('/js',   express.static(path.join(PROJECT_ROOT, 'js')));
app.use('/html', express.static(path.join(PROJECT_ROOT, 'html')));
app.use(express.static(PROJECT_ROOT)); // serve index.html da raiz

// Rota raiz — redireciona para o login
app.get('/', (req, res) => {
  res.redirect('/html/login.html');
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ------------------------------------------
// GUIA DE ACESSO E PERFIS (LOGINS PARA TESTE):
// Como o sistema usa o Supabase Auth, você precisa primeiro CRIAR as contas 
// clicando em "Criar nova conta" na tela de login. Use as seguintes regras 
// de e-mail para que o sistema detecte o perfil correto automaticamente:
//
// Regras de segurança para perfis privilegiados:
// - worker: pode ser criado normalmente
// - manager/admin: só podem ser criados com um código válido vindo de
//   GETRIN_MANAGER_INVITE_CODE e GETRIN_ADMIN_INVITE_CODE no .env do backend
//
// 1. ADMIN: O e-mail deve conter a palavra "admin".
//    -> Exemplo de login: admin@getrin.com.br
//
// 2. GESTOR: O e-mail deve conter a palavra "gestor" ou "manager".
//    -> Exemplo de login: gestor@getrin.com.br
//
// 3. TRABALHADOR: Qualquer outro e-mail. Para testar o painel do funcionário
//    com dados reais, use um e-mail que já existe na tabela de trabalhadores.
//    -> Exemplo de login: f.rocha@metalurgica.com.br (Fernanda Rocha)
//    -> Exemplo de login: c.mendes@metalurgica.com.br (Carlos Mendes)
// ------------------------------------------
// ==========================================

// ---- Sistema de autenticação local (arquivo JSON) ----
const USERS_FILE = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const LOCAL_DB_FILE = path.join(__dirname, 'local_db.json');
const PRIVILEGED_SIGNUP_CODES = {
  manager: process.env.GETRIN_MANAGER_INVITE_CODE || '',
  admin: process.env.GETRIN_ADMIN_INVITE_CODE || ''
};

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Erro ao carregar users.json:', err);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar users.json:', err);
  }
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Erro ao carregar sessions.json:', err);
  }
  return {};
}

function saveSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar sessions.json:', err);
  }
}

function loadLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
      return {
        trainings: Array.isArray(raw.trainings) ? raw.trainings : [],
        assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
        workers: Array.isArray(raw.workers) ? raw.workers : []
      };
    }
  } catch (err) {
    console.error('Erro ao carregar local_db.json:', err);
  }
  return { trainings: [], assignments: [], workers: [] };
}

function saveLocalDb(db) {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar local_db.json:', err);
  }
}

function addLocalWorker(email) {
  const db = loadLocalDb();
  const existingWorker = db.workers.find(worker => worker.email === email);
  if (existingWorker) return existingWorker;

  const localPart = (email || '').split('@')[0] || 'colaborador';
  const initials = localPart
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || 'CL';

  const worker = {
    id: `local-worker-${Date.now()}`,
    name: formatNameFromEmail(email),
    initials,
    matricula: `#${Date.now().toString().slice(-5)}`,
    role: 'Colaborador',
    sector: '—',
    manager: '—',
    admission: new Date().toLocaleDateString('pt-BR'),
    email,
    phone: '—',
    compliance: 0,
    status: 'gray',
    status_label: 'Pendente',
    trainings: []
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
  const db = loadLocalDb();
  return db.assignments.filter(item => item.worker_email === email);
}

function getLocalTrainingById(trainingId) {
  const db = loadLocalDb();
  return db.trainings.find(training => training.id === trainingId) || null;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  sessions[token] = {
    email: user.email,
    role: user.role,
    name: user.name,
    initials: makeInitials(user.name),
    createdAt: new Date().toISOString()
  };
  saveSessions(sessions);
  return token;
}

function getLocalSession(token) {
  if (!token) return null;
  const sessions = loadSessions();
  return sessions[token] || null;
}

function deleteLocalSession(token) {
  if (!token) return;
  const sessions = loadSessions();
  if (sessions[token]) {
    delete sessions[token];
    saveSessions(sessions);
  }
}

async function findWorkerByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureWorkerRecord(email) {
  const existingWorker = await findWorkerByEmail(email);
  if (existingWorker) return existingWorker;
  // If worker not found in Supabase, create a local worker record instead
  // (some deployments restrict writes to Supabase via RLS)
  return addLocalWorker(email);
}

async function getOrCreateAuthUserByEmail(email) {
  if (!email) throw new Error('E-mail é obrigatório para criar o usuário do Supabase.');

  const randomPassword = crypto.randomBytes(12).toString('hex');

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true
    });

    if (error) throw error;
    return data.user || data;
  } catch (error) {
    const message = String(error?.message || '');

    // Se o usuário já existe, localiza pela API administrativa em vez de consultar auth.users como tabela.
    if (message.toLowerCase().includes('already registered') || message.toLowerCase().includes('already exists')) {
      const { data, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });

      if (listError) throw listError;

      const existingUser = (data?.users || []).find(user => user.email === email);
      if (existingUser) return existingUser;
    }

    throw error;
  }
}

async function addTrainingAssignmentByEmail({ email, trainingId, progress, done, expires, status, statusLabel }) {
  const worker = await ensureWorkerRecord(email);

  // Try to insert in Supabase; if it fails (RLS), fall back to local DB
  try {
    const { data, error } = await supabase
      .from('worker_trainings')
      .insert([{
        worker_id: worker.id,
        training_id: trainingId,
        progress: progress || 0,
        done: done || '—',
        expires: expires || '—',
        status: status || 'gray',
        status_label: statusLabel || 'Pendente'
      }])
      .select()
      .single();

    if (error) throw error;
    await recalculateCompliance(worker.id);
    return { worker, assignment: data };
  } catch (err) {
    const localAssign = addLocalAssignment({
      id: `local-assignment-${Date.now()}`,
      worker_email: worker.email,
      worker_id: worker.id,
      training_id: trainingId,
      progress: progress || 0,
      done: done || '—',
      expires: expires || '—',
      status: status || 'gray',
      status_label: statusLabel || 'Pendente'
    });
    return { worker, assignment: localAssign };
  }
}

function hashPassword(password) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}

function isPrivilegedSignupAllowed(role, inviteCode) {
  const expectedCode = PRIVILEGED_SIGNUP_CODES[role];
  return Boolean(expectedCode && inviteCode && inviteCode.trim() === expectedCode);
}

// Cadastro de usuário
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, role, inviteCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const users = loadUsers();
    if (users[email]) {
      return res.status(400).json({ error: 'Este e-mail já foi registrado.' });
    }

    const requestedRole = ['worker', 'manager', 'admin'].includes(role) ? role : 'worker';
    if (requestedRole !== 'worker' && !isPrivilegedSignupAllowed(requestedRole, inviteCode)) {
      return res.status(403).json({
        error: 'Criação de contas administrativas exige um código de convite válido.'
      });
    }

    const hashedPassword = hashPassword(password);
    const name = formatNameFromEmail(email);

    users[email] = {
      email,
      password: hashedPassword,
      role: requestedRole,
      name,
      createdAt: new Date().toISOString()
    };

    saveUsers(users);

    res.json({ 
      message: 'Conta criada com sucesso!', 
      user: { 
        email, 
        name,
        role: requestedRole
      } 
    });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const users = loadUsers();
    const user = users[email];

    if (!user || user.password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    const token = createSession(user);
    const role = user.role;
    const name = user.name;
    const initials = makeInitials(name);

    res.json({
      token: token,
      user: {
        id: email,
        email: user.email,
        name,
        initials,
        role
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    deleteLocalSession(token);
    res.json({ message: 'Logout realizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao realizar logout.' });
  }
});

// Verificar sessão atual
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });

    const localSession = getLocalSession(token);
    if (localSession) {
      res.json({
        id: localSession.email,
        email: localSession.email,
        name: localSession.name,
        initials: localSession.initials,
        role: localSession.role
      });
      return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Token inválido ou expirado.' });

    const user = data.user;
    const role = user.user_metadata?.role || detectRoleByEmail(user.email);
    const name = user.user_metadata?.name || formatNameFromEmail(user.email);
    const initials = makeInitials(name);

    res.json({ id: user.id, email: user.email, name, initials, role });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar sessão.' });
  }
});

// ---- Helpers de autenticação ----
function detectRoleByEmail(email) {
  if (!email) return 'worker';
  const e = email.toLowerCase();
  if (e.includes('admin')) return 'admin';
  if (e.includes('gestor') || e.includes('manager')) return 'manager';
  return 'worker';
}

function formatNameFromEmail(email) {
  if (!email) return 'Usuário';
  const local = email.split('@')[0];
  return local.split(/[._]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function makeInitials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('');
}

// ==========================================
// ROTAS DE TRABALHADORES (Workers)
// ==========================================

// Listar todos os trabalhadores
app.get('/api/workers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter o trabalhador autenticado pelo token
app.get('/api/workers/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });

    const localSession = getLocalSession(token);
    let email = localSession ? localSession.email : '';
    if (!email) {
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) return res.status(401).json({ error: 'Token inválido ou expirado.' });
      email = userData.user.email;
    }

    // Obter dados básicos do trabalhador por email
    const worker = await ensureWorkerRecord(email);

    // Obter treinamentos associados a este trabalhador
    let formattedTrainings = [];

    // Primeiro, buscar atribuições locais por e-mail (se houver)
    const localAssignments = getLocalAssignmentsByEmail(email || '');

    // Se for um worker local (criado no fallback), não tentamos buscar worker_trainings no Supabase
    if (String(worker.id).startsWith('local-worker-')) {
      formattedTrainings = localAssignments.map(t => {
        const trainingMeta = getLocalTrainingById(t.training_id) || { id: t.training_id, name: t.training_name || 'Treinamento', norm: t.training_norm || '—' };
        return {
          id: t.id,
          training_id: trainingMeta.id,
          name: trainingMeta.name,
          norm: trainingMeta.norm,
          progress: t.progress,
          done: t.done,
          expires: t.expires,
          expiresColor: t.expires_color || null,
          status: t.status,
          statusLabel: t.status_label
        };
      });
    } else {
      // Para workers do Supabase, buscar os registros lá e depois anexar eventuais atribuições locais
      const { data: trainings, error: trainingsError } = await supabase
        .from('worker_trainings')
        .select(`
          id, progress, done, expires, expires_color, status, status_label,
          trainings ( id, name, norm )
        `)
        .eq('worker_id', worker.id);

      if (trainingsError) throw trainingsError;

      formattedTrainings = (trainings || []).map(t => ({
        id: t.id,
        training_id: t.trainings.id,
        name: t.trainings.name,
        norm: t.trainings.norm,
        progress: t.progress,
        done: t.done,
        expires: t.expires,
        expiresColor: t.expires_color,
        status: t.status,
        statusLabel: t.status_label
      }));

      // Anexar atribuições locais (caso o gestor tenha criado alguma por e-mail)
      const extraLocal = localAssignments.map(t => {
        const trainingMeta = getLocalTrainingById(t.training_id) || { id: t.training_id, name: t.training_name || 'Treinamento', norm: t.training_norm || '—' };
        return {
          id: t.id,
          training_id: trainingMeta.id,
          name: trainingMeta.name,
          norm: trainingMeta.norm,
          progress: t.progress,
          done: t.done,
          expires: t.expires,
          expiresColor: t.expires_color || null,
          status: t.status,
          statusLabel: t.status_label
        };
      });

      // Evitar duplicatas simples: se já existe training_id igual, não duplicar
      const existingTrainingIds = new Set(formattedTrainings.map(t => t.training_id));
      for (const item of extraLocal) {
        if (!existingTrainingIds.has(item.training_id)) formattedTrainings.push(item);
      }
    }

    const formattedWorker = {
      ...worker,
      trainings: formattedTrainings
    };

    res.json(formattedWorker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter detalhe de um trabalhador pelo ID (incluindo seus treinamentos)
app.get('/api/workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obter dados básicos do trabalhador
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('*')
      .eq('id', id)
      .single();

    if (workerError) throw workerError;

    // Obter treinamentos associados a este trabalhador
    const { data: trainings, error: trainingsError } = await supabase
      .from('worker_trainings')
      .select(`
        id,
        progress,
        done,
        expires,
        expires_color,
        status,
        status_label,
        trainings (
          id,
          name,
          norm
        )
      `)
      .eq('worker_id', id);

    if (trainingsError) throw trainingsError;

    // Formatar a resposta no mesmo padrão que a interface espera
    const formattedWorker = {
      ...worker,
      trainings: trainings.map(t => ({
        id: t.id,
        training_id: t.trainings.id,
        name: t.trainings.name,
        norm: t.trainings.norm,
        progress: t.progress,
        done: t.done,
        expires: t.expires,
        expiresColor: t.expires_color,
        status: t.status,
        statusLabel: t.status_label
      }))
    };

    res.json(formattedWorker);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar um novo trabalhador
app.post('/api/workers', async (req, res) => {
  try {
    const { name, initials, matricula, role, sector, manager, admission, email, phone } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório para cadastrar trabalhador.' });
    }

    const authUser = await getOrCreateAuthUserByEmail(email);
    const workerId = authUser.id;

    const { data, error } = await supabase
      .from('workers')
      .upsert([{ 
        id: workerId,
        name, 
        initials, 
        matricula, 
        role, 
        sector, 
        manager, 
        admission, 
        email, 
        phone,
        compliance: 0,
        status: 'gray',
        status_label: 'Pendente'
      }], { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar dados de um trabalhador
app.put('/api/workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('workers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deletar um trabalhador
app.delete('/api/workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: "Trabalhador removido com sucesso." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROTAS DE TREINAMENTOS (Trainings)
// ==========================================

// Listar todos os treinamentos do catálogo
app.get('/api/trainings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trainings')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const localDb = loadLocalDb();
    res.json([...(data || []), ...localDb.trainings]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar um novo treinamento no catálogo
app.post('/api/trainings', async (req, res) => {
  try {
    const { name, norm, hours, validity, roles, mode, worker_email } = req.body;

    const training = {
      id: `local-training-${Date.now()}`,
      name,
      norm,
      hours,
      validity,
      roles,
      mode,
      status: 'green',
      status_label: 'Ativo',
      source: 'local'
    };

    addLocalTraining(training);

    let assignment = null;
    if (worker_email) {
      const worker = addLocalWorker(worker_email);
      assignment = addLocalAssignment({
        id: `local-assignment-${Date.now()}`,
        worker_email: worker.email,
        worker_id: worker.id,
        training_id: training.id,
        progress: 0,
        done: '—',
        expires: '—',
        status: 'gray',
        status_label: 'Pendente'
      });
    }

    res.status(201).json({ training, assignment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROTAS DE ATRIBUIÇÃO DE TREINAMENTOS
// ==========================================

// Atribuir treinamento a um trabalhador
app.post('/api/worker-trainings', async (req, res) => {
  try {
    const { worker_id, worker_email, training_id, progress, done, expires, status, status_label } = req.body;

    if (!worker_id && !worker_email) {
      return res.status(400).json({ error: 'worker_id ou worker_email é obrigatório.' });
    }

    let workerEmail = worker_email || '';
    if (!workerEmail && worker_id) {
      const { data: workerRow, error: workerError } = await supabase
        .from('workers')
        .select('email')
        .eq('id', worker_id)
        .maybeSingle();
      if (!workerError && workerRow?.email) {
        workerEmail = workerRow.email;
      }
    }

    const localWorker = addLocalWorker(workerEmail || `worker-${worker_id || Date.now()}@local`);
    const training = getLocalTrainingById(training_id) || { id: training_id, name: 'Treinamento', norm: '—' };

    const assignment = addLocalAssignment({
      id: `local-assignment-${Date.now()}`,
      worker_email: localWorker.email,
      worker_id: localWorker.id,
      training_id: training.id,
      training_name: training.name,
      training_norm: training.norm,
      progress: progress || 0,
      done: done || '—',
      expires: expires || '—',
      status: status || 'gray',
      status_label: status_label || 'Pendente'
    });

    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar progresso ou status do treinamento de um trabalhador
app.put('/api/worker-trainings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { progress, done, expires, status, status_label, expires_color } = req.body;

    const { data, error } = await supabase
      .from('worker_trainings')
      .update({ progress, done, expires, status, status_label, expires_color })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    // Atualiza a conformidade do trabalhador
    await recalculateCompliance(data.worker_id);

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROTAS DE ALERTAS (Alerts)
// ==========================================

// Listar todos os alertas ativos
app.get('/api/alerts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// ROTAS DE RELATÓRIOS E DASHBOARD
// ==========================================

// Obter dados do dashboard (métricas, alertas e atividades recentes)
app.get('/api/dashboard', async (req, res) => {
  try {
    // 1. Obter trabalhadores para calcular conformidade
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('compliance, status');

    if (workersError) throw workersError;

    // 2. Obter alertas
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (alertsError) throw alertsError;

    // 3. Obter atividades recentes (últimas alterações de treinamento)
    const { data: activities, error: activitiesError } = await supabase
      .from('worker_trainings')
      .select(`
        done,
        status,
        status_label,
        created_at,
        workers ( name ),
        trainings ( name, norm )
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (activitiesError) throw activitiesError;

    // Processar métricas
    const totalWorkers = workers.length;
    const nonCompliant = workers.filter(w => w.status === 'red').length;
    const avgCompliance = totalWorkers > 0 
      ? Math.round(workers.reduce((acc, w) => acc + w.compliance, 0) / totalWorkers) 
      : 0;
    const expiring = alerts.reduce((acc, a) => acc + a.count, 0);

    const metrics = {
      compliance: avgCompliance,
      workers: totalWorkers,
      expiring: expiring,
      nonCompliant: nonCompliant
    };

    const recentActivity = activities.map(wt => ({
      name: wt.workers ? wt.workers.name : 'Desconhecido',
      training: wt.trainings ? wt.trainings.name : 'Desconhecido',
      norm: wt.trainings ? wt.trainings.norm : '—',
      date: wt.done !== '—' ? wt.done : 'Em andamento',
      status: wt.status,
      statusLabel: wt.status_label
    }));

    res.json({
      metrics,
      alerts,
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter dados consolidados para relatórios
app.get('/api/reports', async (req, res) => {
  try {
    // 1. Obter trabalhadores com contagens de treinamentos
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select(`
        id, name, sector, role, compliance, status, status_label,
        worker_trainings (
          status
        )
      `);

    if (workersError) throw workersError;

    const reportWorkers = workers.map(w => {
      const valid = w.worker_trainings ? w.worker_trainings.filter(wt => wt.status === 'green').length : 0;
      const expired = w.worker_trainings ? w.worker_trainings.filter(wt => wt.status === 'red' || wt.status === 'amber').length : 0;
      return {
        name: w.name,
        sector: w.sector,
        role: w.role,
        valid,
        expired,
        pct: w.compliance,
        status: w.status,
        statusLabel: w.status_label
      };
    });

    // 2. Calcular conformidade por setor
    const depts = {};
    workers.forEach(w => {
      if (!depts[w.sector]) depts[w.sector] = { sum: 0, count: 0 };
      depts[w.sector].sum += w.compliance;
      depts[w.sector].count += 1;
    });
    const departments = Object.keys(depts).map(name => ({
      name,
      pct: Math.round(depts[name].sum / depts[name].count)
    }));

    // 3. Calcular conformidade por norma (NR)
    const { data: workerTrainings, error: wtError } = await supabase
      .from('worker_trainings')
      .select(`
        status,
        trainings (
          norm
        )
      `);

    if (wtError) throw wtError;

    const norms = {};
    workerTrainings.forEach(wt => {
      if (!wt.trainings) return;
      const norm = wt.trainings.norm;
      if (!norms[norm]) norms[norm] = { valid: 0, expired: 0 };
      if (wt.status === 'green') {
        norms[norm].valid += 1;
      } else if (wt.status === 'red' || wt.status === 'amber') {
        norms[norm].expired += 1;
      }
    });

    const normCompliance = Object.keys(norms).map(norm => {
      const n = norms[norm];
      const total = n.valid + n.expired;
      const pct = total > 0 ? Math.round((n.valid / total) * 100) : 100;
      return {
        norm,
        pct,
        valid: n.valid,
        expired: n.expired
      };
    });

    res.json({
      reportWorkers,
      departments,
      normCompliance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

// Recalcular conformidade reativamente ao alterar um treinamento
async function recalculateCompliance(workerId) {
  try {
    const { data: trainings, error } = await supabase
      .from('worker_trainings')
      .select('status')
      .eq('worker_id', workerId);

    if (error) throw error;
    if (!trainings || trainings.length === 0) return;

    const total = trainings.length;
    const validCount = trainings.filter(t => t.status === 'green').length;
    
    const compliancePercent = Math.round((validCount / total) * 100);
    
    let overallStatus = 'green';
    let overallLabel = 'Conforme';
    
    const hasExpired = trainings.some(t => t.status === 'red' || t.status === 'amber');
    const hasPending = trainings.some(t => t.status === 'gray' || t.status === 'blue');

    if (hasExpired) {
      overallStatus = 'red';
      overallLabel = 'Não conforme';
    } else if (hasPending || compliancePercent < 100) {
      overallStatus = 'amber';
      overallLabel = 'Em risco';
    }

    await supabase
      .from('workers')
      .update({ 
        compliance: compliancePercent,
        status: overallStatus,
        status_label: overallLabel
      })
      .eq('id', workerId);

  } catch (err) {
    console.error("Falha ao recalcular conformidade do trabalhador:", err.message);
  }
}

// (fs e path já importados no topo)

// ==========================================
// ROTAS DE CONFIGURAÇÃO (Settings)
// ==========================================

// Obter as configurações
app.get('/api/settings', (req, res) => {
  const configPath = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      res.json(config);
    } else {
      res.json({
        supabaseUrl: "",
        supabaseAnonKey: "",
        alertDays: 30,
        autoRecalculate: true,
        theme: "light"
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Salvar as configurações
app.post('/api/settings', (req, res) => {
  const configPath = path.join(__dirname, 'config.json');
  try {
    const newConfig = req.body;
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    res.json({ message: "Configurações salvas com sucesso!", config: newConfig });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rotas de conveniência
app.get('/login', (req, res) => {
  res.redirect('/html/login.html');
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
  console.log(`Acesse o sistema em: http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} já está em uso. Provavelmente já existe outra instância do backend rodando.`);
    console.error('Feche o processo antigo ou libere a porta antes de iniciar outro servidor.');
    process.exit(0);
    return;
  }

  console.error('Erro ao iniciar o servidor:', error);
  process.exit(1);
});
