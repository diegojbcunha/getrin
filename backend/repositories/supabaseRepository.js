'use strict';

const supabase = require('../supabaseClient');
const localRepo = require('./localRepository');
const { formatNameFromEmail, makeInitials, calcExpiryDate, calcExpiryColor } = require('../utils/helpers');

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
  } catch (_) { /* Fallback local */ }
  
  const db = localRepo.loadLocalDb();
  const existingLocal = db.workers.find(w => w.email === email);
  if (existingLocal) return existingLocal;

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
  localRepo.saveLocalDb(db);
  return worker;
}

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

module.exports = {
  findWorkerByEmail,
  ensureWorkerRecord,
  recalculateCompliance
};
