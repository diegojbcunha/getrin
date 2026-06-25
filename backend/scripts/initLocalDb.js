'use strict';

const fs = require('fs');
const path = require('path');

const LOCAL_DB_FILE = path.join(__dirname, '..', 'local_db.json');

const initialData = {
  trainings: [],
  assignments: [],
  workers: []
};

if (!fs.existsSync(LOCAL_DB_FILE)) {
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  console.log('✓ Arquivo local_db.json inicializado com sucesso.');
} else {
  console.log('! Arquivo local_db.json já existe. Nenhuma ação necessária.');
}
