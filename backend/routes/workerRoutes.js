'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');
const { ensureWorkerRecord } = require('../repositories/supabaseRepository');
const { loadLocalDb } = require('../repositories/localRepository');

// Listar todos (gestor/admin da empresa logada)
router.get('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('company_id', company_id)
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trabalhador logado — retorna seus próprios dados e treinamentos
router.get('/me', requireAuth, async (req, res) => {
  try {
    const email  = req.session.email;
    const worker = await ensureWorkerRecord(email);

    let trainings = [];

    if (String(worker.id).startsWith('local-worker-')) {
      const db = loadLocalDb();
      trainings = db.assignments.filter(a => a.worker_email === email).map(a => {
        const t = db.trainings.find(tr => tr.id === a.training_id) || {};
        return {
          id: a.id, training_id: a.training_id,
          name: t.name || a.training_name || 'Treinamento', norm: t.norm || a.training_norm || '—',
          progress: a.progress, done: a.done, expires: a.expires,
        expiresColor: a.expires_color || null, status: a.status, statusLabel: a.status_label,
      };
    });
  } else {
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

    // Mescla atribuições locais
    const db = loadLocalDb();
    const existingIds = new Set(trainings.map(t => t.training_id));
    db.assignments.filter(a => a.worker_email === email).forEach(a => {
      if (existingIds.has(a.training_id)) return;
      const t = db.trainings.find(tr => tr.id === a.training_id) || {};
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
router.get('/:id', requireAuth, requireManager, async (req, res) => {
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
        expiresColor: t.expires_color, status: t.status, status_label: t.status_label,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar trabalhador (gestor/admin)
router.post('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { name, initials, matricula, role, sector, manager, admission, email, phone } = req.body;
    if (!name || !email || !role || !sector)
      return res.status(400).json({ error: 'Campos obrigatórios: name, email, role, sector.' });

    const { data, error } = await supabase.from('workers')
      .insert([{ 
        company_id, // Vincula à empresa do gestor
        name, initials, matricula, role, sector, manager, admission, email, phone,
        compliance: 0, status: 'gray', status_label: 'Pendente' 
      }])
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar trabalhador (gestor/admin)
router.put('/:id', requireAuth, requireManager, async (req, res) => {
  try {
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
router.delete('/:id', requireAuth, async (req, res) => {
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

// Atualizar o próprio perfil (configurações do worker)
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user_id;
    const { name, initials, phone } = req.body;

    // Atualiza o perfil na tabela workers (que compartilha o mesmo ID do usuário)
    const { data, error } = await supabase
      .from('workers')
      .update({ name, initials, phone })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    // Também atualiza o users_profile para manter o nome sincronizado
    await supabase
      .from('users_profile')
      .update({ name })
      .eq('id', userId);

    res.json({ message: 'Perfil atualizado com sucesso!', worker: data });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
