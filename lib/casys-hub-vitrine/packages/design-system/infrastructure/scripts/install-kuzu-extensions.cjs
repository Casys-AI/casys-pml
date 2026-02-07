#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Script postinstall pour Kuzu - Installation des extensions natives
 * Exécuté automatiquement après l'installation des dépendances
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const installKuzuExtensions = () => {
  console.log('🔧 Postinstall Kuzu - Installation des extensions...');
  
  try {
    // 1. Déclencher l'installation native de Kuzu (si pas déjà fait)
    const kuzuPath = path.join(__dirname, '../node_modules/kuzu');
    if (fs.existsSync(kuzuPath)) {
      console.log('📦 Installation native de Kuzu...');
      try {
        execSync('npm install', { 
          cwd: kuzuPath, 
          stdio: 'inherit',
          timeout: 60000 
        });
        console.log('✅ Installation native Kuzu terminée');
      } catch {
        console.log('⚠️  Installation native Kuzu: déjà effectuée ou erreur');
      }
    }
    
    // 2. Installer les extensions dans un processus enfant pour isoler un éventuel segfault
    console.log('🧩 Installation des extensions Kuzu dans un processus enfant...');
    const childCode = `
      /* eslint-disable no-console */
      try {
        const kuzu = require('kuzu');
        const db = new kuzu.Database(':memory:');
        const conn = new kuzu.Connection(db);
        const extensions = ['json', 'vector', 'llm'];
        let installed = 0;
        for (const ext of extensions) {
          try {
            conn.query('INSTALL ' + ext);
            console.log('✅ Extension ' + ext.toUpperCase() + ' installée');
            installed++;
          } catch (e) {
            console.log('⚠️  Extension ' + ext.toUpperCase() + ': ' + (e && e.message ? e.message : e));
          }
        }
        console.log('🎉 Extensions installées: ' + installed + '/' + extensions.length);
        // Ne pas fermer explicitement; laisser le processus enfant se terminer
      } catch (e) {
        console.log('⚠️  Installation des extensions différée (première utilisation)');
      }
    `;
    const child = spawnSync(process.execPath, ['-e', childCode], { stdio: 'inherit', env: process.env });
    if (child.status !== 0 || child.signal) {
      console.log('⚠️  Le processus enfant d\'installation des extensions a échoué (ignoré).');
    }
    
  } catch (error) {
    console.log('❌ Erreur postinstall Kuzu:', error.message);
    // Ne pas faire échouer le build
    process.exit(0);
  }
};

// Exécuter seulement si appelé directement
if (require.main === module) {
  installKuzuExtensions();
}

module.exports = { installKuzuExtensions };
