/* =============================================================
   GETRIN — Servidor Backend
   backend/server.js
   ============================================================= */

const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabaseClient');

const authRepo     = require('./repositories/authRepository');
const workerRepo   = require('./repositories/workerRepository');
const trainingRepo = require('./repositories/trainingRepository');
const { enrichWorkerWithStats, mapTrainingStatus } = require('./utils/workerMapper');
const { mapTraining } = require('./utils/trainingMapper');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const projectRoot = path.join(__dirname, '..');
app.use(express.static(projectRoot));

app.get('/', (req, res) => res.redirect('/html/login.html'));
app.get('/login', (req, res) => res.redirect('/html/login.html'));

// ==========================================
// HELPERS
// ==========================================

async function getCompanyId() {
  try {
    const { data } = await supabase.from('companies').select('id').limit(1).maybeSingle();
    if (data?.id) return data.id;
  } catch (err) {
    console.error('Erro ao obter company_id:', err);
  }
  return 'c0000000-0000-0000-0000-000000000001';
}

function parseValidityMonths(validity) {
  const valStr = String(validity).toLowerCase();
  if (valStr.includes('ano')) return (parseInt(valStr, 10) || 1) * 12;
  if (valStr.includes('mes') || valStr.includes('mês')) return parseInt(valStr, 10) || 6;
  return 12;
}

function parseDoneAt(done) {
  if (!done || done === '—') return null;
  const parsed = new Date(done);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const data = await authRepo.signIn(email, password);
    const profile = await authRepo.getProfile(data.user.id);

    let role = 'worker';
    let name = data.user.email.split('@')[0];

    if (profile) {
      role = profile.role || role;
      name = profile.name || name;
    } else {
      if (email.includes('admin')) role = 'admin';
      else if (email.includes('gestor') || email.includes('manager')) role = 'manager';
      const companyId = await getCompanyId();
      await authRepo.upsertProfile({ id: data.user.id, companyId, name, role });
    }

    const initials = name.substring(0, 2).toUpperCase();
    res.json({
      token: data.session.access_token,
      user: { email: data.user.email, role, name, initials },
    });
  } catch (err) {
    res.status(401).json({ error: 'Credenciais inválidas.' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, role, inviteCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const requiresInvite = role === 'manager' || role === 'admin';
    if (requiresInvite && inviteCode !== 'GETRIN2026') {
      return res.status(403).json({ error: 'Código de convite inválido ou expirado.' });
    }

    const data = await authRepo.signUp(email, password);

    if (data.user) {
      const companyId = await getCompanyId();
      const name = email.split('@')[0];
      await authRepo.upsertProfile({ id: data.user.id, companyId, name, role: role || 'worker' });

      if (role === 'worker') {
        await supabase.from('workers').upsert([{
          id: data.user.id,
          company_id: companyId,
          name,
          initials: email.substring(0, 2).toUpperCase(),
          matricula: '#SP' + String(Date.now()).substring(9),
          role: 'Colaborador',
          sector: 'Geral',
          email,
        }]);
      }
    }

    res.status(201).json({ message: 'Cadastro realizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Não autorizado.' });

    const user = await authRepo.getUserFromToken(token);
    const profile = await authRepo.getProfile(user.id);

    const name = profile?.name || user.email.split('@')[0];
    const role = profile?.role || 'worker';

    res.json({ email: user.email, role, name, initials: name.substring(0, 2).toUpperCase() });
  } catch (err) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) await authRepo.signOut(token);
    res.json({ message: 'Sessão encerrada com sucesso.' });
  } catch (err) {
    res.json({ message: 'Sessão encerrada.' }); // não bloqueia o logout
  }
});

// ==========================================
// TRABALHADORES
// ==========================================

app.get('/api/workers', async (req, res) => {
  try {
    const workers = await workerRepo.listAll();
    res.json(workers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workers/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Não autorizado.' });

    const session = authRepo.getSession(token);
    let email = session?.email || null;

    if (!email) {
      const user = await authRepo.getSupabaseUser(token);
      email = user.email;
    }

    const worker = await workerRepo.findByEmail(email);
    if (!worker) return res.status(404).json({ error: 'Trabalhador não encontrado.' });

    const full = await workerRepo.findById(worker.id);
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workers/:id', async (req, res) => {
  try {
    const worker = await workerRepo.findById(req.params.id);
    res.json(worker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workers', async (req, res) => {
  try {
    const { name, initials, matricula, role, sector, manager, admission, email, phone } = req.body;

    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });

    const authUser = await authRepo.getOrCreateAuthUser(email);
    const companyId = await getCompanyId();

    const worker = await workerRepo.create({
      id: authUser.id,
      companyId,
      name, initials, matricula, role, sector, manager, admission, email, phone,
    });

    await authRepo.upsertProfile({ id: authUser.id, companyId, name, role: 'worker' });

    res.status(201).json(worker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workers/:id', async (req, res) => {
  try {
    const worker = await workerRepo.update(req.params.id, req.body);
    res.json(worker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workers/:id', async (req, res) => {
  try {
    await workerRepo.remove(req.params.id);
    res.json({ message: 'Trabalhador removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// TREINAMENTOS
// ==========================================

app.get('/api/trainings', async (req, res) => {
  try {
    const trainings = await trainingRepo.listAll();
    res.json(trainings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trainings', async (req, res) => {
  try {
    const { name, norm, hours, validity, mode, worker_email } = req.body;
    const companyId = await getCompanyId();
    const parsedHours = parseInt(String(hours).replace(/\D/g, ''), 10) || 0;
    const validityMonths = parseValidityMonths(validity);

    const training = await trainingRepo.create({ companyId, name, norm, hours: parsedHours, validityMonths, mode });

    let assignment = null;
    if (worker_email) {
      const worker = await workerRepo.findByEmail(worker_email);
      if (worker) {
        assignment = await trainingRepo.assignToWorker({ workerId: worker.id, trainingId: training.id });
      }
    }

    res.status(201).json({ training, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// VÍNCULOS DE TREINAMENTO
// ==========================================

app.post('/api/worker-trainings', async (req, res) => {
  try {
    const { worker_id, worker_email, training_id, progress, done } = req.body;

    if (!worker_id && !worker_email) {
      return res.status(400).json({ error: 'worker_id ou worker_email é obrigatório.' });
    }

    let worker = null;
    if (worker_id) {
      const { data } = await supabase.from('workers').select('*').eq('id', worker_id).maybeSingle();
      worker = data;
    }
    if (!worker && worker_email) {
      worker = await workerRepo.findByEmail(worker_email);
    }
    if (!worker) return res.status(404).json({ error: 'Trabalhador não encontrado.' });

    const assignment = await trainingRepo.assignToWorker({
      workerId: worker.id,
      trainingId: training_id,
      progress,
      doneAt: parseDoneAt(done),
    });

    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/worker-trainings/:id', async (req, res) => {
  try {
    const result = await trainingRepo.updateAssignment(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ALERTAS
// ==========================================

app.get('/api/alerts', async (req, res) => {
  try {
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: wtStatus } = await supabase
      .from('worker_trainings_status')
      .select('worker_id, norm, status');

    const affectedCounts = {};
    (wtStatus || []).forEach(row => {
      if (row.status !== 'green') {
        if (!affectedCounts[row.norm]) affectedCounts[row.norm] = new Set();
        affectedCounts[row.norm].add(row.worker_id);
      }
    });

    const mapped = (alerts || []).map(a => ({
      id: a.id,
      company_id: a.company_id,
      norm: a.norm,
      title: a.title,
      days: a.days_until_expiry,
      days_until_expiry: a.days_until_expiry,
      count: affectedCounts[a.norm] ? affectedCounts[a.norm].size : 3,
      level: a.level,
      created_at: a.created_at,
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// DASHBOARD
// ==========================================

app.get('/api/dashboard', async (req, res) => {
  try {
    const { data: workers, error: wErr } = await supabase.from('workers').select('id, name');
    if (wErr) throw wErr;

    const { data: wtStatus, error: wtErr } = await supabase.from('worker_trainings_status').select('*');
    if (wtErr) throw wtErr;

    const { buildWtMap } = require('./repositories/workerRepository');
    const wtMap = buildWtMap(wtStatus);

    const enriched = (workers || []).map(w => enrichWorkerWithStats(w, wtMap[w.id] || []));
    const total = enriched.length;
    const nonCompliant = enriched.filter(w => w.status === 'red').length;
    const avgCompliance = total > 0
      ? Math.round(enriched.reduce((acc, w) => acc + w.compliance, 0) / total)
      : 0;

    const { data: alerts, error: aErr } = await supabase.from('alerts').select('*');
    if (aErr) throw aErr;

    const affectedCounts = {};
    (wtStatus || []).forEach(row => {
      if (row.status !== 'green') {
        if (!affectedCounts[row.norm]) affectedCounts[row.norm] = new Set();
        affectedCounts[row.norm].add(row.worker_id);
      }
    });

    const mappedAlerts = (alerts || []).map(a => ({
      ...a,
      days: a.days_until_expiry,
      count: affectedCounts[a.norm] ? affectedCounts[a.norm].size : 3,
    }));

    const expiring = mappedAlerts.reduce((acc, a) => acc + (a.days <= 30 ? a.count : 0), 0);

    const workerNameMap = Object.fromEntries((workers || []).map(w => [w.id, w.name]));

    const { data: activities } = await supabase
      .from('worker_trainings_status')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentActivity = (activities || []).map(wt => {
      const mapped = mapTrainingStatus(wt);
      return {
        name: workerNameMap[wt.worker_id] || 'Desconhecido',
        training: mapped.name,
        norm: mapped.norm,
        date: mapped.done,
        status: mapped.status,
        statusLabel: mapped.statusLabel,
      };
    });

    res.json({
      metrics: { compliance: avgCompliance, workers: total, nonCompliant, expiring },
      alerts: mappedAlerts.slice(0, 3),
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// RELATÓRIOS
// ==========================================

app.get('/api/reports', async (req, res) => {
  try {
    const { data: workers, error: wErr } = await supabase
      .from('workers')
      .select('id, name, sector, role');
    if (wErr) throw wErr;

    const { data: wtStatus, error: wtErr } = await supabase
      .from('worker_trainings_status')
      .select('*');
    if (wtErr) throw wtErr;

    const { buildWtMap } = require('./repositories/workerRepository');
    const wtMap = buildWtMap(wtStatus);

    const enriched = (workers || []).map(w => enrichWorkerWithStats(w, wtMap[w.id] || []));

    const reportWorkers = enriched.map(w => {
      const trainings = wtMap[w.id] || [];
      return {
        name: w.name,
        sector: w.sector,
        role: w.role,
        valid: trainings.filter(t => t.status === 'green').length,
        expired: trainings.filter(t => t.status === 'red' || t.status === 'amber').length,
        pct: w.compliance,
        status: w.status,
        statusLabel: w.status_label,
      };
    });

    const depts = {};
    enriched.forEach(w => {
      const sector = w.sector || 'Outros';
      if (!depts[sector]) depts[sector] = { sum: 0, count: 0 };
      depts[sector].sum += w.compliance;
      depts[sector].count += 1;
    });
    const departments = Object.keys(depts).map(name => ({
      name,
      pct: Math.round(depts[name].sum / depts[name].count),
    }));

    const norms = {};
    (wtStatus || []).forEach(wt => {
      if (!wt.norm) return;
      if (!norms[wt.norm]) norms[wt.norm] = { valid: 0, expired: 0 };
      if (wt.status === 'green') norms[wt.norm].valid += 1;
      else if (wt.status === 'red' || wt.status === 'amber') norms[wt.norm].expired += 1;
    });
    const normCompliance = Object.keys(norms).map(norm => {
      const n = norms[norm];
      const total = n.valid + n.expired;
      return { norm, pct: total > 0 ? Math.round((n.valid / total) * 100) : 100, ...n };
    });

    res.json({ reportWorkers, departments, normCompliance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const fs = require('fs');
const configPath = path.join(__dirname, 'config.json');

app.get('/api/settings', (req, res) => {
  try {
    if (fs.existsSync(configPath)) {
      return res.json(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    }
    res.json({ supabaseUrl: '', supabaseAnonKey: '', alertDays: 30, autoRecalculate: true, theme: 'light' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ message: 'Configurações salvas com sucesso!', config: req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor rodando com sucesso na porta ${PORT}`);
  console.log(`🌐 Acesse o sistema em: http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ A porta ${PORT} já está em uso.`);
    try {
      const { execSync } = require('child_process');
      const output = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', timeout: 5000 });
      const pids = new Set(
        output.trim().split('\n').map(l => l.trim().split(/\s+/).pop()).filter(p => /^\d+$/.test(p) && p !== '0')
      );
      pids.forEach(pid => {
        try { execSync(`taskkill /PID ${pid} /F`); console.log(`✅ PID ${pid} encerrado.`); }
        catch (e) { console.warn(`⚠️ Não foi possível encerrar PID ${pid}`); }
      });
      setTimeout(() => server.listen(PORT), 600);
    } catch (e) {
      console.error('Falha ao liberar a porta automaticamente.');
      process.exit(1);
    }
    return;
  }
  console.error('Erro ao iniciar o servidor:', error);
  process.exit(1);
});