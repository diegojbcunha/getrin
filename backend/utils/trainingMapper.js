// backend/mappers/trainingMapper.js

function mapTraining(t) {
  if (!t) return null;

  const years  = Math.floor((t.validity_months || 0) / 12);
  const months = (t.validity_months || 0) % 12;

  let validity = '—';
  if (years > 0) {
    validity = `${years} ano${years > 1 ? 's' : ''}`;
    if (months > 0) validity += ` e ${months} mês${months > 1 ? 'es' : ''}`;
  } else if (months > 0) {
    validity = `${months} mês${months > 1 ? 'es' : ''}`;
  }

  return {
    id: t.id,
    company_id: t.company_id,
    name: t.name,
    norm: t.norm,
    hours: t.hours ? `${t.hours}h` : '—',
    validity,
    mode: t.mode,
    status: t.is_active ? 'green' : 'red',
    status_label: t.is_active ? 'Ativo' : 'Inativo',
    statusLabel: t.is_active ? 'Ativo' : 'Inativo',
    created_at: t.created_at,
  };
}

module.exports = { mapTraining };