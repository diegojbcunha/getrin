'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');

/**
 * Calcula o nível de alerta baseado nos dias até expiração
 */
function computeLevel(daysUntilExpiry) {
  if (daysUntilExpiry == null || daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 15)  return 'urgent';
  if (daysUntilExpiry <= 30)  return 'warning';
  return 'monitor';
}

router.get('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('company_id', company_id)
      .order('days_until_expiry', { ascending: true });
    
    if (error) throw error;

    // Transforma a resposta para o formato esperado pelo frontend
    const alerts = (data || []).map(a => ({
      ...a,
      days: a.days_until_expiry,
      level: computeLevel(a.days_until_expiry)
    }));

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Criar alerta manualmente (admin/manager)
 */
router.post('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { norm, title, days_until_expiry } = req.body;

    if (!norm || !title || days_until_expiry === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios: norm, title, days_until_expiry.' });
    }

    const level = computeLevel(days_until_expiry);
    const { data, error } = await supabase
      .from('alerts')
      .insert([{
        company_id,
        norm,
        title,
        days_until_expiry,
        level
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({
      ...data,
      days: data.days_until_expiry,
      level: computeLevel(data.days_until_expiry)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Deletar alerta
 */
router.delete('/:id', requireAuth, requireManager, async (req, res) => {
  try {
    const { error } = await supabase
      .from('alerts')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Alerta deletado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
