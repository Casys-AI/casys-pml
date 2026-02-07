/// <reference types="vitest" />
import { getViteConfig } from 'astro/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Charger les variables d'environnement depuis .env.local (optionnel)
function loadEnvFile() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};

    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });

    return envVars;
  } catch (_error) {
    // Fichier .env.local optionnel - pas d'erreur si absent
    return {};
  }
}

export default getViteConfig({
  test: {
    // Configuration Vitest
    environment: 'node',
    globals: true,
    // Charger les variables d'environnement depuis .env.local
    env: loadEnvFile(),
  },
});
