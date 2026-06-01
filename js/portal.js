/* =============================================================
   GETRIN — Portal do Trabalhador
   js/portal.js
   ============================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('portal', true);
  try {
    const res = await fetch(`${API_BASE}/workers/me`, { headers: getAuthHeaders() });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("Seu e-mail não está associado a nenhum trabalhador cadastrado. Entre em contato com seu gestor.");
      }
      throw new Error("Erro ao obter dados do trabalhador");
    }
    const w = await res.json();
    
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
    const action = t.progress === 0 ? 'Iniciar' : (t.status === 'red' ? 'Refazer' : 'Continuar');
    const isPrimary = action === 'Continuar' || action === 'Refazer';
    return `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td>${progressBar(t.progress, t.status === 'red')}</td>
      <td class="td-mono" style="color:${dlColor};">${t.expires}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel)}</td>
      <td>
        <button class="btn btn-sm ${isPrimary ? 'btn-primary' : ''}"
                onclick="showToast('Abrindo ${t.name}...')">
          ${action}
        </button>
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

  tbody.innerHTML = list.map(t => `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td class="td-mono">${t.done}</td>
      <td class="td-mono c-green">${t.expires}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel)}</td>
      <td>
        <button class="btn btn-sm" onclick="showToast('Certificado baixado.')">
          <i class="ti ti-download"></i>PDF
        </button>
      </td>
    </tr>`).join('');
}
