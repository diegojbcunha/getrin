// backend/repositories/workerRepository.js
const supabase = require('../supabaseClient');
const { enrichWorkerWithStats, mapTrainingStatus } = require('../utils/workerMapper');

async function listAll() {
  const { data: workers, error } = await supabase
    .from('workers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;

  const { data: wtStatus, error: wtErr } = await supabase
    .from('worker_trainings_status')
    .select('*');
  if (wtErr) throw wtErr;

  const wtMap = buildWtMap(wtStatus);

  return (workers || []).map(w => enrichWorkerWithStats(w, wtMap[w.id] || []));
}

async function findById(id) {
  const { data: worker, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  const { data: trainings, error: tErr } = await supabase
    .from('worker_trainings_status')
    .select('*')
    .eq('worker_id', id);
  if (tErr) throw tErr;

  const mapped = (trainings || []).map(mapTrainingStatus);
  return { ...enrichWorkerWithStats(worker, mapped), trainings: mapped };
}

async function findByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function create({ id, companyId, name, initials, matricula, role, sector, manager, admission, email, phone }) {
  const { data, error } = await supabase
    .from('workers')
    .upsert([{ id, company_id: companyId, name, initials, matricula, role, sector, manager, admission: admission || null, email, phone }], { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return enrichWorkerWithStats(data, []);
}

async function update(id, fields) {
  const allowed = ['name', 'initials', 'matricula', 'role', 'sector', 'manager', 'admission', 'email', 'phone'];
  const filtered = Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabase
    .from('workers')
    .update(filtered)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const { data: trainings } = await supabase
    .from('worker_trainings_status')
    .select('*')
    .eq('worker_id', id);

  const mapped = (trainings || []).map(mapTrainingStatus);
  return enrichWorkerWithStats(data, mapped);
}

async function remove(id) {
  const { error } = await supabase.from('workers').delete().eq('id', id);
  if (error) throw error;
  try {
    await supabase.auth.admin.deleteUser(id);
  } catch (e) {
    console.warn('Não foi possível excluir auth do trabalhador:', e.message);
  }
}

// helper interno
function buildWtMap(wtStatus) {
  const map = {};
  (wtStatus || []).forEach(row => {
    if (!map[row.worker_id]) map[row.worker_id] = [];
    map[row.worker_id].push(mapTrainingStatus(row));
  });
  return map;
}

module.exports = { listAll, findById, findByEmail, create, update, remove, buildWtMap };