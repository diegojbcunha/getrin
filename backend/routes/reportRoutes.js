'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');

router.get('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { sector, role, norm } = req.query;

    let q = supabase.from('workers')
      .select('id, name, sector, role, compliance, status, status_label, worker_trainings(status)')
      .eq('company_id', company_id);
    if (sector) q = q.eq('sector', sector);
    if (role)   q = q.eq('role',   role);

    const { data: workers, error: wErr } = await q;
    if (wErr) throw wErr;

    const reportWorkers = workers.map(w => ({
      name:        w.name,
      sector:      w.sector,
      role:        w.role,
      valid:       (w.worker_trainings || []).filter(wt => wt.status === 'green').length,
      expired:     (w.worker_trainings || []).filter(wt => wt.status === 'red' || wt.status === 'amber').length,
      pct:         w.compliance,
      status:      w.status,
      statusLabel: w.status_label,
    }));

    const deptMap = {};
    workers.forEach(w => {
      if (!deptMap[w.sector]) deptMap[w.sector] = { sum: 0, count: 0 };
      deptMap[w.sector].sum   += w.compliance;
      deptMap[w.sector].count += 1;
    });
    const departments = Object.keys(deptMap).map(name => ({
      name,
      pct: Math.round(deptMap[name].sum / deptMap[name].count),
    }));

    let wtQ = supabase.from('worker_trainings')
      .select('status, trainings!inner(norm, company_id)')
      .or(`trainings.company_id.is.null,trainings.company_id.eq.${company_id}`);
    
    if (norm) wtQ = wtQ.eq('trainings.norm', norm);
    const { data: wts, error: wtErr } = await wtQ;
    if (wtErr) throw wtErr;

    const normMap = {};
    (wts || []).forEach(wt => {
      if (!wt.trainings) return;
      const n = wt.trainings.norm;
      if (!normMap[n]) normMap[n] = { valid: 0, expired: 0 };
      if (wt.status === 'green') normMap[n].valid++;
      else if (wt.status === 'red' || wt.status === 'amber') normMap[n].expired++;
    });
    const normCompliance = Object.keys(normMap).map(n => {
      const { valid, expired } = normMap[n];
      const total = valid + expired;
      return { norm: n, pct: total > 0 ? Math.round((valid / total) * 100) : 100, valid, expired };
    });

    const total        = reportWorkers.length;
    const conformes    = reportWorkers.filter(w => w.status === 'green').length;
    const emRisco      = reportWorkers.filter(w => w.status === 'amber').length;
    const naoConformes = reportWorkers.filter(w => w.status === 'red').length;
    const avgPct = total > 0
      ? Math.round(reportWorkers.reduce((a, w) => a + w.pct, 0) / total) : 0;

    res.json({
      reportWorkers, departments, normCompliance,
      summary: { totalWorkers: total, conformes, emRisco, naoConformes, avgCompliance: avgPct },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
