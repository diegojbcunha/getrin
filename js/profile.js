/* =============================================================
   GETRIN — Perfil Individual do Trabalhador
   js/profile.js
   ============================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('workers');

  try {
    const w = await fetchWithFallback(`/workers/${State.selectedWorker}`, {}, null);
    if (!w) throw new Error("Trabalhador não encontrado");
    
    renderProfileHeader(w);
    renderProfileTrainings(w);
    renderComplianceBar(w);
    
    // Armazena dados do trabalhador atual para edição
    window._currentWorker = w;
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar perfil do trabalhador.");
  }
});

/* ---- Modais de Edição e Atribuição ---- */

function openEditModal() {
  const w = window._currentWorker;
  if (!w) return;

  document.getElementById('edit-worker-name').value      = w.name || '';
  document.getElementById('edit-worker-matricula').value = w.matricula || '';
  document.getElementById('edit-worker-role').value      = w.role || '';
  document.getElementById('edit-worker-sector').value    = w.sector || 'Geral';
  document.getElementById('edit-worker-manager').value   = w.manager || '';
  document.getElementById('edit-worker-admission').value = w.admission || '';
  document.getElementById('edit-worker-email').value     = w.email || '';
  document.getElementById('edit-worker-phone').value     = w.phone || '';

  openModal('modal-edit-profile');
}

async function submitEditProfile() {
  const w = window._currentWorker;
  if (!w) return;

  // Sanitiza o payload para remover campos que não devem ser enviados ou que são nulos
  const payload = {
    name:      document.getElementById('edit-worker-name').value.trim(),
    matricula: document.getElementById('edit-worker-matricula').value.trim(),
    role:      document.getElementById('edit-worker-role').value.trim(),
    sector:    document.getElementById('edit-worker-sector').value,
    manager:   document.getElementById('edit-worker-manager').value.trim() || null,
    admission: document.getElementById('edit-worker-admission').value || null,
    email:     document.getElementById('edit-worker-email').value.trim() || null,
    phone:     document.getElementById('edit-worker-phone').value.trim() || null
  };

  // Recalcula as iniciais se o nome mudou
  if (payload.name) {
    payload.initials = payload.name.split(' ').filter(p => p).map(p => p[0].toUpperCase()).slice(0, 2).join('');
  }

  try {
    const res = await fetch(`${API_BASE}/workers/${w.id}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Falha ao salvar alterações");
    }

    showToast("Perfil atualizado com sucesso!");
    closeModal('modal-edit-profile');
    
    // Pequeno atraso para o usuário ver o toast antes de recarregar
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    console.error('Erro ao editar perfil:', err);
    showToast(err.message);
  }
}

let _allAvailableTrainings = [];

async function openAssignModal() {
  const select = document.getElementById('assign-prof-training-id');
  select.innerHTML = '<option value="">Carregando...</option>';
  
  openModal('modal-assign-profile');

  try {
    const trainings = await fetchWithFallback('/trainings', {}, []);
    _allAvailableTrainings = trainings;
    
    if (trainings.length === 0) {
      select.innerHTML = '<option value="">Nenhum treinamento encontrado</option>';
      return;
    }

    // Filtra treinamentos que o trabalhador já possui
    const existingIds = new Set((window._currentWorker.trainings || []).map(t => t.training_id));
    const available = trainings.filter(t => !existingIds.has(t.id));

    if (available.length === 0) {
      select.innerHTML = '<option value="">Todos os treinamentos já atribuídos</option>';
      return;
    }

    select.innerHTML = '<option value="">Selecione um treinamento...</option>' + 
      available.map(t => `<option value="${t.id}">${t.norm} - ${t.name}</option>`).join('');
  } catch (err) {
    select.innerHTML = '<option value="">Erro ao carregar</option>';
  }
}

/**
 * Atualiza campos automáticos ao selecionar treinamento
 */
function updateAssignFields() {
  const trainingId = document.getElementById('assign-prof-training-id').value;
  const t = _allAvailableTrainings.find(x => x.id === trainingId);
  if (!t) return;

  document.getElementById('assign-prof-norm').value = t.norm || '—';
  document.getElementById('assign-prof-hours').value = (t.hours || '0') + 'h';
}

async function submitAssignTraining() {
  const w = window._currentWorker;
  const select = document.getElementById('assign-prof-training-id');
  const trainingId = select.value;
  const deadlineDate = document.getElementById('assign-prof-deadline').value;

  if (!trainingId) {
    showToast("Selecione um treinamento.");
    return;
  }

  const t = _allAvailableTrainings.find(x => x.id === trainingId);
  if (!t) return;

  try {
    const res = await fetch(`${API_BASE}/worker-trainings/assign`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        worker_id: w.id,
        training_id: trainingId,
        done_at: deadlineDate || null,
        progress: 0,
        status: 'gray',
        status_label: 'Pendente'
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao atribuir");

    showToast("Treinamento atribuído com sucesso!");
    closeModal('modal-assign-profile');
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    showToast(err.message);
  }
}

/**
 * Remove um treinamento atribuído por engano
 */
async function deleteAssignment(assignmentId) {
  if (!confirm("Tem certeza que deseja remover este treinamento do trabalhador?")) return;

  try {
    const res = await fetch(`${API_BASE}/worker-trainings/${assignmentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao remover treinamento");
    }

    showToast("Treinamento removido com sucesso!");
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    showToast(err.message);
  }
}

/* ---- Cabeçalho ---- */
function renderProfileHeader(w) {
  /* Topbar breadcrumb nome */
  const topbarName = document.getElementById('topbar-worker-name');
  if (topbarName) topbarName.textContent = w.name;

  document.getElementById('profile-initials').textContent = w.initials;
  document.getElementById('profile-name').textContent     = w.name;
  document.getElementById('profile-sub').innerHTML =
    `${w.role} · Matrícula <span style="font-family:var(--mono);">${w.matricula}</span>`;

  document.getElementById('pf-sector').textContent    = w.sector;
  document.getElementById('pf-manager').textContent   = w.manager || '—';
  document.getElementById('pf-admission').textContent = w.admission || '—';

  /* Campos extras (email/phone) se existirem no HTML */
  const elEmail = document.getElementById('pf-email');
  const elPhone = document.getElementById('pf-phone');
  if (elEmail) elEmail.textContent = w.email  || '—';
  if (elPhone) elPhone.textContent = w.phone  || '—';

  /* Badge de status */
  const badgeEl = document.getElementById('profile-badge');
  if (badgeEl) badgeEl.outerHTML = `<span id="profile-badge">${badge(w.status, w.status_label || w.statusLabel)}</span>`;

  const pctEl = document.getElementById('profile-pct');
  if (pctEl) pctEl.textContent = w.compliance + '% conformidade';
}

/* ---- Barra de progresso geral ---- */
function renderComplianceBar(w) {
  const wrap = document.getElementById('compliance-bar-wrap');
  if (!wrap) return;

  const color = w.status === 'green' ? 'var(--green-600)'
              : w.status === 'amber' ? 'var(--amber-600)'
              : 'var(--red-600)';

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <span style="font-family:var(--mono);font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-3);">Conformidade geral</span>
          <span style="font-family:var(--mono);font-size:11px;color:${color};font-weight:500;">${w.compliance}%</span>
        </div>
        <div class="progress-track" style="height:5px;">
          <div class="progress-fill" style="width:${w.compliance}%;background:${color};"></div>
        </div>
      </div>
      <div>${badge(w.status, w.status_label || w.statusLabel)}</div>
    </div>`;
}

/* ---- Tabela de treinamentos ---- */
function renderProfileTrainings(w) {
  const tbody = document.getElementById('profile-tbody');
  const countEl = document.getElementById('trainings-count');
  if (countEl) countEl.textContent = (w.trainings || []).length + ' treinamentos';

  if (!w.trainings || w.trainings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:20px;color:var(--text-3);font-size:12px;">
          Nenhum treinamento atribuído a este trabalhador.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = w.trainings.map(t => {
    const expColor = (t.expiresColor || t.expires_color) === 'green' ? 'var(--green-600)'
                   : (t.expiresColor || t.expires_color) === 'amber' ? 'var(--amber-600)'
                   : 'var(--text-3)';
    const isExpired = t.status === 'red' || (t.status === 'amber' && t.progress === 100);

    return `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td>${progressBar(t.progress, isExpired && t.progress === 100 && t.status === 'red')}</td>
      <td class="td-mono">${t.done_at ? formatDate(t.done_at) : '—'}</td>
      <td class="td-mono" style="color:${expColor};">${t.expires ? formatDate(t.expires) : '—'}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel)}</td>
      <td style="text-align:center;">
        <div style="display:flex; justify-content:center; gap:4px;">
          ${t.progress === 100 && t.status === 'green'
            ? `<button class="btn btn-sm" onclick="showToast('Certificado baixado.')"><i class="ti ti-download"></i>Cert.</button>`
            : `<button class="btn btn-sm" style="color:var(--text-3);" onclick="showToast('Não disponível.')"><i class="ti ti-minus"></i></button>`
          }
          <button class="btn btn-sm" style="color:var(--red-600);" title="Remover Atribuição" onclick="deleteAssignment('${t.id}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}