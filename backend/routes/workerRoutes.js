'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');
const { ensureWorkerRecord } = require('../repositories/supabaseRepository');
const { loadLocalDb } = require('../repositories/localRepository');
const { calcExpiryColor } = require('../utils/helpers');

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

/**
 * Listar usuários da users_profile que podem ser transformados em workers.
 * Filtra usuários com role 'worker' da mesma empresa que ainda não estão na tabela workers.
 */
router.get('/available-users', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;

    // Busca IDs que já estão na tabela workers
    const { data: existingWorkers, error: eError } = await supabase
      .from('workers')
      .select('id')
      .eq('company_id', company_id);
    
    if (eError) throw eError;
    const existingIds = (existingWorkers || []).map(w => w.id);

    // Busca usuários com role 'worker' da mesma empresa
    const { data: profiles, error: pError } = await supabase
      .from('users_profile')
      .select('id, name')
      .eq('company_id', company_id)
      .eq('role', 'worker');

    if (pError) throw pError;

    // Filtra apenas os que ainda não são workers
    const available = profiles.filter(p => !existingIds.includes(p.id));

    res.json(available);
  } catch (err) {
    console.error('Erro ao buscar usuários disponíveis:', err);
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
          id: a.id, 
          training_id: a.training_id,
          name: t.name || a.training_name || 'Treinamento', 
          norm: t.norm || a.training_norm || '—',
          progress: a.progress, 
          done_at: a.done_at, 
          expires: a.expires,
          status: a.status, 
          status_label: a.status_label,
        };
      });
    } else {
      const { data, error } = await supabase.from('worker_trainings')
        .select('id, progress, done_at, expires, status, status_label, trainings(id,name,norm)')
        .eq('worker_id', worker.id);
      if (error) throw error;

      trainings = (data || []).map(t => ({
        id: t.id, 
        training_id: t.trainings?.id,
        name: t.trainings?.name, 
        norm: t.trainings?.norm,
        progress: t.progress, 
        done_at: t.done_at, 
        expires: t.expires,
        status: t.status, 
        status_label: t.status_label,
      }));

      // Mescla atribuições locais
      const db = loadLocalDb();
      const existingIds = new Set(trainings.map(t => t.training_id));
      db.assignments.filter(a => a.worker_email === email).forEach(a => {
        if (existingIds.has(a.training_id)) return;
        const t = db.trainings.find(tr => tr.id === a.training_id) || {};
        trainings.push({
          id: a.id, 
          training_id: a.training_id,
          name: t.name || a.training_name || 'Treinamento', 
          norm: t.norm || a.training_norm || '—',
          progress: a.progress, 
          done_at: a.done_at, 
          expires: a.expires,
          status: a.status, 
          status_label: a.status_label,
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
      .select('id, progress, done, expires, status, status_label, trainings(id,name,norm)')
      .eq('worker_id', req.params.id);
    if (tErr) throw tErr;

    res.json({
      ...worker,
      trainings: trainings.map(t => ({
        id: t.id, training_id: t.trainings?.id,
        name: t.trainings?.name, norm: t.trainings?.norm,
        progress: t.progress, done: t.done, expires: t.expires,
        expires_color: calcExpiryColor(t.expires),
        status: t.status, status_label: t.status_label,
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
    const { id, name, initials, matricula, role, sector, manager, admission, email, phone } = req.body;
    
    // Agora o nome e email podem vir do frontend após selecionar o usuário ou serem validados
    if (!name || !role || !sector)
      return res.status(400).json({ error: 'Campos obrigatórios: name, role, sector.' });

    const insertData = { 
      company_id,
      name, initials, matricula, role, sector, manager, admission, email, phone,
      compliance: 0, status: 'gray', status_label: 'Pendente' 
    };

    // Se um ID da users_profile foi fornecido, usamos ele (FK obrigatória)
    if (id) insertData.id = id;

    const { data, error } = await supabase.from('workers')
      .insert([insertData])
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
    const { id: _id, company_id: _cid, compliance: _c, status: _s, status_label: _sl, created_at: _ca, ...safeBody } = req.body;
    
    // Garante que não estamos tentando atualizar campos sensíveis ou inexistentes
    const { data, error } = await supabase.from('workers')
      .update(safeBody).eq('id', req.params.id).select().single();
    
    if (error) {
      console.error('Erro ao atualizar worker:', error);
      return res.status(400).json({ error: error.message });
    }
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
