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

module.exports = router;
