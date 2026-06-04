'use strict';

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const LOCAL_DB_FILE = path.join(BACKEND_DIR, 'local_db.json');
const CONFIG_FILE   = path.join(BACKEND_DIR, 'config.json');

function readJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath))
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Erro ao escrever ${filePath}:`, err.message);
  }
}

const loadConfig   = () => readJSON(CONFIG_FILE, {});
const saveConfig   = (d) => writeJSON(CONFIG_FILE, d);

const loadLocalDb  = () => {
  const raw = readJSON(LOCAL_DB_FILE, {});
  return {
    trainings:   Array.isArray(raw.trainings)   ? raw.trainings   : [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    workers:     Array.isArray(raw.workers)     ? raw.workers     : [],
  };
};
const saveLocalDb = (d) => writeJSON(LOCAL_DB_FILE, d);

module.exports = {
  loadLocalDb,
  saveLocalDb,
  loadConfig,
  saveConfig
};
