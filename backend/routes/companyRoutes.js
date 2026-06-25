'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');

// --- Listar empresas disponíveis (para vinculação de treinamentos) ---
router.get('/', requireAuth, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, cnpj, sector')
      .eq('id', company_id)
      .order('name');
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Obter empresa da sessão logada ---
router.get('/current', requireAuth, async (req, res) => {
  try {
    const { company_id } = req.session;
    if (!company_id) {
      return res.status(400).json({ error: 'Empresa não identificada na sessão.' });
    }

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
