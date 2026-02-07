// Script pour tester l'adaptateur de catalogue directement
const path = require('path');
const fs = require('fs');

async function main() {
  try {
    console.log("=== TEST DE L'ADAPTATEUR DE CATALOGUE ===");

    // Chemin du fichier components-base.json
    const configPath = path.resolve(__dirname, 'components-base.json');
    console.log(`Chemin du fichier de configuration: ${configPath}`);
    console.log(`Le fichier existe: ${fs.existsSync(configPath) ? 'OUI' : 'NON'}`);

    // Importer l'adaptateur depuis le build
    const { FileComponentCatalogAdapter } = require('../../dist/index.js');
    console.log('Module importé avec succès');

    if (FileComponentCatalogAdapter) {
      console.log('Classe FileComponentCatalogAdapter trouvée');

      // Instancier l'adaptateur
      const adapter = new FileComponentCatalogAdapter();
      console.log('Adaptateur instancié avec succès');

      // Appeler la méthode getBaseCatalog
      console.log('Tentative de chargement du catalogue de base...');
      const catalog = await adapter.getBaseCatalog();

      console.log('Catalogue chargé avec succès!');
      console.log(`Nombre de composants: ${catalog.length}`);
      console.log('Premier composant:', catalog[0] ? catalog[0].id : 'aucun');
    } else {
      console.log('Classe FileComponentCatalogAdapter non trouvée dans le module');
    }
  } catch (err) {
    console.error('Erreur:', err);
  }
}

main().catch(console.error);
