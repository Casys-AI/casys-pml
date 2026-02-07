// Script simple pour tester le chargement du catalogue de composants
const path = require('path');
const fs = require('fs');

// Fonction pour explorer un répertoire et trouver les fichiers JSON
function findJsonFiles(directory, fileList = []) {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push({
        path: filePath,
        exists: fs.existsSync(filePath),
        size: stat.size,
      });
    }
  }

  return fileList;
}

// Chemin du répertoire dist
const distDir = path.resolve(__dirname, '../../dist');
const srcDir = path.resolve(__dirname, '..');
const currentDir = __dirname;

console.log('=== TEST DE CHARGEMENT DU CATALOGUE ===');
console.log(`Répertoire courant: ${currentDir}`);

// Vérifier si le fichier components-base.json existe dans différents emplacements
const baseFilename = 'components-base.json';
const possiblePaths = [
  path.join(currentDir, baseFilename),
  path.join(currentDir, '../config', baseFilename),
  path.join(distDir, 'config', baseFilename),
  path.join(srcDir, 'config', baseFilename),
];

console.log('\n=== RECHERCHE DU FICHIER COMPONENTS-BASE.JSON ===');
possiblePaths.forEach(p => {
  console.log(`${p}: ${fs.existsSync(p) ? 'EXISTE' : "N'EXISTE PAS"}`);
  if (fs.existsSync(p)) {
    console.log(`  - Taille: ${fs.statSync(p).size} octets`);
    try {
      const content = fs.readFileSync(p, 'utf8');
      const json = JSON.parse(content);
      console.log(`  - Contenu valide: ${Object.keys(json).length} clés au premier niveau`);
      if (json.available_components) {
        console.log(`  - Nombre de composants: ${Object.keys(json.available_components).length}`);
      }
    } catch (err) {
      console.log(`  - Erreur de lecture/parsing: ${err.message}`);
    }
  }
});

console.log('\n=== RECHERCHE DE TOUS LES FICHIERS JSON DANS DIST ===');
const jsonFiles = findJsonFiles(distDir);
console.log(`Trouvé ${jsonFiles.length} fichiers JSON:`);
jsonFiles.forEach(file => {
  console.log(`- ${file.path} (${file.size} octets)`);
});

// Tenter de charger le catalogue via le module
try {
  console.log('\n=== TEST DU MODULE CONFIG.LOADER ===');
  const configLoader = require('../../dist/config/config.loader');
  console.log('Module chargé avec succès');
  console.log('Méthodes disponibles:', Object.keys(configLoader));

  if (configLoader.loadComponentBaseCatalog) {
    try {
      const catalog = configLoader.loadComponentBaseCatalog();
      console.log('Catalogue chargé avec succès!');
      console.log(`Nombre de composants: ${Object.keys(catalog.available_components).length}`);
    } catch (err) {
      console.log('Erreur lors du chargement du catalogue:', err.message);
    }
  } else {
    console.log('Méthode loadComponentBaseCatalog non disponible');
  }
} catch (err) {
  console.log('Erreur lors du chargement du module:', err.message);
}
