'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireManager } = require('../middlewares/auth');

router.get('/', requireAuth, requireManager, async (req, res) => {
  try {
    const { company_id } = req.session;
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
