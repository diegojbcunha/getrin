'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { loadConfig, saveConfig } = require('../repositories/localRepository');

router.get('/', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ error: 'Somente administradores podem ver as configurações.' });
  try {
    const config = loadConfig();
    const { supabaseUrl: _u, supabaseAnonKey: _k, ...safeConfig } = config;
    res.json(safeConfig);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ error: 'Somente administradores podem alterar as configurações.' });
  try {
    const { alertDays, autoRecalculate, theme } = req.body;
    const existing = loadConfig();
    const updated  = { ...existing, alertDays, autoRecalculate, theme };
    saveConfig(updated);
    res.json({ message: 'Configurações salvas com sucesso!', config: { alertDays, autoRecalculate, theme } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
