// backend/repositories/trainingRepository.js
const supabase = require('../supabaseClient');
const { mapTraining } = require('../utils/trainingMapper');
const { mapTrainingStatus } = require('../utils/workerMapper');

async function listAll() {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapTraining);
}

async function create({ companyId, name, norm, hours, validityMonths, mode }) {
  const { data, error } = await supabase
    .from('trainings')
    .insert([{ company_id: companyId, name, norm, hours, validity_months: validityMonths, mode, is_active: true }])
    .select()
    .single();
  if (error) throw error;
  return mapTraining(data);
}

async function assignToWorker({ workerId, trainingId, progress, doneAt }) {
  const { data, error } = await supabase
    .from('worker_trainings')
    .insert([{ worker_id: workerId, training_id: trainingId, progress: progress || 0, done_at: doneAt || null }])
    .select()
    .single();
  if (error) throw error;

  const { data: viewRow } = await supabase
    .from('worker_trainings_status')
    .select('*')
    .eq('id', data.id)
    .single();

  return viewRow ? mapTrainingStatus(viewRow) : data;
}

async function updateAssignment(id, { progress, done }) {
  const update = {};
  if (progress !== undefined) update.progress = progress;
  if (progress === 100) {
    update.done_at = new Date().toISOString().split('T')[0];
  } else if (done && done !== '—') {
    const parsed = new Date(done);
    if (!isNaN(parsed.getTime())) update.done_at = parsed.toISOString().split('T')[0];
  }

  const { data, error } = await supabase
    .from('worker_trainings')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const { data: viewRow } = await supabase
    .from('worker_trainings_status')
    .select('*')
    .eq('id', id)
    .single();

  return viewRow ? mapTrainingStatus(viewRow) : data;
}

module.exports = { listAll, create, assignToWorker, updateAssignment };