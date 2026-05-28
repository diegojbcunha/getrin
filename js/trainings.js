/* =============================================================
   GETRIN — Treinamentos
   js/trainings.js
   ============================================================= */

let trainingsData = [];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('trainings');
  try {
    const res = await fetch(`${API_BASE}/trainings`);
    if (!res.ok) throw new Error("Erro ao obter treinamentos");
    trainingsData = await res.json();
    renderTrainings(trainingsData);
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar treinamentos.");
  }
});

/* Renderiza / atualiza a tabela */
function renderTrainings(list) {
  const tbody = document.getElementById('trainings-tbody');
  const count = document.getElementById('training-count');

  if (count) count.textContent = list.length + ' treinamentos';

  tbody.innerHTML = list.map(t => `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td class="td-mono" style="text-align:center;">${t.hours}</td>
      <td class="td-mono">${t.validity}</td>
      <td style="color:var(--text-3);font-size:11.5px;">${t.roles || ''}</td>
      <td>${badge('blue', t.mode)}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel || 'Ativo')}</td>
      <td style="text-align:center;">
        <button class="btn btn-icon btn-sm" onclick="showToast('Treinamento aberto.')">
          <i class="ti ti-edit"></i>
        </button>
      </td>
    </tr>`).join('');
}

/* Filtro de busca em tempo real */
function filterTrainings(query) {
  const q = query.toLowerCase();
  const filtered = trainingsData.filter(t =>
    t.name.toLowerCase().includes(q)  ||
    t.norm.toLowerCase().includes(q)  ||
    (t.roles && t.roles.toLowerCase().includes(q))
  );
  renderTrainings(filtered);
}
