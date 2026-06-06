'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');
const { parseExpiryDate } = require('../utils/helpers');

router.get('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const allowedDays = [30, 60, 90];
    const days = allowedDays.includes(parseInt(req.query.days))
      ? parseInt(req.query.days) : 30;

    const { data: workers, error: wErr } = await supabase
      .from('workers')
      .select('compliance, status')
      .eq('company_id', company_id);
    if (wErr) throw wErr;

    const { data: alerts, error: aErr } = await supabase
      .from('alerts')
      .select('*')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false });
    if (aErr) throw aErr;

    const { data: activities, error: actErr } = await supabase
      .from('worker_trainings')
      .select('status, status_label, created_at, workers!inner(name, company_id), trainings(name,norm)')
      .eq('workers.company_id', company_id)
      .order('created_at', { ascending: false }).limit(5);
    if (actErr) console.error('Erro ao buscar atividades:', actErr);

    const { data: allWt, error: wtErr } = await supabase
      .from('worker_trainings')
      .select('expires, status, workers!inner(company_id)')
      .eq('workers.company_id', company_id)
      .in('status', ['green', 'amber']);
    if (wtErr) throw wtErr;

    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + days);

    const expiringCount = (allWt || []).filter(wt => {
      const exp = parseExpiryDate(wt.expires);
      return exp && exp >= today && exp <= cutoff;
    }).length;

    const total          = workers.length;
    const nonCompliant   = workers.filter(w => w.status === 'red').length;
    const avgCompliance  = total > 0
      ? Math.round(workers.reduce((acc, w) => acc + (w.compliance || 0), 0) / total) : 0;

    res.json({
      metrics: { compliance: avgCompliance, workers: total, expiring: expiringCount,
                 nonCompliant, expiringDays: days },
      alerts,
      recentActivity: (activities || []).map(wt => ({
        name:        wt.workers?.name     || 'Desconhecido',
        training:    wt.trainings?.name   || 'Desconhecido',
        norm:        wt.trainings?.norm   || '—',
        date:        wt.done ? wt.done : (wt.created_at ? new Date(wt.created_at).toLocaleDateString('pt-BR') : '—'),
        status:      wt.status,
        statusLabel: wt.status_label,
      })),
    });
  } catch (err) {
    console.error('Erro no Dashboard API:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
