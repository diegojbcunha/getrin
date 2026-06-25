/* =============================================================
   GETRIN — Portal do Trabalhador
   js/portal.js
   ============================================================= */

let _currentWorkerData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('portal', true);
  try {
    const w = await fetchWithFallback('/workers/me', {}, null);
    if (!w) throw new Error("Sessão expirada ou trabalhador não encontrado");
    _currentWorkerData = w;
    
    // Atualiza a barra lateral com o nome e badge corretos
    document.getElementById('sidebar-mount').innerHTML = renderSidebar('portal', true);
    // Particiona os treinamentos do trabalhador
    const trainings = w.trainings || [];
    const pending = trainings.filter(t => t.status !== 'green');
    const completed = trainings.filter(t => t.status === 'green');
    
    renderPortalBanner(w, pending);
    renderPortalPending(pending);
    renderPortalCompleted(completed);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Erro ao carregar treinamentos do portal.");
  }
});

/* --- Lógica de Configurações do Portal --- */

function openPortalSettings() {
  if (!_currentWorkerData) return;
  
  const section = document.getElementById('portal-settings-section');
  if (!section) return;

  // Preenche os campos com os dados atuais
  document.getElementById('setting-name').value = _currentWorkerData.name || '';
  document.getElementById('setting-initials').value = _currentWorkerData.initials || '';
  document.getElementById('setting-phone').value = _currentWorkerData.phone || '';
  document.getElementById('setting-email').value = _currentWorkerData.email || '';

  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth' });
}

function closePortalSettings() {
  const section = document.getElementById('portal-settings-section');
  if (section) section.style.display = 'none';
}

async function savePortalSettings() {
  const name = document.getElementById('setting-name').value.trim();
  const initials = document.getElementById('setting-initials').value.trim().toUpperCase();
  const phone = document.getElementById('setting-phone').value.trim();

  if (!name || !initials) {
    showToast('Nome e Iniciais são obrigatórios.');
    return;
  }

  const btn = document.querySelector('#portal-settings-section .btn-primary');
  const oldText = btn.textContent;
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/workers/profile`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ name, initials, phone })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar perfil.');

    showToast('Perfil atualizado com sucesso!');
    
    // Atualiza o estado local
    _currentWorkerData.name = name;
    _currentWorkerData.initials = initials;
    _currentWorkerData.phone = phone;

    // Atualiza a UI global (Sidebar e Banner)
    State.currentName = name;
    State.currentInitials = initials;
    document.getElementById('sidebar-mount').innerHTML = renderSidebar('portal', true);
    
    const pending = (_currentWorkerData.trainings || []).filter(t => t.status !== 'green');
    renderPortalBanner(_currentWorkerData, pending);

    closePortalSettings();
  } catch (err) {
    console.error(err);
    showToast(err.message);
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
}

function renderPortalBanner(w, pendingList) {
  const compEl = document.getElementById('portal-compliance');
  const subEl = document.getElementById('portal-sub');
  const badgeEl = document.getElementById('portal-badge');

  if (compEl) {
    compEl.textContent = `${w.compliance}%`;
    compEl.className = 'portal-big-pct ' + 
      (w.status === 'green' ? 'c-green' : w.status === 'amber' ? 'c-warn' : 'c-danger');
  }

  if (subEl) {
    const expired = pendingList.filter(t => t.status === 'red' || t.status === 'amber').length;
    const pendingCount = pendingList.length - expired;
    let subParts = [];
    if (pendingCount > 0) subParts.push(`${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`);
    if (expired > 0) subParts.push(`${expired} vencido${expired > 1 ? 's' : ''}`);
    subEl.textContent = subParts.length > 0 ? subParts.join(' · ') : 'Todos os treinamentos em dia';
  }

  if (badgeEl) {
    badgeEl.outerHTML = `<span id="portal-badge">${badge(w.status, w.status_label || w.statusLabel)}</span>`;
  }
}

function renderPortalPending(list) {
  const tbody = document.getElementById('pending-tbody');
  if (!tbody) return;
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-3);font-size:12px;">Nenhum treinamento pendente.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(t => {
    const expiresColor = t.expiresColor || t.expires_color;
    const dlColor = expiresColor === 'amber' ? 'var(--amber-600)'
                  : expiresColor === 'red'   ? 'var(--red-600)'
                  : 'var(--text-3)';
    const materials = Array.isArray(t.materials) ? t.materials : [];
    const viewed = new Set((t.viewed_materials || []).map(String));
    const action = t.progress === 0 ? 'Iniciar' : (t.status === 'red' ? 'Refazer' : 'Continuar');
    const isPrimary = action === 'Continuar' || action === 'Refazer';
    const materialButtons = materials.length
      ? materials.map(m => `
        <button class="btn btn-sm ${viewed.has(String(m.id)) ? '' : 'btn-primary'}"
                onclick="openTrainingMaterial('${t.id}', '${m.id}')">
          <i class="ti ${m.type === 'pdf' ? 'ti-file-type-pdf' : 'ti-brand-youtube'}"></i>${m.title}
        </button>`).join('')
      : '<span style="color:var(--text-3);font-size:12px;">Sem materiais</span>';
    return `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td>${progressBar(t.progress, t.status === 'red')}</td>
      <td class="td-mono" style="color:${dlColor};">${t.expires}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel)}</td>
      <td>
        <div class="portal-material-actions">${materialButtons}</div>
      </td>
    </tr>`;
  }).join('');
}

function renderPortalCompleted(list) {
  const tbody = document.getElementById('completed-tbody');
  if (!tbody) return;
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-3);font-size:12px;">Nenhum treinamento concluído.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(t => {
    const materials = Array.isArray(t.materials) ? t.materials : [];
    const materialButtons = materials.map(m => `
      <button class="btn btn-sm" onclick="openTrainingMaterial('${t.id}', '${m.id}')">
        <i class="ti ${m.type === 'pdf' ? 'ti-file-type-pdf' : 'ti-brand-youtube'}"></i>${m.title}
      </button>`).join('');
    return `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td class="td-mono">${t.done_at ? formatDate(t.done_at) : '—'}</td>
      <td class="td-mono c-green">${t.expires ? formatDate(t.expires) : '—'}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel)}</td>
      <td>
        <div class="portal-material-actions">${materialButtons || '<span style="color:var(--text-3);font-size:12px;">Sem materiais</span>'}</div>
      </td>
    </tr>`;
  }).join('');
}

async function openTrainingMaterial(assignmentId, materialId) {
  const trainings = _currentWorkerData?.trainings || [];
  const training = trainings.find(t => String(t.id) === String(assignmentId));
  const material = training?.materials?.find(m => String(m.id) === String(materialId));
  if (!material) {
    showToast('Material nao encontrado.');
    return;
  }

  window.open(material.url, '_blank', 'noopener');

  try {
    const res = await fetch(`${API_BASE}/worker-trainings/${assignmentId}/materials/${materialId}/viewed`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const updated = await res.json();
    if (!res.ok) throw new Error(updated.error || 'Erro ao atualizar progresso.');

    training.progress = updated.progress;
    training.status = updated.status;
    training.status_label = updated.status_label;
    training.done_at = updated.done_at;
    training.expires = updated.expires;
    training.viewed_materials = updated.viewed_materials || training.viewed_materials || [];
    _currentWorkerData.compliance = trainings.length
      ? Math.round(trainings.reduce((sum, item) => sum + (Number(item.progress) || 0), 0) / trainings.length)
      : 0;
    _currentWorkerData.status = _currentWorkerData.compliance >= 100 ? 'green' : (_currentWorkerData.compliance > 0 ? 'amber' : 'gray');
    _currentWorkerData.status_label = _currentWorkerData.status === 'green' ? 'Conforme' : (_currentWorkerData.status === 'amber' ? 'Em andamento' : 'Pendente');

    const pending = trainings.filter(t => t.status !== 'green');
    const completed = trainings.filter(t => t.status === 'green');
    renderPortalBanner(_currentWorkerData, pending);
    renderPortalPending(pending);
    renderPortalCompleted(completed);
    showToast('Progresso atualizado.');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Nao foi possivel atualizar o progresso.');
  }
}
