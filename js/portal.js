/* =============================================================
   GETRIN - Portal do Trabalhador
   js/portal.js
   ============================================================= */

let _currentWorkerData = null;
let _activePortalTab = 'trainings';
let _materialViewer = null;
let _materialTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!authGuard()) return;
  document.getElementById('sidebar-mount').innerHTML = renderSidebar('portal', true);

  try {
    const w = await fetchWithFallback('/workers/me', {}, null);
    if (!w) throw new Error('Sessao expirada ou trabalhador nao encontrado');
    _currentWorkerData = w;

    document.getElementById('sidebar-mount').innerHTML = renderSidebar('portal', true);
    renderPortal();
    setPortalTab(getInitialPortalTab());
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao carregar treinamentos do portal.');
  }
});

window.addEventListener('hashchange', () => setPortalTab(getInitialPortalTab()));

function getInitialPortalTab() {
  const hash = (window.location.hash || '#trainings').replace('#', '');
  return ['trainings', 'certificates', 'notifications'].includes(hash) ? hash : 'trainings';
}

function setPortalTab(tab) {
  _activePortalTab = ['trainings', 'certificates', 'notifications'].includes(tab) ? tab : 'trainings';
  if (window.location.hash !== `#${_activePortalTab}`) {
    history.replaceState(null, '', `#${_activePortalTab}`);
  }

  document.querySelectorAll('.portal-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.portal-tab-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(`tab-${_activePortalTab}`)?.classList.add('active');
  document.getElementById(`panel-${_activePortalTab}`)?.classList.add('active');
}

function renderPortal() {
  const trainings = _currentWorkerData?.trainings || [];
  const pending = trainings.filter(t => t.status !== 'green');
  const completed = trainings.filter(t => t.status === 'green');

  renderPortalBanner(_currentWorkerData, pending);
  renderPortalPending(pending);
  renderPortalCompleted(completed);
  renderPortalCertificates(completed);
  renderPortalNotifications(trainings);
}

function openPortalSettings() {
  if (!_currentWorkerData) return;

  const section = document.getElementById('portal-settings-section');
  if (!section) return;

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
    showToast('Nome e iniciais sao obrigatorios.');
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

    _currentWorkerData.name = name;
    _currentWorkerData.initials = initials;
    _currentWorkerData.phone = phone;
    State.currentName = name;
    State.currentInitials = initials;

    document.getElementById('sidebar-mount').innerHTML = renderSidebar('portal', true);
    renderPortal();
    closePortalSettings();
    showToast('Perfil atualizado com sucesso.');
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
    compEl.textContent = `${w.compliance || 0}%`;
    compEl.className = 'portal-big-pct ' +
      (w.status === 'green' ? 'c-green' : w.status === 'amber' ? 'c-warn' : 'c-danger');
  }

  if (subEl) {
    const expired = pendingList.filter(t => t.status === 'red' || t.status === 'amber').length;
    const pendingCount = pendingList.length - expired;
    const subParts = [];
    if (pendingCount > 0) subParts.push(`${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`);
    if (expired > 0) subParts.push(`${expired} vencido${expired > 1 ? 's' : ''}`);
    subEl.textContent = subParts.length > 0 ? subParts.join(' - ') : 'Todos os treinamentos em dia';
  }

  if (badgeEl) {
    badgeEl.outerHTML = `<span id="portal-badge">${badge(w.status, w.status_label || w.statusLabel || 'Pendente')}</span>`;
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
      : expiresColor === 'red' ? 'var(--red-600)'
      : 'var(--text-3)';
    const action = t.progress === 0 ? 'Iniciar' : (t.status === 'red' ? 'Refazer' : 'Continuar');
    const isPrimary = action === 'Continuar' || action === 'Refazer';

    return `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td>${progressBar(t.progress || 0, t.status === 'red')}</td>
      <td class="td-mono" style="color:${dlColor};">${t.expires ? formatDate(t.expires) : '-'}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel || 'Pendente')}</td>
      <td>
        <button class="btn btn-sm ${isPrimary ? 'btn-primary' : ''}" onclick="openTrainingDetail('${t.id}')">
          <i class="ti ti-list-details"></i>${action}
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderPortalCompleted(list) {
  const tbody = document.getElementById('completed-tbody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-3);font-size:12px;">Nenhum treinamento concluido.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(t => `
    <tr>
      <td class="td-primary">${t.name}</td>
      <td>${nrTag(t.norm)}</td>
      <td class="td-mono">${t.done_at ? formatDate(t.done_at) : '-'}</td>
      <td class="td-mono c-green">${t.expires ? formatDate(t.expires) : '-'}</td>
      <td>${badge(t.status, t.status_label || t.statusLabel || 'Concluido')}</td>
      <td>
        <button class="btn btn-sm" onclick="openTrainingDetail('${t.id}')">
          <i class="ti ti-list-details"></i>Detalhes
        </button>
      </td>
    </tr>`).join('');
}

function renderPortalCertificates(list) {
  const container = document.getElementById('certificates-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="portal-empty-state">
        <i class="ti ti-certificate-off"></i>
        <div>Nenhum certificado disponivel.</div>
        <span>Conclua todos os materiais de um treinamento para liberar o certificado.</span>
      </div>`;
    return;
  }

  container.innerHTML = list.map(t => `
    <div class="portal-info-card">
      <div class="portal-info-icon"><i class="ti ti-certificate"></i></div>
      <div class="portal-info-body">
        <div class="portal-info-title">${t.name}</div>
        <div class="portal-info-meta">${nrTag(t.norm)} <span>${t.done_at ? formatDate(t.done_at) : 'Concluido'}</span></div>
      </div>
      <button class="btn btn-sm" onclick="downloadCertificate('${t.id}')">
        <i class="ti ti-download"></i>Baixar
      </button>
    </div>`).join('');
}

function renderPortalNotifications(trainings) {
  const container = document.getElementById('notifications-list');
  if (!container) return;

  const notifications = [];
  trainings.forEach(t => {
    if (t.status !== 'green') {
      notifications.push({
        icon: 'ti-clock',
        title: t.progress > 0 ? 'Treinamento em andamento' : 'Treinamento pendente',
        text: `${t.name} esta com ${t.progress || 0}% de progresso.`,
        trainingId: t.id,
      });
    }
    if (t.status === 'red' || t.status === 'amber') {
      notifications.push({
        icon: 'ti-alert-triangle',
        title: 'Atencao ao vencimento',
        text: `${t.name} requer revisao de prazo ou reciclagem.`,
        trainingId: t.id,
      });
    }
  });

  if (!notifications.length) {
    container.innerHTML = `
      <div class="portal-empty-state">
        <i class="ti ti-bell-check"></i>
        <div>Sem notificacoes no momento.</div>
        <span>Quando houver pendencias ou vencimentos, elas aparecerao aqui.</span>
      </div>`;
    return;
  }

  container.innerHTML = notifications.map(n => `
    <div class="portal-info-card">
      <div class="portal-info-icon"><i class="ti ${n.icon}"></i></div>
      <div class="portal-info-body">
        <div class="portal-info-title">${n.title}</div>
        <div class="portal-info-meta">${n.text}</div>
      </div>
      <button class="btn btn-sm" onclick="openTrainingDetail('${n.trainingId}')">
        <i class="ti ti-list-details"></i>Ver
      </button>
    </div>`).join('');
}

function openTrainingDetail(assignmentId) {
  const training = (_currentWorkerData?.trainings || []).find(t => String(t.id) === String(assignmentId));
  if (!training) {
    showToast('Treinamento nao encontrado.');
    return;
  }

  const materials = Array.isArray(training.materials) ? training.materials : [];
  const viewed = new Set((training.viewed_materials || []).map(String));
  const materialRows = materials.length
    ? materials.map(m => `
      <div class="training-material-row">
        <div class="training-material-icon"><i class="ti ${m.type === 'pdf' ? 'ti-file-type-pdf' : 'ti-brand-youtube'}"></i></div>
        <div class="training-material-body">
          <div class="training-material-title">${m.title}</div>
          <div class="training-material-meta">${m.type === 'pdf' ? 'Documento PDF' : 'Video do YouTube'} ${viewed.has(String(m.id)) ? '- visualizado' : '- pendente'}</div>
        </div>
        <button class="btn btn-sm ${viewed.has(String(m.id)) ? '' : 'btn-primary'}" onclick="openTrainingMaterial('${training.id}', '${m.id}')">
          <i class="ti ${m.type === 'pdf' ? 'ti-file-text' : 'ti-player-play'}"></i>${m.type === 'pdf' ? 'Ler' : 'Assistir'}
        </button>
      </div>`).join('')
    : '<div class="portal-empty-state compact"><span>Nenhum material cadastrado para este treinamento.</span></div>';

  document.getElementById('training-detail-title').textContent = training.name || 'Detalhes do treinamento';
  document.getElementById('training-detail-body').innerHTML = `
    <div class="training-detail-summary">
      <div>
        <div class="training-detail-label">Norma</div>
        <div>${nrTag(training.norm || '-')}</div>
      </div>
      <div>
        <div class="training-detail-label">Progresso</div>
        <div>${progressBar(training.progress || 0, training.status === 'red')}</div>
      </div>
      <div>
        <div class="training-detail-label">Status</div>
        <div>${badge(training.status, training.status_label || training.statusLabel || 'Pendente')}</div>
      </div>
      <div>
        <div class="training-detail-label">Validade</div>
        <div class="td-mono">${training.expires ? formatDate(training.expires) : '-'}</div>
      </div>
    </div>
    <div class="section-div">Materiais</div>
    <div class="training-material-list">${materialRows}</div>
    <div class="section-div">Historico</div>
    <div class="training-history">
      <div><i class="ti ti-calendar"></i>Conclusao: ${training.done_at ? formatDate(training.done_at) : 'Ainda nao concluido'}</div>
      <div><i class="ti ti-eye"></i>Materiais vistos: ${viewed.size}/${materials.length}</div>
      <div><i class="ti ti-certificate"></i>Certificado: ${training.status === 'green' ? 'Disponivel' : 'Indisponivel'}</div>
    </div>`;

  document.getElementById('modal-training-detail')?.classList.add('open');
}

function closeTrainingDetail() {
  document.getElementById('modal-training-detail')?.classList.remove('open');
}

async function openTrainingMaterial(assignmentId, materialId) {
  const trainings = _currentWorkerData?.trainings || [];
  const training = trainings.find(t => String(t.id) === String(assignmentId));
  const material = training?.materials?.find(m => String(m.id) === String(materialId));
  if (!material) {
    showToast('Material nao encontrado.');
    return;
  }

  const requiredSeconds = Number(material.min_seconds) || (material.type === 'pdf' ? 20 : 30);
  _materialViewer = {
    assignmentId,
    materialId,
    material,
    requiredSeconds,
    watchedSeconds: 0,
  };

  document.getElementById('material-viewer-title').textContent = material.title || 'Material do treinamento';
  document.getElementById('material-viewer-frame').innerHTML = `<iframe src="${getMaterialEmbedUrl(material)}" title="${material.title || 'Material'}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  document.getElementById('modal-material-viewer')?.classList.add('open');
  updateMaterialViewerStatus();

  clearInterval(_materialTimer);
  _materialTimer = setInterval(() => {
    if (!_materialViewer || document.hidden) return;
    _materialViewer.watchedSeconds += 1;
    updateMaterialViewerStatus();
  }, 1000);
}

function getMaterialEmbedUrl(material) {
  const url = String(material.url || '');
  if (material.type !== 'youtube') return url;

  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  return match ? `https://www.youtube.com/embed/${match[1]}?rel=0` : url;
}

function updateMaterialViewerStatus() {
  if (!_materialViewer) return;

  const remaining = Math.max(0, _materialViewer.requiredSeconds - _materialViewer.watchedSeconds);
  const btn = document.getElementById('material-complete-btn');
  const status = document.getElementById('material-viewer-status');

  if (btn) btn.disabled = remaining > 0;
  if (status) {
    status.textContent = remaining > 0
      ? `Tempo minimo para concluir: ${remaining}s`
      : 'Tempo minimo atingido. Voce ja pode concluir este material.';
  }
}

function closeMaterialViewer() {
  clearInterval(_materialTimer);
  _materialTimer = null;
  _materialViewer = null;
  document.getElementById('material-viewer-frame').innerHTML = '';
  document.getElementById('modal-material-viewer')?.classList.remove('open');
}

async function completeCurrentMaterial() {
  if (!_materialViewer) return;

  const { assignmentId, materialId, watchedSeconds } = _materialViewer;

  try {
    const res = await fetch(`${API_BASE}/worker-trainings/${assignmentId}/materials/${materialId}/viewed`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ view_seconds: watchedSeconds })
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

    renderPortal();
    if (document.getElementById('modal-training-detail')?.classList.contains('open')) {
      openTrainingDetail(assignmentId);
    }
    setPortalTab(_activePortalTab);
    closeMaterialViewer();
    showToast('Progresso atualizado.');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Nao foi possivel atualizar o progresso.');
  }
}

function downloadCertificate(assignmentId) {
  const training = (_currentWorkerData?.trainings || []).find(t => String(t.id) === String(assignmentId));
  if (!training || training.status !== 'green') {
    showToast('Certificado indisponivel.');
    return;
  }

  fetch(`${API_BASE}/worker-trainings/${assignmentId}/certificate`, {
    headers: getAuthHeaders()
  })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Certificado indisponivel.');
      renderCertificateWindow(training, data);
    })
    .catch(err => {
      console.error(err);
      showToast(err.message || 'Nao foi possivel gerar o certificado.');
    });
}

function renderCertificateWindow(training, certificate) {
  const win = window.open('', '_blank');
  if (!win) {
    showToast('Permita pop-ups para baixar o certificado.');
    return;
  }

  const issuedAt = new Date().toLocaleDateString('pt-BR');
  const verifyUrl = `${location.origin}/api/worker-trainings/certificates/verify/${certificate.code}`;
  win.document.write(`
    <html><head><title>Certificado - ${training.name}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:48px;color:#0f172a}
      .cert{border:2px solid #1E3A8A;padding:40px;text-align:center}
      h1{font-size:30px;margin:0 0 24px} h2{font-size:22px;margin:20px 0}
      p{font-size:15px;line-height:1.6}.meta{margin-top:30px;font-size:12px;color:#475569}
    </style></head><body>
    <div class="cert">
      <h1>Certificado de Conclusao</h1>
      <p>Certificamos que</p>
      <h2>${certificate.worker_name || _currentWorkerData.name || 'Trabalhador'}</h2>
      <p>concluiu o treinamento <strong>${training.name}</strong>, referente a ${training.norm || 'norma aplicavel'}.</p>
      <p>Conclusao: ${certificate.issued_at ? formatDate(certificate.issued_at) : issuedAt}</p>
      <p>Valido ate: ${certificate.expires_at ? formatDate(certificate.expires_at) : '-'}</p>
      <p>Codigo de validacao: <strong>${certificate.code}</strong></p>
      <div class="meta">Validacao: ${verifyUrl}<br>Emitido pelo Getrin em ${issuedAt}</div>
    </div>
    <script>window.print()</script>
    </body></html>`);
  win.document.close();
}
