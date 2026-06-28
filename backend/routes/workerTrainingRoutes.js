'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');
const { loadLocalDb, saveLocalDb } = require('../repositories/localRepository');
const { ensureWorkerRecord, recalculateCompliance } = require('../repositories/supabaseRepository');
const { calcExpiryDate, calcExpiryColor, parseExpiryDate } = require('../utils/helpers');
const { parseMaterials, parseViewedMaterials, parseMaterialProgress, calculateMaterialProgress } = require('../utils/materials');

function statusFromProgress(progress, currentStatus) {
  if (progress >= 100) return { status: 'green', status_label: 'Concluido' };
  if (currentStatus === 'red' || currentStatus === 'amber') {
    return { status: currentStatus, status_label: currentStatus === 'red' ? 'Vencido' : 'Em risco' };
  }
  if (progress > 0) return { status: 'blue', status_label: 'Em andamento' };
  return { status: 'gray', status_label: 'Pendente' };
}

function makeCertificateCode() {
  return `GETRIN-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function ensureCertificate(assignmentId) {
  const { data: existing, error: existingError } = await supabase
    .from('certificates')
    .select('*')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: assignment, error } = await supabase
    .from('worker_trainings')
    .select('id, worker_id, training_id, done_at, expires, workers!inner(name, email, company_id), trainings!inner(name, norm, hours)')
    .eq('id', assignmentId)
    .single();
  if (error) throw error;

  const { data: certificate, error: insertError } = await supabase
    .from('certificates')
    .insert([{
      assignment_id: assignment.id,
      worker_id: assignment.worker_id,
      training_id: assignment.training_id,
      company_id: assignment.workers.company_id,
      code: makeCertificateCode(),
      worker_name: assignment.workers.name,
      worker_email: assignment.workers.email,
      training_name: assignment.trainings.name,
      norm: assignment.trainings.norm,
      hours: assignment.trainings.hours,
      issued_at: assignment.done_at || new Date().toISOString().split('T')[0],
      expires_at: assignment.expires || null,
    }])
    .select()
    .single();
  if (insertError) throw insertError;
  return certificate;
}

router.get('/certificates/verify/:code', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('certificates')
      .select('code, worker_name, worker_email, training_name, norm, hours, issued_at, expires_at, created_at')
      .eq('code', req.params.code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ valid: false, error: 'Certificado nao encontrado.' });
    res.json({ valid: true, certificate: data });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

router.post('/assign', requireAuth, requireManager, async (req, res) => {
  try {
    const { worker_id, worker_email, training_id, progress, done_at, expires, status, status_label } = req.body;
    if (!worker_id && !worker_email)
      return res.status(400).json({ error: 'worker_id ou worker_email é obrigatório.' });
    if (!training_id)
      return res.status(400).json({ error: 'training_id é obrigatório.' });

    let resolvedEmail = worker_email || '';
    if (!resolvedEmail && worker_id) {
      const { data } = await supabase.from('workers').select('email').eq('id', worker_id).maybeSingle();
      resolvedEmail = data?.email || '';
    }

    let finalDoneAt = done_at ? done_at : null;
    let finalExpires = expires ? expires : null;

    // Se done_at foi fornecido, calcular expires baseado na validade do treinamento
    if (finalDoneAt) {
      const { data: tr } = await supabase.from('trainings')
        .select('validity_months')
        .eq('id', training_id)
        .maybeSingle();
      
      if (tr?.validity_months) {
        const doneDate = new Date(finalDoneAt);
        const expiryDate = new Date(doneDate);
        expiryDate.setMonth(expiryDate.getMonth() + tr.validity_months);
        finalExpires = expiryDate.toISOString().split('T')[0];
      }
    }

    try {
      const resolvedWorkerId = worker_id || (await ensureWorkerRecord(resolvedEmail))?.id;
      const { data, error } = await supabase.from('worker_trainings')
        .insert([{ 
          worker_id: resolvedWorkerId,
          training_id,
          progress: progress ?? 0,
          viewed_materials: [],
          done_at: finalDoneAt,
          expires: finalExpires,
          status: status || 'gray',
          status_label: status_label || 'Pendente'
        }])
        .select()
        .single();
      if (error) throw error;
      await recalculateCompliance(resolvedWorkerId);
      return res.status(201).json(data);
    } catch (err) {
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
        viewed_materials: [],
        done_at: finalDoneAt,
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

router.post('/:id/materials/:materialId/viewed', requireAuth, async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const materialId = String(req.params.materialId);
    const viewSeconds = Math.max(0, Number(req.body?.view_seconds || req.body?.seconds || 0));

    const { data: assignment, error } = await supabase
      .from('worker_trainings')
      .select('id, worker_id, training_id, progress, status, done_at, viewed_materials, material_progress, workers!inner(email, company_id), trainings(id, materials, validity_months)')
      .eq('id', assignmentId)
      .single();

    if (error) throw error;
    if (!assignment) return res.status(404).json({ error: 'Atribuicao nao encontrada.' });

    const isOwner = assignment.workers?.email === req.session.email || assignment.worker_id === req.session.user_id;
    const isManager = ['manager', 'admin'].includes(req.session.role)
      && assignment.workers?.company_id === req.session.company_id;

    if (!isOwner && !isManager) {
      return res.status(403).json({ error: 'Voce nao tem permissao para atualizar este treinamento.' });
    }

    const materials = parseMaterials(assignment.trainings?.materials || []);
    const material = materials.find(m => String(m.id) === materialId);
    if (!material) {
      return res.status(404).json({ error: 'Material nao encontrado neste treinamento.' });
    }

    const requiredSeconds = Number(material.min_seconds) || (material.type === 'pdf' ? 20 : 30);
    if (!isManager && viewSeconds < requiredSeconds) {
      return res.status(400).json({
        error: `Tempo minimo de visualizacao nao atingido. Necessario: ${requiredSeconds}s.`,
        required_seconds: requiredSeconds,
        received_seconds: viewSeconds,
      });
    }

    const viewed = new Set(parseViewedMaterials(assignment.viewed_materials));
    viewed.add(materialId);
    const viewed_materials = Array.from(viewed);
    const material_progress = parseMaterialProgress(assignment.material_progress);
    material_progress[materialId] = {
      status: 'completed',
      type: material.type,
      view_seconds: viewSeconds,
      required_seconds: requiredSeconds,
      completed_at: new Date().toISOString(),
    };
    const nextProgress = calculateMaterialProgress(materials, viewed_materials);
    const nextStatus = statusFromProgress(nextProgress, assignment.status);

    const update = {
      viewed_materials,
      material_progress,
      progress: nextProgress,
      status: nextStatus.status,
      status_label: nextStatus.status_label,
    };

    if (nextProgress >= 100 && !assignment.done_at) {
      const done = new Date();
      update.done_at = done.toISOString().split('T')[0];
      if (assignment.trainings?.validity_months) {
        done.setMonth(done.getMonth() + assignment.trainings.validity_months);
        update.expires = done.toISOString().split('T')[0];
      }
    }

    const { data, error: updateError } = await supabase
      .from('worker_trainings')
      .update(update)
      .eq('id', assignmentId)
      .select()
      .single();

    if (updateError) throw updateError;
    await recalculateCompliance(data.worker_id);
    if (nextProgress >= 100) {
      try {
        data.certificate = await ensureCertificate(data.id);
      } catch (certErr) {
        console.error('Erro ao gerar certificado:', certErr.message);
        data.certificate_error = certErr.message;
      }
    }

    res.json(data);
  } catch (err) {
    const db = loadLocalDb();
    const assignment = db.assignments.find(a => a.id === req.params.id);
    if (!assignment) return res.status(500).json({ error: err.message });

    const training = db.trainings.find(t => t.id === assignment.training_id) || {};
    const materials = parseMaterials(training.materials || []);
    const material = materials.find(m => String(m.id) === String(req.params.materialId));
    const requiredSeconds = Number(material?.min_seconds) || (material?.type === 'pdf' ? 20 : 30);
    const viewSeconds = Math.max(0, Number(req.body?.view_seconds || req.body?.seconds || 0));
    if (viewSeconds < requiredSeconds) {
      return res.status(400).json({
        error: `Tempo minimo de visualizacao nao atingido. Necessario: ${requiredSeconds}s.`,
        required_seconds: requiredSeconds,
        received_seconds: viewSeconds,
      });
    }
    const viewed = new Set(parseViewedMaterials(assignment.viewed_materials));
    viewed.add(String(req.params.materialId));
    assignment.viewed_materials = Array.from(viewed);
    assignment.material_progress = assignment.material_progress || {};
    assignment.material_progress[String(req.params.materialId)] = {
      status: 'completed',
      type: material?.type || 'youtube',
      view_seconds: viewSeconds,
      required_seconds: requiredSeconds,
      completed_at: new Date().toISOString(),
    };
    assignment.progress = calculateMaterialProgress(materials, assignment.viewed_materials);
    const nextStatus = statusFromProgress(assignment.progress, assignment.status);
    assignment.status = nextStatus.status;
    assignment.status_label = nextStatus.status_label;
    if (assignment.progress >= 100 && !assignment.done_at) {
      assignment.done_at = new Date().toISOString().split('T')[0];
    }
    saveLocalDb(db);
    res.json(assignment);
  }
});

router.get('/:id/certificate', requireAuth, async (req, res) => {
  try {
    const { data: assignment, error } = await supabase
      .from('worker_trainings')
      .select('id, worker_id, progress, status, workers!inner(email, company_id)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!assignment || assignment.progress < 100 || assignment.status !== 'green') {
      return res.status(404).json({ error: 'Certificado indisponivel.' });
    }

    const isOwner = assignment.workers?.email === req.session.email || assignment.worker_id === req.session.user_id;
    const isManager = ['manager', 'admin'].includes(req.session.role)
      && assignment.workers?.company_id === req.session.company_id;
    if (!isOwner && !isManager) {
      return res.status(403).json({ error: 'Voce nao tem permissao para acessar este certificado.' });
    }

    const certificate = await ensureCertificate(req.params.id);
    res.json(certificate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, requireManager, async (req, res) => {
  try {
    const { data: existing, error: existingError } = await supabase
      .from('worker_trainings')
      .select('id, workers!inner(company_id)')
      .eq('id', req.params.id)
      .single();
    if (existingError) throw existingError;
    if (existing.workers?.company_id !== req.session.company_id) {
      return res.status(403).json({ error: 'Voce nao tem permissao para atualizar esta atribuicao.' });
    }

    const { progress, done_at, training_id, status, status_label } = req.body;
    let expires = req.body.expires;

    // Se done_at foi fornecido, calcular expires baseado na validade do treinamento
    if (done_at && training_id) {
      const { data: tr } = await supabase.from('trainings')
        .select('validity_months')
        .eq('id', training_id)
        .maybeSingle();
      
      if (tr?.validity_months) {
        const doneDate = new Date(done_at);
        const expiryDate = new Date(doneDate);
        expiryDate.setMonth(expiryDate.getMonth() + tr.validity_months);
        expires = expiryDate.toISOString().split('T')[0];
      }
    }

    const { data, error } = await supabase.from('worker_trainings')
      .update({ progress, done_at, expires, status, status_label })
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
    const { data: existing, error: existingError } = await supabase
      .from('worker_trainings')
      .select('id, workers!inner(company_id)')
      .eq('id', req.params.id)
      .single();
    if (existingError) throw existingError;
    if (existing.workers?.company_id !== req.session.company_id) {
      return res.status(403).json({ error: 'Voce nao tem permissao para remover esta atribuicao.' });
    }

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
