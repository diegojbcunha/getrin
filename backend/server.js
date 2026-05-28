const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
// ==========================================

// Cadastro de usuário
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Usando supabase.auth.signUp para criar o usuário no DB
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error('Supabase SignUp Error:', error);
      return res.status(401).json({ error: 'Erro ao criar conta. O e-mail pode já existir ou a senha é muito fraca.' });
    }

    res.json({ message: 'Conta criada com sucesso!', user: data.user });
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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    const user = data.user;
    const session = data.session;

    // Detectar papel do usuário pelo e-mail (ou metadata se configurado no Supabase)
    const role = user.user_metadata?.role || detectRoleByEmail(email);
    const name = user.user_metadata?.name || formatNameFromEmail(email);
    const initials = makeInitials(name);

    res.json({
      token: session.access_token,
      user: {
        id: user.id,
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
    await supabase.auth.signOut();
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
    
    const { data, error } = await supabase
      .from('workers')
      .insert([{ 
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
      }])
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
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar um novo treinamento no catálogo
app.post('/api/trainings', async (req, res) => {
  try {
    const { name, norm, hours, validity, roles, mode } = req.body;
    
    const { data, error } = await supabase
      .from('trainings')
      .insert([{ name, norm, hours, validity, roles, mode, status: 'green', status_label: 'Ativo' }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
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
    const { worker_id, training_id, progress, done, expires, status, status_label } = req.body;
    
    const { data, error } = await supabase
      .from('worker_trainings')
      .insert([{
        worker_id,
        training_id,
        progress: progress || 0,
        done: done || '—',
        expires: expires || '—',
        status: status || 'gray',
        status_label: status_label || 'Pendente'
      }])
      .select()
      .single();

    if (error) throw error;
    
    // Atualizar a taxa de conformidade geral do trabalhador de forma reativa
    await recalculateCompliance(worker_id);

    res.status(201).json(data);
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
app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
  console.log(`Acesse o sistema em: http://localhost:${PORT}`);
});
