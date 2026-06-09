/* =============================================================
   GETRIN — Treinamentos
   js/trainings.js
   ============================================================= */

let trainingsData = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('trainings');
  injectSharedHTML();
  await reloadTrainings();
});

/* Recarrega os treinamentos da API */
async function reloadTrainings() {
  try {
    trainingsData = await fetchWithFallback('/trainings', {}, Trainings);
    renderTrainings(trainingsData);
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar treinamentos.");
  }
}

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
      
      </td>
    </tr>`).join('');
}

/* Abre o modal para editar um treinamento */
function openEditTrainingModal(id, name, norm, hours, validity, mode, roles) {
  const modal = document.getElementById('modal-training');
  const title = document.getElementById('modal-training-title');
  
  title.textContent = 'Editar treinamento';
  modal.dataset.trainingId = id;
  document.getElementById('btn-submit-training').textContent = 'Salvar alterações';
  
  document.getElementById('training-name').value = name;
  document.getElementById('training-norm').value = norm;
  document.getElementById('training-hours').value = hours;
  document.getElementById('training-validity').value = validity;
  document.getElementById('training-mode').value = mode;
  document.getElementById('training-roles').value = roles;
  document.getElementById('training-worker-email').value = '';
  
  // Esconde o campo de empresa quando editando
  const companyField = document.getElementById('training-company')?.closest('.form-field');
  if (companyField) {
    companyField.style.display = 'none';
  }
  
  openModal('modal-training');
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
