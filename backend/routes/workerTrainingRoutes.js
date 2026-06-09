'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');
const { loadLocalDb, saveLocalDb } = require('../repositories/localRepository');
const { ensureWorkerRecord, recalculateCompliance } = require('../repositories/supabaseRepository');
const { calcExpiryDate, calcExpiryColor, parseExpiryDate } = require('../utils/helpers');

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
    let doneAt = null;

    if (done && done !== '—') {
      const parsedDate = parseExpiryDate(done);
      if (parsedDate) doneAt = parsedDate.toISOString().split('T')[0];

      const { data: tr } = await supabase.from('trainings').select('validity').eq('id', training_id).maybeSingle();
      if (tr?.validity) {
        finalExpires = calcExpiryDate(done, tr.validity);
      }
    }

    try {
      const resolvedWorkerId = worker_id || (await ensureWorkerRecord(resolvedEmail))?.id;
      const { data, error } = await supabase.from('worker_trainings')
        .insert([{ 
          worker_id: resolvedWorkerId,
          training_id,
          progress: progress ?? 0,
          done: done || '—',
          done_at: doneAt,
          expires: finalExpires,
          status: status || 'gray',
          status_label: status_label || 'Pendente'
        }])
        .select()
        .single();
      if (error) throw error;
      await recalculateCompliance(resolvedWorkerId);
      return res.status(201).json(data);
    } catch (_) {
      const localWorker = await ensureWorkerRecord(resolvedEmail || `worker-${worker_id}`);
      const db = loadLocalDb();
      const t = db.trainings.find(tr => tr.id === training_id) || { id: training_id, name: 'Treinamento', norm: '—' };
      const assignment = {
        id: `local-assignment-${Date.now()}`,
        worker_email: localWorker.email,
        worker_id: localWorker.id,
        training_id: t.id,
        training_name: t.name,
        training_norm: t.norm,
        progress: progress ?? 0,
        done: done || '—',
        expires: finalExpires,
        status: status || 'gray',
        status_label: status_label || 'Pendente',
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
    let done_at = null;

    if (done && done !== '—' && training_id) {
      const parsedDate = parseExpiryDate(done);
      if (parsedDate) done_at = parsedDate.toISOString().split('T')[0];

      const { data: tr } = await supabase.from('trainings').select('validity').eq('id', training_id).maybeSingle();
      if (tr?.validity) {
        expires = calcExpiryDate(done, tr.validity);
      }
    }

    const { data, error } = await supabase.from('worker_trainings')
      .update({ progress, done, done_at, expires, status, status_label })
      .eq('id', req.params.id)
      .select()
      .single();
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
      .select('worker_id')
      .eq('id', req.params.id)
      .maybeSingle();
    const { error } = await supabase.from('worker_trainings').delete().eq('id', req.params.id);
    if (error) throw error;
    if (wt?.worker_id) await recalculateCompliance(wt.worker_id);
    res.json({ message: 'Atribuição removida com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
