'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');
const { loadLocalDb, saveLocalDb } = require('../repositories/localRepository');
const { ensureWorkerRecord, recalculateCompliance } = require('../repositories/supabaseRepository');
const { calcExpiryDate, calcExpiryColor, parseExpiryDate } = require('../utils/helpers');

// --- Trainings Catalog ---

router.get('/', requireAuth, async (req, res) => {
  try {
    const { company_id } = req.session;
    // Busca treinamentos globais (null) OU da empresa logada
    const { data, error } = await supabase
      .from('trainings')
      .select('*')
      .or(`company_id.is.null,company_id.eq.${company_id}`)
      .order('name');
    
    if (error) throw error;
    const local = loadLocalDb().trainings;
    res.json([...(data || []), ...local]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { name, norm, hours, validity, validity_months, roles, mode, worker_email } = req.body;
    if (!name || !norm || !hours || !validity || !mode)
      return res.status(400).json({ error: 'Campos obrigatórios: name, norm, hours, validity, mode.' });

    let training;
    try {
      const { data, error } = await supabase.from('trainings')
        .insert([{ 
          company_id, // Vincula à empresa
          name, norm, hours, validity, validity_months: validity_months || 12, roles, mode, 
          status: 'green', status_label: 'Ativo' 
        }])
        .select().single();
      if (error) throw error;
      training = data;
    } catch (_) {
      const db = loadLocalDb();
      training = {
        id: `local-training-${Date.now()}`, name, norm, hours, validity, roles, mode,
        status: 'green', status_label: 'Ativo', source: 'local',
      };
      db.trainings.push(training);
      saveLocalDb(db);
    }

    let assignment = null;
    if (worker_email) {
      const worker = await ensureWorkerRecord(worker_email);
      const db = loadLocalDb();
      assignment = {
        id: `local-assignment-${Date.now()}`,
        worker_email: worker.email, worker_id: worker.id,
        training_id: training.id, progress: 0,
        done: '—', expires: '—', status: 'gray', status_label: 'Pendente',
      };
      db.assignments.push(assignment);
      saveLocalDb(db);
    }

    res.status(201).json({ training, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
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

// --- Worker Training Assignments (mounted at /api/worker-trainings) ---

// Rota específica para atribuição para evitar conflito com a criação de treinamentos
router.post('/assign', requireAuth, requireManager, async (req, res) => {
  try {
    const { worker_id, worker_email, training_id, progress, done, expires, status, status_label } = req.body;
    if (!worker_id && !worker_email)
      return res.status(400).json({ error: 'worker_id ou worker_email é obrigatório.' });
    if (!training_id)
      return res.status(400).json({ error: 'training_id é obrigatório.' });

    let resolvedEmail = worker_email || '';
    if (!resolvedEmail && worker_id) {
      const { data } = await supabase.from('workers').select('email').eq('id', worker_id).maybeSingle();
      resolvedEmail = data?.email || '';
    }

    let finalExpires = expires || '—';
    let finalExpiresColor = '';
    let doneAt = null;

    if (done && done !== '—') {
      // Converte "Jun 2024" ou similar para uma data real para o trigger
      const parsedDate = parseExpiryDate(done);
      if (parsedDate) doneAt = parsedDate.toISOString().split('T')[0];

      const { data: tr } = await supabase.from('trainings').select('validity').eq('id', training_id).maybeSingle();
      if (tr?.validity) {
        finalExpires = calcExpiryDate(done, tr.validity);
        finalExpiresColor = calcExpiryColor(finalExpires);
      }
    }

    try {
      const resolvedWorkerId = worker_id || (await ensureWorkerRecord(resolvedEmail))?.id;
      const { data, error } = await supabase.from('worker_trainings')
        .insert([{
          worker_id: resolvedWorkerId, training_id,
          progress: progress ?? 0, 
          done: done || '—',
          done_at: doneAt, // Campo exigido pelo novo trigger de alertas
          expires: finalExpires,
          status: status || 'gray', status_label: status_label || 'Pendente',
        }]).select().single();
      if (error) throw error;
      await recalculateCompliance(resolvedWorkerId);
      return res.status(201).json(data);
    } catch (_) {
      const localWorker = await ensureWorkerRecord(resolvedEmail || `worker-${worker_id}`);
      const db = loadLocalDb();
      const t = db.trainings.find(tr => tr.id === training_id) || { id: training_id, name: 'Treinamento', norm: '—' };
      const assignment = {
        id: `local-assignment-${Date.now()}`,
        worker_email: localWorker.email, worker_id: localWorker.id,
        training_id: t.id, training_name: t.name, training_norm: t.norm,
        progress: progress ?? 0, done: done || '—',
        expires: finalExpires, status: status || 'gray', status_label: status_label || 'Pendente',
      };
      db.assignments.push(assignment);
      saveLocalDb(db);
      return res.status(201).json(assignment);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, requireManager, async (req, res) => {
  try {
    const { progress, done, training_id, status, status_label } = req.body;
    let expires = req.body.expires;
    let expires_color = req.body.expires_color;
    let done_at = null;

    if (done && done !== '—' && training_id) {
      const parsedDate = parseExpiryDate(done);
      if (parsedDate) done_at = parsedDate.toISOString().split('T')[0];

      const { data: tr } = await supabase.from('trainings').select('validity').eq('id', training_id).maybeSingle();
      if (tr?.validity) {
        expires       = calcExpiryDate(done, tr.validity);
        expires_color = calcExpiryColor(expires);
      }
    }

    const { data, error } = await supabase.from('worker_trainings')
      .update({ progress, done, done_at, expires, status, status_label })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    await recalculateCompliance(data.worker_id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
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

module.exports = router;
