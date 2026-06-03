// backend/mappers/workerMapper.js

function enrichWorkerWithStats(worker, trainings) {
  if (!worker) return null;

  const total = trainings.length;
  const validCount = trainings.filter(t => t.status === 'green').length;
  const compliance = total > 0 ? Math.round((validCount / total) * 100) : 0;

  const hasExpired  = trainings.some(t => t.status === 'red');
  const hasWarning  = trainings.some(t => t.status === 'amber');
  const hasPending  = trainings.some(t => t.status === 'gray' || t.status === 'blue');

  let status = 'green';
  let statusLabel = 'Conforme';

  if (total === 0 || hasPending && !hasExpired && !hasWarning) {
    status = 'gray'; statusLabel = 'Pendente';
  }
  if (hasPending || compliance < 100) {
    status = 'amber'; statusLabel = 'Em risco';
  }
  if (hasWarning) {
    status = 'amber'; statusLabel = 'Em risco';
  }
  if (hasExpired) {
    status = 'red'; statusLabel = 'Não conforme';
  }

  return { ...worker, compliance, status, status_label: statusLabel, statusLabel };
}

function mapTrainingStatus(row) {
  if (!row) return null;

  const fmt = (d) => {
    if (!d || d === '—') return '—';
    const date = new Date(d);
    return isNaN(date.getTime()) ? d : date.toLocaleDateString('pt-BR');
  };

  const status = row.status || 'gray';
  const labels = { green: 'Válido', blue: 'Em andamento', amber: 'Em risco', red: 'Vencido' };
  const statusLabel = labels[status] || 'Pendente';
  const expiresColor = status === 'green' ? 'green' : status === 'amber' ? 'amber' : '';

  return {
    id: row.id,
    training_id: row.training_id,
    name: row.training_name || 'Treinamento',
    norm: row.norm || '—',
    progress: row.progress || 0,
    done: row.done_at ? fmt(row.done_at) : '—',
    expires: row.expires_at ? fmt(row.expires_at) : '—',
    expiresColor,
    expires_color: expiresColor,
    status,
    statusLabel,
    status_label: statusLabel,
  };
}

module.exports = { enrichWorkerWithStats, mapTrainingStatus };