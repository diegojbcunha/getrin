/* =============================================================
   GETRIN — Perfil Individual do Trabalhador
   js/profile.js
   ============================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('workers');

  try {
    const res = await fetch(`${API_BASE}/workers/${State.selectedWorker}`);
    if (!res.ok) throw new Error("Erro ao obter trabalhador");
    const w = await res.json();
    
    renderProfileHeader(w);
    renderProfileTrainings(w);
    renderComplianceBar(w);
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar perfil do trabalhador.");
  }
});

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
      <td class="td-mono">${t.done}</td>
      <td class="td-mono" style="color:${expColor};">${t.expires}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel)}</td>
      <td style="text-align:center;">
        ${t.progress === 100 && t.status === 'green'
          ? `<button class="btn btn-sm" onclick="showToast('Certificado baixado.')"><i class="ti ti-download"></i>Cert.</button>`
          : `<button class="btn btn-sm" style="color:var(--text-3);" onclick="showToast('Não disponível.')"><i class="ti ti-minus"></i></button>`
        }
      </td>
    </tr>`;
  }).join('');
}