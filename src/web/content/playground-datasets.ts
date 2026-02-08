/**
 * Playground Mock Datasets
 *
 * Pre-configured datasets for the conversational playground.
 * Each dataset is keyed by ID and conforms to the exact MCP UI data format.
 *
 * @module web/content/playground-datasets
 */

// ============================================================================
// Types (matching MCP UI component expectations)
// ============================================================================

interface TableData {
  columns: string[];
  rows: unknown[][];
  totalCount?: number;
}

interface MetricData {
  id: string;
  label: string;
  value: number;
  unit?: string;
  history?: number[];
  min?: number;
  max?: number;
  thresholds?: { warning?: number; critical?: number };
  type?: "gauge" | "sparkline" | "stat" | "bar";
  description?: string;
}

interface PanelData {
  title?: string;
  metrics: MetricData[];
  columns?: number;
  timestamp?: string;
}

interface TimelineEvent {
  timestamp: string;
  type: "info" | "warning" | "error" | "success";
  title: string;
  description?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface TimelineData {
  title?: string;
  events: TimelineEvent[];
}

interface ResourceData {
  name: string;
  cpu: { percent: number; cores?: number };
  memory: { used: number; limit: number; percent: number };
  network?: { rxBytes: number; txBytes: number; rxRate?: number; txRate?: number };
  blockIO?: { read: number; write: number };
  timestamp?: number;
}

interface MonitorData {
  title?: string;
  resources: ResourceData[];
  timestamp?: string;
}

export interface DatasetEntry {
  uiType: string;
  resourceUri: string;
  title: string;
  data: TableData | PanelData | TimelineData | MonitorData;
}

// ============================================================================
// Helper: bytes
// ============================================================================

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

// ============================================================================
// TABLE-VIEWER DATASETS (8)
// ============================================================================

const salesMonthly: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Ventes mensuelles 2024-2025",
  data: {
    columns: ["Mois", "CA (k\u20ac)", "Commandes", "Panier moyen (\u20ac)", "Marge (%)", "Objectif (k\u20ac)", "\u00c9cart (%)"],
    rows: [
      ["Jan 2024", 487, 1245, 391, 32.1, 500, -2.6],
      ["F\u00e9v 2024", 512, 1312, 390, 33.4, 500, 2.4],
      ["Mar 2024", 598, 1487, 402, 31.8, 550, 8.7],
      ["Avr 2024", 543, 1356, 400, 34.2, 550, -1.3],
      ["Mai 2024", 621, 1523, 408, 35.1, 600, 3.5],
      ["Jun 2024", 589, 1467, 401, 33.7, 600, -1.8],
      ["Jul 2024", 478, 1189, 402, 31.2, 500, -4.4],
      ["Ao\u00fbt 2024", 412, 1034, 398, 30.5, 450, -8.4],
      ["Sep 2024", 634, 1578, 402, 34.8, 600, 5.7],
      ["Oct 2024", 687, 1698, 405, 35.6, 650, 5.7],
      ["Nov 2024", 823, 2045, 402, 36.2, 750, 9.7],
      ["D\u00e9c 2024", 945, 2356, 401, 37.1, 900, 5.0],
      ["Jan 2025", 534, 1367, 391, 33.5, 550, -2.9],
      ["F\u00e9v 2025", 567, 1423, 398, 34.1, 550, 3.1],
      ["Mar 2025", 645, 1589, 406, 33.9, 600, 7.5],
      ["Avr 2025", 612, 1501, 408, 35.3, 600, 2.0],
      ["Mai 2025", 678, 1645, 412, 36.0, 650, 4.3],
      ["Jun 2025", 654, 1587, 412, 34.8, 650, 0.6],
      ["Jul 2025", 523, 1278, 409, 32.4, 550, -4.9],
      ["Ao\u00fbt 2025", 456, 1123, 406, 31.8, 480, -5.0],
      ["Sep 2025", 698, 1712, 408, 35.2, 650, 7.4],
      ["Oct 2025", 745, 1834, 406, 36.1, 700, 6.4],
      ["Nov 2025", 889, 2189, 406, 37.0, 800, 11.1],
      ["D\u00e9c 2025", 1023, 2512, 407, 38.2, 950, 7.7],
    ],
    totalCount: 24,
  } as TableData,
};

const salesProducts: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Ventes par produit",
  data: {
    columns: ["Produit", "Cat\u00e9gorie", "Unit\u00e9s vendues", "CA (k\u20ac)", "Marge (%)", "Stock", "Tendance"],
    rows: [
      ["Casque Bluetooth Pro", "\u00c9lectronique", 3456, 276, 42.3, 234, "\u2191"],
      ["Enceinte Connect\u00e9e", "\u00c9lectronique", 2890, 231, 38.7, 178, "\u2191"],
      ["Clavier M\u00e9canique RGB", "Informatique", 2134, 149, 45.1, 312, "\u2192"],
      ["Souris Ergonomique", "Informatique", 1987, 119, 41.8, 289, "\u2191"],
      ["\u00c9cran 27\" 4K", "Informatique", 1245, 374, 28.5, 89, "\u2193"],
      ["Webcam HD 1080p", "Informatique", 1678, 84, 52.3, 456, "\u2191"],
      ["Hub USB-C", "Accessoires", 3234, 97, 55.7, 567, "\u2191"],
      ["C\u00e2ble HDMI 2.1", "Accessoires", 5678, 57, 62.1, 1234, "\u2192"],
      ["Support PC Portable", "Accessoires", 1890, 57, 48.9, 345, "\u2192"],
      ["Tapis de Souris XL", "Accessoires", 2456, 49, 58.4, 678, "\u2193"],
      ["Batterie Externe 20000mAh", "Mobile", 1567, 63, 35.2, 234, "\u2191"],
      ["Coque iPhone Premium", "Mobile", 4567, 46, 71.2, 890, "\u2192"],
      ["Protection \u00c9cran", "Mobile", 6789, 34, 78.5, 2345, "\u2192"],
      ["Chargeur Rapide 65W", "Mobile", 2345, 70, 44.6, 456, "\u2191"],
      ["Adaptateur Voyage", "Accessoires", 1234, 37, 51.3, 567, "\u2193"],
    ],
    totalCount: 15,
  } as TableData,
};

const employees: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Annuaire des employ\u00e9s",
  data: {
    columns: ["Nom", "Pr\u00e9nom", "Poste", "D\u00e9partement", "Bureau", "Anciennet\u00e9 (ans)", "Email"],
    rows: [
      ["Dupont", "Marie", "Directrice G\u00e9n\u00e9rale", "Direction", "Paris", 12, "m.dupont@casys.fr"],
      ["Lambert", "Thomas", "CTO", "Tech", "Paris", 8, "t.lambert@casys.fr"],
      ["Martin", "Sophie", "DRH", "RH", "Paris", 6, "s.martin@casys.fr"],
      ["Bernard", "Lucas", "Lead Dev Backend", "Tech", "Lyon", 5, "l.bernard@casys.fr"],
      ["Petit", "Camille", "Lead Dev Frontend", "Tech", "Lyon", 4, "c.petit@casys.fr"],
      ["Robert", "Julie", "DevOps Senior", "Tech", "Nantes", 3, "j.robert@casys.fr"],
      ["Moreau", "Antoine", "Chef de Projet", "Produit", "Paris", 7, "a.moreau@casys.fr"],
      ["Fournier", "Emma", "UX Designer", "Produit", "Bordeaux", 2, "e.fournier@casys.fr"],
      ["Leroy", "Nicolas", "Data Scientist", "Data", "Paris", 4, "n.leroy@casys.fr"],
      ["Roux", "Isabelle", "Comptable", "Finance", "Paris", 9, "i.roux@casys.fr"],
      ["Garcia", "Pierre", "D\u00e9veloppeur Full-Stack", "Tech", "Lyon", 2, "p.garcia@casys.fr"],
      ["Lefebvre", "Claire", "Responsable Marketing", "Marketing", "Paris", 5, "c.lefebvre@casys.fr"],
      ["Michel", "Julien", "Ing\u00e9nieur QA", "Tech", "Nantes", 3, "j.michel@casys.fr"],
      ["Girard", "Laura", "Commerciale S\u00e9nior", "Ventes", "Marseille", 6, "l.girard@casys.fr"],
      ["Andre", "Maxime", "Admin Sys", "Tech", "Nantes", 4, "m.andre@casys.fr"],
      ["Mercier", "Charlotte", "Product Owner", "Produit", "Paris", 3, "c.mercier@casys.fr"],
      ["Duval", "Franck", "Architecte Solution", "Tech", "Lyon", 7, "f.duval@casys.fr"],
      ["Bonnet", "Am\u00e9lie", "Support Client L2", "Support", "Bordeaux", 2, "a.bonnet@casys.fr"],
      ["Blanc", "David", "Commercial", "Ventes", "Marseille", 1, "d.blanc@casys.fr"],
      ["Fontaine", "Sarah", "Stagiaire Data", "Data", "Paris", 0.5, "s.fontaine@casys.fr"],
    ],
    totalCount: 20,
  } as TableData,
};

const inventory: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Inventaire entrep\u00f4t",
  data: {
    columns: ["R\u00e9f\u00e9rence", "Produit", "Cat\u00e9gorie", "Stock", "Seuil alerte", "Statut", "Entrep\u00f4t", "Derni\u00e8re MaJ"],
    rows: [
      ["SKU-001", "Casque Bluetooth Pro", "\u00c9lectronique", 234, 100, "OK", "Paris-Nord", "2026-02-05"],
      ["SKU-002", "Enceinte Connect\u00e9e", "\u00c9lectronique", 178, 150, "Alerte", "Paris-Nord", "2026-02-05"],
      ["SKU-003", "Clavier M\u00e9canique RGB", "Informatique", 312, 200, "OK", "Lyon-Est", "2026-02-04"],
      ["SKU-004", "Souris Ergonomique", "Informatique", 289, 200, "OK", "Lyon-Est", "2026-02-04"],
      ["SKU-005", "\u00c9cran 27\" 4K", "Informatique", 89, 100, "Critique", "Paris-Nord", "2026-02-05"],
      ["SKU-006", "Webcam HD 1080p", "Informatique", 456, 200, "OK", "Lyon-Est", "2026-02-03"],
      ["SKU-007", "Hub USB-C", "Accessoires", 567, 300, "OK", "Nantes-Ouest", "2026-02-04"],
      ["SKU-008", "C\u00e2ble HDMI 2.1", "Accessoires", 1234, 500, "OK", "Nantes-Ouest", "2026-02-03"],
      ["SKU-009", "Support PC Portable", "Accessoires", 345, 200, "OK", "Lyon-Est", "2026-02-02"],
      ["SKU-010", "Tapis de Souris XL", "Accessoires", 678, 300, "OK", "Nantes-Ouest", "2026-02-01"],
      ["SKU-011", "Batterie Externe 20000mAh", "Mobile", 234, 150, "OK", "Paris-Nord", "2026-02-05"],
      ["SKU-012", "Coque iPhone Premium", "Mobile", 890, 500, "OK", "Bordeaux-Sud", "2026-02-04"],
      ["SKU-013", "Protection \u00c9cran", "Mobile", 2345, 1000, "OK", "Bordeaux-Sud", "2026-02-04"],
      ["SKU-014", "Chargeur Rapide 65W", "Mobile", 456, 200, "OK", "Paris-Nord", "2026-02-05"],
      ["SKU-015", "Adaptateur Voyage", "Accessoires", 567, 300, "OK", "Nantes-Ouest", "2026-02-03"],
      ["SKU-016", "Station d'Accueil USB-C", "Informatique", 67, 100, "Critique", "Lyon-Est", "2026-02-05"],
      ["SKU-017", "Micro-Casque Teams", "\u00c9lectronique", 145, 150, "Alerte", "Paris-Nord", "2026-02-05"],
      ["SKU-018", "Cam\u00e9ra de Surveillance WiFi", "\u00c9lectronique", 78, 100, "Critique", "Bordeaux-Sud", "2026-02-04"],
      ["SKU-019", "Disque SSD 1To", "Informatique", 423, 200, "OK", "Lyon-Est", "2026-02-03"],
      ["SKU-020", "Cl\u00e9 USB 128Go", "Accessoires", 1567, 500, "OK", "Nantes-Ouest", "2026-02-02"],
      ["SKU-021", "Tablette 10\"", "\u00c9lectronique", 156, 100, "OK", "Paris-Nord", "2026-02-05"],
      ["SKU-022", "Imprimante Laser", "Informatique", 43, 50, "Alerte", "Lyon-Est", "2026-02-04"],
      ["SKU-023", "Routeur WiFi 6", "\u00c9lectronique", 198, 150, "OK", "Paris-Nord", "2026-02-05"],
      ["SKU-024", "Switch Ethernet 8 ports", "Informatique", 234, 100, "OK", "Nantes-Ouest", "2026-02-03"],
      ["SKU-025", "Onduleur 1500VA", "Informatique", 89, 50, "OK", "Lyon-Est", "2026-02-02"],
      ["SKU-026", "Casque Anti-Bruit", "\u00c9lectronique", 312, 200, "OK", "Paris-Nord", "2026-02-05"],
      ["SKU-027", "Drone FPV", "\u00c9lectronique", 23, 30, "Critique", "Bordeaux-Sud", "2026-02-04"],
      ["SKU-028", "Montre Connect\u00e9e", "\u00c9lectronique", 267, 150, "OK", "Paris-Nord", "2026-02-05"],
      ["SKU-029", "Barre de Son", "\u00c9lectronique", 134, 100, "OK", "Bordeaux-Sud", "2026-02-03"],
      ["SKU-030", "Projecteur Portable", "\u00c9lectronique", 45, 50, "Alerte", "Lyon-Est", "2026-02-04"],
    ],
    totalCount: 30,
  } as TableData,
};

const customers: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Clients actifs",
  data: {
    columns: ["Entreprise", "Contact", "Ville", "CA annuel (k\u20ac)", "Contrats actifs", "NPS", "Depuis"],
    rows: [
      ["Dupont SA", "Jean-Marc Dupont", "Paris", 245, 3, 78, "2019"],
      ["TechVision SAS", "Claire Berthier", "Lyon", 189, 2, 85, "2020"],
      ["Groupe Meridian", "Philippe Martel", "Marseille", 312, 5, 72, "2018"],
      ["Atlantic Digital", "Nathalie Rousseau", "Nantes", 156, 2, 91, "2021"],
      ["Solutions M\u00e9diterran\u00e9e", "Marc Olivier", "Montpellier", 98, 1, 65, "2022"],
      ["Bretagne Innov", "Sandrine Le Gall", "Rennes", 134, 2, 82, "2020"],
      ["Alpes Technologies", "Fr\u00e9d\u00e9ric Dumont", "Grenoble", 178, 3, 77, "2019"],
      ["Bordelais Group", "V\u00e9ronique Blanc", "Bordeaux", 267, 4, 88, "2017"],
      ["Nord Industries", "Guillaume Lefranc", "Lille", 145, 2, 71, "2021"],
      ["Val-de-Loire IT", "St\u00e9phanie Morel", "Tours", 87, 1, 69, "2023"],
      ["\u00cele-de-France Services", "Laurent Dubois", "Paris", 423, 6, 83, "2016"],
      ["Provence Digital", "Am\u00e9lie Garnier", "Aix-en-Provence", 112, 2, 76, "2022"],
      ["Occitanie Tech", "Thierry Caron", "Toulouse", 198, 3, 80, "2019"],
      ["Normandie Solutions", "Catherine Martin", "Rouen", 76, 1, 62, "2023"],
      ["Alsace Informatique", "Patrick Weber", "Strasbourg", 167, 2, 74, "2020"],
      ["Rh\u00f4ne-Alpes Data", "Emilie Perrin", "Lyon", 234, 4, 86, "2018"],
      ["Aquitaine Connect", "Damien Faure", "Bordeaux", 143, 2, 79, "2021"],
      ["Lorraine Digital", "Isabelle Petit", "Nancy", 91, 1, 67, "2022"],
      ["PACA Industries", "Olivier Roux", "Nice", 178, 3, 73, "2019"],
      ["Centre-Val Systems", "Marie Lefevre", "Orl\u00e9ans", 65, 1, 58, "2024"],
      ["Picardie Tech", "Christophe Morin", "Amiens", 54, 1, 61, "2024"],
      ["Champagne IT", "H\u00e9l\u00e8ne Bernard", "Reims", 89, 1, 70, "2023"],
      ["Bourgogne Services", "Yann Gauthier", "Dijon", 112, 2, 75, "2021"],
      ["Savoie Connect", "Anne-Sophie Mercier", "Annecy", 98, 1, 81, "2022"],
      ["Limousin Digital", "R\u00e9mi Fournier", "Limoges", 43, 1, 55, "2024"],
    ],
    totalCount: 25,
  } as TableData,
};

const ordersRecent: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Commandes r\u00e9centes",
  data: {
    columns: ["N\u00b0 Commande", "Client", "Date", "Montant (\u20ac)", "Articles", "Statut", "Paiement"],
    rows: [
      ["CMD-2026-4521", "Dupont SA", "2026-02-06", 12450, 8, "Livr\u00e9e", "Virement"],
      ["CMD-2026-4520", "TechVision SAS", "2026-02-06", 8790, 5, "En cours", "CB"],
      ["CMD-2026-4519", "Atlantic Digital", "2026-02-05", 3420, 3, "Exp\u00e9di\u00e9e", "CB"],
      ["CMD-2026-4518", "Bordelais Group", "2026-02-05", 23100, 15, "Livr\u00e9e", "Virement"],
      ["CMD-2026-4517", "Groupe Meridian", "2026-02-05", 15670, 12, "En cours", "Virement"],
      ["CMD-2026-4516", "Bretagne Innov", "2026-02-04", 4560, 4, "Exp\u00e9di\u00e9e", "CB"],
      ["CMD-2026-4515", "Nord Industries", "2026-02-04", 7890, 6, "Livr\u00e9e", "Virement"],
      ["CMD-2026-4514", "Alpes Technologies", "2026-02-04", 9340, 7, "Exp\u00e9di\u00e9e", "CB"],
      ["CMD-2026-4513", "\u00cele-de-France Services", "2026-02-03", 34560, 22, "Livr\u00e9e", "Virement"],
      ["CMD-2026-4512", "Rh\u00f4ne-Alpes Data", "2026-02-03", 11230, 9, "Livr\u00e9e", "CB"],
      ["CMD-2026-4511", "Occitanie Tech", "2026-02-03", 6780, 5, "Exp\u00e9di\u00e9e", "Virement"],
      ["CMD-2026-4510", "Provence Digital", "2026-02-02", 2340, 2, "Livr\u00e9e", "CB"],
      ["CMD-2026-4509", "Alsace Informatique", "2026-02-02", 8910, 7, "Livr\u00e9e", "Virement"],
      ["CMD-2026-4508", "Solutions M\u00e9diterran\u00e9e", "2026-02-01", 5670, 4, "Livr\u00e9e", "CB"],
      ["CMD-2026-4507", "Aquitaine Connect", "2026-02-01", 4230, 3, "Livr\u00e9e", "CB"],
      ["CMD-2026-4506", "PACA Industries", "2026-01-31", 12340, 10, "Livr\u00e9e", "Virement"],
      ["CMD-2026-4505", "Val-de-Loire IT", "2026-01-31", 1890, 2, "Livr\u00e9e", "CB"],
      ["CMD-2026-4504", "Normandie Solutions", "2026-01-30", 3450, 3, "Annul\u00e9e", "CB"],
      ["CMD-2026-4503", "Champagne IT", "2026-01-30", 6720, 5, "Livr\u00e9e", "Virement"],
      ["CMD-2026-4502", "Bourgogne Services", "2026-01-29", 7890, 6, "Livr\u00e9e", "CB"],
    ],
    totalCount: 20,
  } as TableData,
};

const supportTickets: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Tickets support ouverts",
  data: {
    columns: ["Ticket", "Client", "Sujet", "Priorit\u00e9", "Assign\u00e9 \u00e0", "Ouvert le", "SLA restant"],
    rows: [
      ["TK-891", "Dupont SA", "API timeout sur /v2/sync", "Critique", "Julie Robert", "2026-02-06", "2h"],
      ["TK-890", "TechVision SAS", "Erreur 403 sur dashboard", "Haute", "Lucas Bernard", "2026-02-06", "4h"],
      ["TK-889", "Groupe Meridian", "Lenteur requ\u00eates SQL > 5s", "Haute", "Nicolas Leroy", "2026-02-05", "8h"],
      ["TK-888", "Atlantic Digital", "Import CSV \u00e9choue \u00e0 10k lignes", "Moyenne", "Pierre Garcia", "2026-02-05", "24h"],
      ["TK-887", "\u00cele-de-France Services", "SSO SAML ne fonctionne plus", "Critique", "Maxime Andre", "2026-02-05", "1h"],
      ["TK-886", "Rh\u00f4ne-Alpes Data", "Rapport PDF tronqu\u00e9", "Basse", "Am\u00e9lie Bonnet", "2026-02-04", "48h"],
      ["TK-885", "Bordelais Group", "Notification email non re\u00e7ue", "Moyenne", "Am\u00e9lie Bonnet", "2026-02-04", "16h"],
      ["TK-884", "Bretagne Innov", "Probl\u00e8me d'affichage mobile", "Basse", "Camille Petit", "2026-02-04", "72h"],
      ["TK-883", "Nord Industries", "Demande d'\u00e9volution filtres", "Basse", "Charlotte Mercier", "2026-02-03", "En attente"],
      ["TK-882", "Occitanie Tech", "Webhook ne se d\u00e9clenche pas", "Haute", "Julien Michel", "2026-02-03", "6h"],
      ["TK-881", "Provence Digital", "Acc\u00e8s refus\u00e9 sur workspace", "Moyenne", "Maxime Andre", "2026-02-03", "12h"],
      ["TK-880", "Alsace Informatique", "Export Excel corrompu", "Moyenne", "Pierre Garcia", "2026-02-02", "20h"],
      ["TK-879", "Alpes Technologies", "Int\u00e9gration Stripe en erreur", "Haute", "Lucas Bernard", "2026-02-02", "3h"],
      ["TK-878", "Solutions M\u00e9diterran\u00e9e", "Question facturation", "Basse", "Isabelle Roux", "2026-02-01", "En attente"],
      ["TK-877", "Savoie Connect", "Mise \u00e0 jour documentation API", "Basse", "Charlotte Mercier", "2026-01-31", "En attente"],
    ],
    totalCount: 15,
  } as TableData,
};

const marketingCampaigns: DatasetEntry = {
  uiType: "table-viewer",
  resourceUri: "ui://mcp-std/table-viewer",
  title: "Campagnes marketing",
  data: {
    columns: ["Campagne", "Canal", "Budget (\u20ac)", "D\u00e9pens\u00e9 (\u20ac)", "Impressions", "Clics", "Conversions", "CPA (\u20ac)", "ROI (%)"],
    rows: [
      ["Lancement Produit Q1", "Google Ads", 15000, 12340, 456000, 8900, 234, 52.7, 187],
      ["Retargeting F\u00e9vrier", "Meta Ads", 8000, 7650, 234000, 5670, 189, 40.5, 215],
      ["Newsletter Promo", "Email", 2000, 1890, 45000, 6780, 312, 6.1, 890],
      ["Content SEO Blog", "Organique", 5000, 4500, 89000, 12300, 156, 28.8, 245],
      ["Webinaire Tech", "LinkedIn", 3000, 2890, 23000, 2340, 89, 32.5, 178],
      ["Salon Professionnel", "\u00c9v\u00e9nement", 25000, 24500, 12000, 3400, 67, 365.7, 45],
      ["Campagne LinkedIn", "LinkedIn Ads", 6000, 5670, 145000, 3450, 123, 46.1, 167],
      ["Partenariat Influenceur", "YouTube", 10000, 9800, 567000, 23400, 345, 28.4, 234],
      ["Campagne TikTok", "TikTok Ads", 4000, 3890, 890000, 34500, 98, 39.7, 112],
      ["Affiliation Q1", "Affiliation", 7000, 6540, 123000, 8900, 278, 23.5, 312],
    ],
    totalCount: 10,
  } as TableData,
};

// ============================================================================
// METRICS-PANEL DATASETS (6)
// ============================================================================

const kpiSales: DatasetEntry = {
  uiType: "metrics-panel",
  resourceUri: "ui://mcp-std/metrics-panel",
  title: "KPIs Commerciaux",
  data: {
    title: "KPIs Commerciaux - F\u00e9vrier 2026",
    columns: 3,
    timestamp: "2026-02-06T14:30:00Z",
    metrics: [
      { id: "ca-mensuel", label: "CA Mensuel", value: 567, unit: "k\u20ac", type: "stat" as const, history: [487, 512, 598, 543, 621, 589, 478, 412, 634, 687, 823, 945], description: "Chiffre d'affaires du mois en cours" },
      { id: "objectif", label: "Objectif Atteint", value: 73, unit: "%", type: "gauge" as const, min: 0, max: 100, thresholds: { warning: 80, critical: 50 }, description: "Progression vers l'objectif mensuel" },
      { id: "panier-moyen", label: "Panier Moyen", value: 398, unit: "\u20ac", type: "stat" as const, description: "Montant moyen par commande" },
      { id: "nb-commandes", label: "Commandes", value: 1423, type: "sparkline" as const, history: [1245, 1312, 1487, 1356, 1523, 1467, 1189, 1034, 1578, 1698, 2045, 2356], description: "Nombre de commandes ce mois" },
      { id: "taux-conversion", label: "Taux de Conversion", value: 3.2, unit: "%", type: "bar" as const, min: 0, max: 10, thresholds: { warning: 2, critical: 1 }, description: "Visiteurs convertis en acheteurs" },
      { id: "nps", label: "NPS", value: 72, type: "gauge" as const, min: -100, max: 100, thresholds: { warning: 50, critical: 0 }, description: "Net Promoter Score" },
    ],
  } as PanelData,
};

const kpiOps: DatasetEntry = {
  uiType: "metrics-panel",
  resourceUri: "ui://mcp-std/metrics-panel",
  title: "KPIs Op\u00e9rationnels",
  data: {
    title: "KPIs Op\u00e9rationnels",
    columns: 3,
    timestamp: "2026-02-06T14:30:00Z",
    metrics: [
      { id: "uptime", label: "Uptime", value: 99.97, unit: "%", type: "gauge" as const, min: 99, max: 100, thresholds: { warning: 99.9, critical: 99.5 }, description: "Disponibilit\u00e9 de la plateforme" },
      { id: "latence-p99", label: "Latence P99", value: 245, unit: "ms", type: "bar" as const, min: 0, max: 500, thresholds: { warning: 300, critical: 500 }, description: "Latence au 99e percentile" },
      { id: "erreurs-5xx", label: "Erreurs 5xx", value: 12, type: "sparkline" as const, history: [45, 23, 18, 34, 12, 8, 15, 22, 19, 14, 9, 12], description: "Erreurs serveur derni\u00e8res 24h" },
      { id: "deployments", label: "D\u00e9ploiements/sem", value: 8, type: "stat" as const, description: "D\u00e9ploiements cette semaine" },
      { id: "mttr", label: "MTTR", value: 23, unit: "min", type: "bar" as const, min: 0, max: 120, thresholds: { warning: 30, critical: 60 }, description: "Mean Time To Recovery" },
    ],
  } as PanelData,
};

const kpiHr: DatasetEntry = {
  uiType: "metrics-panel",
  resourceUri: "ui://mcp-std/metrics-panel",
  title: "KPIs Ressources Humaines",
  data: {
    title: "KPIs RH - F\u00e9vrier 2026",
    columns: 3,
    timestamp: "2026-02-06T14:30:00Z",
    metrics: [
      { id: "effectif", label: "Effectif Total", value: 47, type: "stat" as const, description: "Nombre d'employ\u00e9s actifs" },
      { id: "turnover", label: "Turnover Annuel", value: 8.5, unit: "%", type: "gauge" as const, min: 0, max: 30, thresholds: { warning: 15, critical: 25 }, description: "Taux de rotation du personnel" },
      { id: "satisfaction", label: "Satisfaction", value: 78, unit: "%", type: "gauge" as const, min: 0, max: 100, thresholds: { warning: 70, critical: 50 }, description: "Score satisfaction employ\u00e9s" },
      { id: "postes-ouverts", label: "Postes Ouverts", value: 5, type: "stat" as const, description: "Recrutements en cours" },
      { id: "formation", label: "Heures Formation", value: 234, unit: "h", type: "sparkline" as const, history: [180, 210, 195, 245, 220, 234], description: "Heures de formation ce trimestre" },
      { id: "absenteisme", label: "Absent\u00e9isme", value: 3.2, unit: "%", type: "bar" as const, min: 0, max: 10, thresholds: { warning: 5, critical: 8 }, description: "Taux d'absent\u00e9isme" },
    ],
  } as PanelData,
};

const kpiFinance: DatasetEntry = {
  uiType: "metrics-panel",
  resourceUri: "ui://mcp-std/metrics-panel",
  title: "KPIs Finance",
  data: {
    title: "KPIs Finance - F\u00e9vrier 2026",
    columns: 3,
    timestamp: "2026-02-06T14:30:00Z",
    metrics: [
      { id: "ca-ytd", label: "CA YTD", value: 1101, unit: "k\u20ac", type: "stat" as const, description: "Chiffre d'affaires Year-To-Date" },
      { id: "marge-brute", label: "Marge Brute", value: 35.8, unit: "%", type: "gauge" as const, min: 0, max: 50, thresholds: { warning: 30, critical: 20 }, description: "Marge brute globale" },
      { id: "tresorerie", label: "Tr\u00e9sorerie", value: 890, unit: "k\u20ac", type: "sparkline" as const, history: [780, 810, 845, 823, 856, 878, 890], description: "Position de tr\u00e9sorerie" },
      { id: "burn-rate", label: "Burn Rate", value: 145, unit: "k\u20ac/mois", type: "stat" as const, description: "D\u00e9penses mensuelles nettes" },
      { id: "runway", label: "Runway", value: 6.1, unit: "mois", type: "bar" as const, min: 0, max: 12, thresholds: { warning: 6, critical: 3 }, description: "Dur\u00e9e de vie avec la tr\u00e9sorerie actuelle" },
      { id: "arr", label: "ARR", value: 2340, unit: "k\u20ac", type: "stat" as const, description: "Annual Recurring Revenue" },
    ],
  } as PanelData,
};

const kpiMarketing: DatasetEntry = {
  uiType: "metrics-panel",
  resourceUri: "ui://mcp-std/metrics-panel",
  title: "KPIs Marketing",
  data: {
    title: "KPIs Marketing - F\u00e9vrier 2026",
    columns: 3,
    timestamp: "2026-02-06T14:30:00Z",
    metrics: [
      { id: "leads", label: "Leads G\u00e9n\u00e9r\u00e9s", value: 456, type: "sparkline" as const, history: [312, 345, 378, 402, 423, 456], description: "Nouveaux leads ce mois" },
      { id: "cac", label: "CAC", value: 87, unit: "\u20ac", type: "bar" as const, min: 0, max: 200, thresholds: { warning: 120, critical: 180 }, description: "Co\u00fbt d'Acquisition Client" },
      { id: "roi-campagnes", label: "ROI Campagnes", value: 234, unit: "%", type: "gauge" as const, min: 0, max: 500, thresholds: { warning: 100, critical: 50 }, description: "Retour sur investissement publicitaire" },
      { id: "trafic-web", label: "Trafic Web", value: 45600, type: "sparkline" as const, history: [34000, 36500, 38900, 41200, 43800, 45600], description: "Visiteurs uniques ce mois" },
      { id: "taux-ouverture", label: "Taux d'Ouverture Email", value: 28.4, unit: "%", type: "gauge" as const, min: 0, max: 50, thresholds: { warning: 20, critical: 10 }, description: "Taux d'ouverture newsletters" },
    ],
  } as PanelData,
};

const kpiProduct: DatasetEntry = {
  uiType: "metrics-panel",
  resourceUri: "ui://mcp-std/metrics-panel",
  title: "KPIs Produit",
  data: {
    title: "KPIs Produit - F\u00e9vrier 2026",
    columns: 3,
    timestamp: "2026-02-06T14:30:00Z",
    metrics: [
      { id: "mau", label: "MAU", value: 12400, type: "sparkline" as const, history: [8900, 9500, 10200, 10800, 11500, 12400], description: "Monthly Active Users" },
      { id: "retention-j7", label: "R\u00e9tention J7", value: 45, unit: "%", type: "gauge" as const, min: 0, max: 100, thresholds: { warning: 40, critical: 20 }, description: "Utilisateurs actifs apr\u00e8s 7 jours" },
      { id: "bugs-ouverts", label: "Bugs Ouverts", value: 23, type: "bar" as const, min: 0, max: 50, thresholds: { warning: 30, critical: 45 }, description: "Bugs non r\u00e9solus" },
      { id: "velocity", label: "V\u00e9locit\u00e9 Sprint", value: 42, unit: "pts", type: "sparkline" as const, history: [35, 38, 40, 37, 43, 42], description: "Points de sprint r\u00e9alis\u00e9s" },
      { id: "satisfaction-produit", label: "CSAT Produit", value: 4.2, unit: "/5", type: "stat" as const, description: "Score satisfaction produit" },
      { id: "adoption-feature", label: "Adoption Nouvelle Feature", value: 67, unit: "%", type: "gauge" as const, min: 0, max: 100, thresholds: { warning: 50, critical: 25 }, description: "% utilisateurs ayant utilis\u00e9 la derni\u00e8re feature" },
    ],
  } as PanelData,
};

// ============================================================================
// TIMELINE-VIEWER DATASETS (5)
// ============================================================================

const deployHistory: DatasetEntry = {
  uiType: "timeline-viewer",
  resourceUri: "ui://mcp-std/timeline-viewer",
  title: "Historique de d\u00e9ploiement",
  data: {
    title: "D\u00e9ploiements - F\u00e9vrier 2026",
    events: [
      { timestamp: "2026-02-06T14:22:00Z", type: "success" as const, title: "v2.14.3 d\u00e9ploy\u00e9 en production", description: "Hotfix: correction timeout API /v2/sync. Temps de d\u00e9ploiement: 3min 42s.", source: "CI/CD Pipeline", metadata: { commit: "a3f8b21", auteur: "Julie Robert", env: "production" } },
      { timestamp: "2026-02-06T11:05:00Z", type: "success" as const, title: "v2.14.3 d\u00e9ploy\u00e9 en staging", description: "Tests de non-r\u00e9gression pass\u00e9s (234/234).", source: "CI/CD Pipeline", metadata: { commit: "a3f8b21", auteur: "Julie Robert", env: "staging" } },
      { timestamp: "2026-02-05T16:30:00Z", type: "error" as const, title: "v2.14.2 rollback production", description: "Rollback automatique suite \u00e0 d\u00e9tection d'erreurs 5xx > seuil (45/min). Dur\u00e9e incident: 8min.", source: "CI/CD Pipeline", metadata: { commit: "c7d2e19", auteur: "Lucas Bernard", erreurs_5xx: 312 } },
      { timestamp: "2026-02-05T16:22:00Z", type: "error" as const, title: "v2.14.2 \u00e9chec en production", description: "D\u00e9ploiement compl\u00e9t\u00e9 mais health check \u00e9chou\u00e9 sur 3/5 pods.", source: "CI/CD Pipeline", metadata: { commit: "c7d2e19", auteur: "Lucas Bernard", pods_unhealthy: 3 } },
      { timestamp: "2026-02-05T14:00:00Z", type: "success" as const, title: "v2.14.2 d\u00e9ploy\u00e9 en staging", description: "Tests pass\u00e9s (234/234). Approuv\u00e9 pour production.", source: "CI/CD Pipeline", metadata: { commit: "c7d2e19", auteur: "Lucas Bernard", env: "staging" } },
      { timestamp: "2026-02-04T10:15:00Z", type: "success" as const, title: "v2.14.1 d\u00e9ploy\u00e9 en production", description: "Feature: nouveau tableau de bord analytics. D\u00e9ploiement blue/green r\u00e9ussi.", source: "CI/CD Pipeline", metadata: { commit: "f1a9c34", auteur: "Camille Petit", env: "production" } },
      { timestamp: "2026-02-03T17:45:00Z", type: "warning" as const, title: "v2.14.1 d\u00e9ploiement lent", description: "D\u00e9ploiement staging termin\u00e9 en 12min (SLA: 5min). Migration DB lente.", source: "CI/CD Pipeline", metadata: { commit: "f1a9c34", duree_min: 12, sla_min: 5 } },
      { timestamp: "2026-02-02T09:30:00Z", type: "success" as const, title: "v2.14.0 d\u00e9ploy\u00e9 en production", description: "Release majeure: int\u00e9gration SSO SAML + refonte API permissions.", source: "CI/CD Pipeline", metadata: { commit: "b8e5d12", auteur: "Maxime Andre", env: "production", breaking_changes: 2 } },
      { timestamp: "2026-02-01T14:20:00Z", type: "info" as const, title: "Migration base de donn\u00e9es #044", description: "Migration ajout colonnes m\u00e9tadonn\u00e9es UI. 0 downtime.", source: "DB Migrator", metadata: { migration: "044_ui_metadata", duree_sec: 34 } },
      { timestamp: "2026-01-31T11:00:00Z", type: "success" as const, title: "v2.13.9 d\u00e9ploy\u00e9 en production", description: "Bugfix: correction pagination sur endpoint /capabilities.", source: "CI/CD Pipeline", metadata: { commit: "e4c7a89", auteur: "Pierre Garcia", env: "production" } },
      { timestamp: "2026-01-30T16:45:00Z", type: "warning" as const, title: "Certificat SSL renouvellement", description: "Certificat *.casys.fr renouvel\u00e9 automatiquement. Expiration pr\u00e9c\u00e9dente: 2026-02-15.", source: "Cert Manager", metadata: { domaine: "*.casys.fr", validite_jours: 90 } },
      { timestamp: "2026-01-29T08:00:00Z", type: "success" as const, title: "v2.13.8 d\u00e9ploy\u00e9 en production", description: "Optimisation: cache Redis sur requ\u00eates catalogue. Latence P99 -40%.", source: "CI/CD Pipeline", metadata: { commit: "d2f1b78", auteur: "Franck Duval", env: "production" } },
      { timestamp: "2026-01-28T13:30:00Z", type: "info" as const, title: "Mise \u00e0 jour Kubernetes 1.29", description: "Cluster production mis \u00e0 jour vers k8s 1.29.2. Rolling update sans interruption.", source: "Infrastructure", metadata: { version_precedente: "1.28.4", version: "1.29.2" } },
      { timestamp: "2026-01-27T10:00:00Z", type: "error" as const, title: "Pipeline CI bloqu\u00e9e", description: "Runner GitLab satur\u00e9. File d'attente: 45 jobs. R\u00e9solution: scaling horizontal.", source: "CI/CD", metadata: { jobs_en_attente: 45, duree_incident_min: 35 } },
      { timestamp: "2026-01-26T15:15:00Z", type: "success" as const, title: "v2.13.7 d\u00e9ploy\u00e9 en production", description: "Feature: export PDF des rapports. Tests E2E pass\u00e9s.", source: "CI/CD Pipeline", metadata: { commit: "a1b2c3d", auteur: "Sophie Martin", env: "production" } },
    ],
  } as TimelineData,
};

const incidentLog: DatasetEntry = {
  uiType: "timeline-viewer",
  resourceUri: "ui://mcp-std/timeline-viewer",
  title: "Journal d'incidents",
  data: {
    title: "Incidents - Janvier/F\u00e9vrier 2026",
    events: [
      { timestamp: "2026-02-05T16:22:00Z", type: "error" as const, title: "INC-2026-034 : Erreurs 5xx massives", description: "D\u00e9ploiement v2.14.2 a caus\u00e9 des erreurs 5xx sur l'API. Rollback automatique en 8 min. Impact: 312 requ\u00eates en erreur.", source: "API Gateway", metadata: { severite: "P1", duree_min: 8, clients_impactes: 23, cause: "Migration DB incompatible" } },
      { timestamp: "2026-02-03T03:15:00Z", type: "warning" as const, title: "INC-2026-033 : Latence \u00e9lev\u00e9e base de donn\u00e9es", description: "Latence PostgreSQL > 2s pendant 45 min. Cause: vacuum auto sur table capabilities (12M rows).", source: "PostgreSQL", metadata: { severite: "P2", duree_min: 45, latence_max_ms: 2340 } },
      { timestamp: "2026-01-31T22:00:00Z", type: "error" as const, title: "INC-2026-032 : Panne Redis cluster", description: "Failover Redis sentinel d\u00e9clench\u00e9 apr\u00e8s perte du n\u0153ud master. Failover automatique en 12s. Cache froid pendant 3 min.", source: "Redis Sentinel", metadata: { severite: "P1", duree_min: 3, cause: "OOM killer" } },
      { timestamp: "2026-01-28T09:30:00Z", type: "warning" as const, title: "INC-2026-031 : Saturation disque /var/log", description: "Partition /var/log \u00e0 95%. Rotation des logs forc\u00e9e. Cause: logs debug activ\u00e9s par erreur en production.", source: "node-prod-03", metadata: { severite: "P3", espace_libere_gb: 45 } },
      { timestamp: "2026-01-25T14:00:00Z", type: "error" as const, title: "INC-2026-030 : API payments timeout", description: "Timeouts sur l'API Stripe pendant 25 min. Cause: incident c\u00f4t\u00e9 Stripe (status.stripe.com confirm\u00e9). Aucune transaction perdue.", source: "Payment Service", metadata: { severite: "P1", duree_min: 25, transactions_en_attente: 67 } },
      { timestamp: "2026-01-22T07:45:00Z", type: "warning" as const, title: "INC-2026-029 : Certificat expir\u00e9 sur staging", description: "Le certificat SSL staging a expir\u00e9, bloquant les tests d'int\u00e9gration pendant 2h. Renouvellement manuel effectu\u00e9.", source: "Cert Manager", metadata: { severite: "P3", duree_h: 2, domaine: "staging.casys.fr" } },
      { timestamp: "2026-01-18T11:30:00Z", type: "error" as const, title: "INC-2026-028 : Fuite m\u00e9moire worker", description: "Worker de traitement batch consomme 14 GB (limit: 8 GB). OOM kill + restart automatique. Cause: r\u00e9f\u00e9rence circulaire dans le cache.", source: "worker-batch-01", metadata: { severite: "P2", memoire_gb: 14, limit_gb: 8, cause: "R\u00e9f\u00e9rence circulaire" } },
      { timestamp: "2026-01-15T19:00:00Z", type: "warning" as const, title: "INC-2026-027 : D\u00e9gradation performances CDN", description: "Temps de r\u00e9ponse CDN multipli\u00e9 par 3 pendant 1h. Cause: purge cache globale suite \u00e0 mise \u00e0 jour assets.", source: "Cloudflare", metadata: { severite: "P2", duree_min: 60, latence_moyenne_ms: 890 } },
      { timestamp: "2026-01-12T02:30:00Z", type: "error" as const, title: "INC-2026-026 : Perte connectivit\u00e9 DC Marseille", description: "Datacenter Marseille injoignable pendant 15 min. Failover DNS vers Paris. Impact: latence +80ms pour clients sud.", source: "Network", metadata: { severite: "P1", duree_min: 15, cause: "Coupure fibre OVH" } },
      { timestamp: "2026-01-08T10:00:00Z", type: "info" as const, title: "INC-2026-025 : Fausse alerte monitoring", description: "Alerte PagerDuty pour CPU > 95% sur node-prod-01. Cause: job de backup planifi\u00e9. Ajustement seuil d'alerte effectu\u00e9.", source: "Prometheus", metadata: { severite: "P4", action: "Seuil CPU ajust\u00e9 \u00e0 98% pendant fen\u00eatre backup" } },
    ],
  } as TimelineData,
};

const projectMilestones: DatasetEntry = {
  uiType: "timeline-viewer",
  resourceUri: "ui://mcp-std/timeline-viewer",
  title: "Jalons du projet",
  data: {
    title: "Jalons Projet PML - 2026",
    events: [
      { timestamp: "2026-02-06T10:00:00Z", type: "success" as const, title: "Sprint 17 : Playground conversationnel", description: "D\u00e9mo playground avec MCP UIs interactives. 4 types de widgets fonctionnels.", source: "Produit", metadata: { sprint: 17, stories_completees: 3, velocity: 42 } },
      { timestamp: "2026-01-27T10:00:00Z", type: "success" as const, title: "Sprint 16 : Isolation et sandboxing", description: "Ex\u00e9cution s\u00e9curis\u00e9e des capabilities dans des workers isol\u00e9s. Tests de s\u00e9curit\u00e9 pass\u00e9s.", source: "Produit", metadata: { sprint: 16, stories_completees: 5, velocity: 45 } },
      { timestamp: "2026-01-13T10:00:00Z", type: "success" as const, title: "Sprint 15 : Catalogue et d\u00e9couverte", description: "Interface de d\u00e9couverte du catalogue avec recherche s\u00e9mantique et graphe de d\u00e9pendances.", source: "Produit", metadata: { sprint: 15, stories_completees: 4, velocity: 38 } },
      { timestamp: "2026-01-06T10:00:00Z", type: "info" as const, title: "Revue de roadmap Q1 2026", description: "Alignement avec les objectifs trimestriels. Focus: playground, performances, documentation.", source: "Direction", metadata: { participants: 8, decisions: 5 } },
      { timestamp: "2025-12-20T10:00:00Z", type: "success" as const, title: "Release PML v2.0", description: "Release majeure : nouveau runtime, MCP UI framework, CLI am\u00e9lior\u00e9. 45 capabilities dans le catalogue.", source: "Produit", metadata: { version: "2.0.0", capabilities: 45, breaking_changes: 3 } },
      { timestamp: "2025-12-06T10:00:00Z", type: "warning" as const, title: "Sprint 13 : D\u00e9passement scope", description: "Sprint termin\u00e9 avec 2 stories non compl\u00e9t\u00e9es. Cause: complexit\u00e9 sous-estim\u00e9e du transport iframe.", source: "Produit", metadata: { sprint: 13, stories_completees: 3, stories_reportees: 2, velocity: 28 } },
      { timestamp: "2025-11-22T10:00:00Z", type: "success" as const, title: "Sprint 12 : Landing page V2", description: "Nouvelle landing page avec design system unifi\u00e9. A/B test pr\u00eat.", source: "Produit", metadata: { sprint: 12, stories_completees: 6, velocity: 47 } },
      { timestamp: "2025-11-01T10:00:00Z", type: "info" as const, title: "Recrutement : 2 d\u00e9veloppeurs", description: "Arriv\u00e9e de Pierre Garcia (Full-Stack) et David Blanc (Commercial).", source: "RH", metadata: { postes: ["D\u00e9veloppeur Full-Stack", "Commercial"] } },
      { timestamp: "2025-10-15T10:00:00Z", type: "success" as const, title: "Premi\u00e8re d\u00e9mo client", description: "D\u00e9monstration du prototype \u00e0 3 clients pilotes. Retours tr\u00e8s positifs.", source: "Ventes", metadata: { clients: ["Dupont SA", "TechVision SAS", "Bordelais Group"], nps_moyen: 85 } },
      { timestamp: "2025-09-01T10:00:00Z", type: "info" as const, title: "Lancement du projet PML", description: "Kickoff officiel du projet Procedural Memory Layer. \u00c9quipe initiale: 5 personnes.", source: "Direction", metadata: { budget_initial_k: 500, equipe_initiale: 5 } },
      { timestamp: "2025-08-15T10:00:00Z", type: "success" as const, title: "Validation POC", description: "Proof of Concept valid\u00e9 : ex\u00e9cution de capabilities via MCP avec UI auto-g\u00e9n\u00e9r\u00e9e.", source: "Tech", metadata: { duree_poc_semaines: 6, technologies: ["Deno", "MCP", "Fresh"] } },
      { timestamp: "2025-07-01T10:00:00Z", type: "info" as const, title: "Phase de recherche", description: "D\u00e9but de la phase de recherche sur MCP (Model Context Protocol) et les patterns d'int\u00e9gration LLM.", source: "Tech", metadata: { duree_semaines: 6, spikes: 4 } },
    ],
  } as TimelineData,
};

const userActivity: DatasetEntry = {
  uiType: "timeline-viewer",
  resourceUri: "ui://mcp-std/timeline-viewer",
  title: "Activit\u00e9 utilisateur",
  data: {
    title: "Activit\u00e9 r\u00e9cente - Marie Dupont",
    events: [
      { timestamp: "2026-02-06T14:25:00Z", type: "info" as const, title: "Consultation dashboard analytics", source: "Dashboard" },
      { timestamp: "2026-02-06T14:10:00Z", type: "success" as const, title: "Export rapport mensuel PDF", description: "Rapport ventes janvier 2026 export\u00e9 (23 pages).", source: "Rapports" },
      { timestamp: "2026-02-06T11:30:00Z", type: "info" as const, title: "Modification param\u00e8tres workspace", description: "Ajout de 2 utilisateurs au workspace 'Production'.", source: "Admin" },
      { timestamp: "2026-02-06T09:00:00Z", type: "info" as const, title: "Connexion", source: "Auth", metadata: { ip: "92.184.xxx.xxx", navigateur: "Chrome 121", os: "macOS 15.2" } },
      { timestamp: "2026-02-05T17:45:00Z", type: "success" as const, title: "Approbation d\u00e9ploiement v2.14.2", description: "Approbation du d\u00e9ploiement en production (rollback ult\u00e9rieur).", source: "CI/CD" },
      { timestamp: "2026-02-05T16:30:00Z", type: "warning" as const, title: "Alerte re\u00e7ue : erreurs 5xx", description: "Notification PagerDuty re\u00e7ue et acquitt\u00e9e.", source: "Monitoring" },
      { timestamp: "2026-02-05T14:00:00Z", type: "info" as const, title: "Revue de sprint 16", description: "Participation \u00e0 la revue de sprint. 5 stories d\u00e9montr\u00e9es.", source: "Jira" },
      { timestamp: "2026-02-05T10:15:00Z", type: "info" as const, title: "Cr\u00e9ation ticket TK-891", description: "Ticket support cr\u00e9\u00e9 pour Dupont SA : API timeout.", source: "Support" },
      { timestamp: "2026-02-05T09:00:00Z", type: "info" as const, title: "Connexion", source: "Auth", metadata: { ip: "92.184.xxx.xxx", navigateur: "Chrome 121" } },
      { timestamp: "2026-02-04T16:00:00Z", type: "success" as const, title: "Signature contrat Savoie Connect", description: "Contrat annuel sign\u00e9 : 98k\u20ac ARR.", source: "CRM" },
      { timestamp: "2026-02-04T14:30:00Z", type: "info" as const, title: "Visioconf\u00e9rence client", description: "Appel de 45min avec Rh\u00f4ne-Alpes Data pour revue trimestrielle.", source: "Calendar" },
      { timestamp: "2026-02-04T11:00:00Z", type: "info" as const, title: "Consultation facturation", description: "V\u00e9rification factures en attente (3 factures, 45k\u20ac total).", source: "Finance" },
      { timestamp: "2026-02-04T09:15:00Z", type: "info" as const, title: "Connexion", source: "Auth" },
      { timestamp: "2026-02-03T17:00:00Z", type: "warning" as const, title: "Modification r\u00f4le utilisateur", description: "R\u00f4le de Pierre Garcia pass\u00e9 de 'dev' \u00e0 'lead-dev'.", source: "Admin", metadata: { utilisateur: "Pierre Garcia", ancien_role: "dev", nouveau_role: "lead-dev" } },
      { timestamp: "2026-02-03T15:30:00Z", type: "success" as const, title: "Validation budget Q2", description: "Budget Q2 2026 valid\u00e9 : 180k\u20ac.", source: "Finance" },
      { timestamp: "2026-02-03T10:00:00Z", type: "info" as const, title: "R\u00e9union direction hebdo", description: "Points abord\u00e9s : recrutement, roadmap Q1, budget.", source: "Calendar" },
      { timestamp: "2026-02-03T09:00:00Z", type: "info" as const, title: "Connexion", source: "Auth" },
      { timestamp: "2026-02-02T14:00:00Z", type: "info" as const, title: "Revue de code PR #347", description: "Revue et approbation de la PR 'feat: SSO SAML integration'.", source: "GitHub" },
      { timestamp: "2026-02-01T16:30:00Z", type: "success" as const, title: "Publication article blog", description: "Article publi\u00e9 : 'PML v2 - Ce qui change pour les d\u00e9veloppeurs'.", source: "Blog" },
      { timestamp: "2026-02-01T09:00:00Z", type: "info" as const, title: "Connexion", source: "Auth" },
    ],
  } as TimelineData,
};

const auditTrail: DatasetEntry = {
  uiType: "timeline-viewer",
  resourceUri: "ui://mcp-std/timeline-viewer",
  title: "Piste d'audit",
  data: {
    title: "Audit Trail - 5 derniers jours",
    events: [
      { timestamp: "2026-02-06T14:30:00Z", type: "info" as const, title: "API_CALL: GET /api/v2/analytics", source: "m.dupont@casys.fr", metadata: { method: "GET", status: 200, latence_ms: 145 } },
      { timestamp: "2026-02-06T14:25:00Z", type: "info" as const, title: "API_CALL: GET /api/v2/dashboard", source: "m.dupont@casys.fr", metadata: { method: "GET", status: 200, latence_ms: 89 } },
      { timestamp: "2026-02-06T11:30:00Z", type: "warning" as const, title: "PERMISSION: Ajout utilisateur au workspace", source: "m.dupont@casys.fr", metadata: { action: "workspace.add_member", workspace: "Production", utilisateurs_ajoutes: 2 } },
      { timestamp: "2026-02-06T09:00:00Z", type: "info" as const, title: "AUTH: Connexion r\u00e9ussie", source: "m.dupont@casys.fr", metadata: { ip: "92.184.xxx.xxx", mfa: true } },
      { timestamp: "2026-02-05T18:00:00Z", type: "warning" as const, title: "CONFIG: Modification variable d'environnement", source: "j.robert@casys.fr", metadata: { variable: "PLAYGROUND_ENABLED", ancienne_valeur: "false", nouvelle_valeur: "true", env: "staging" } },
      { timestamp: "2026-02-05T16:45:00Z", type: "error" as const, title: "DEPLOY: Rollback automatique d\u00e9clench\u00e9", source: "ci-bot", metadata: { version: "v2.14.2", raison: "health_check_failed", pods_unhealthy: 3 } },
      { timestamp: "2026-02-05T14:30:00Z", type: "info" as const, title: "API_CALL: POST /api/v2/deploy", source: "l.bernard@casys.fr", metadata: { version: "v2.14.2", env: "production", approuve_par: "m.dupont@casys.fr" } },
      { timestamp: "2026-02-05T10:15:00Z", type: "info" as const, title: "SUPPORT: Cr\u00e9ation ticket TK-891", source: "m.dupont@casys.fr", metadata: { client: "Dupont SA", priorite: "Critique" } },
      { timestamp: "2026-02-04T16:00:00Z", type: "info" as const, title: "CRM: Contrat sign\u00e9", source: "m.dupont@casys.fr", metadata: { client: "Savoie Connect", montant_k: 98, type: "annuel" } },
      { timestamp: "2026-02-04T11:00:00Z", type: "info" as const, title: "API_CALL: GET /api/v2/invoices", source: "m.dupont@casys.fr", metadata: { method: "GET", status: 200, resultats: 3 } },
      { timestamp: "2026-02-03T17:00:00Z", type: "warning" as const, title: "PERMISSION: Modification r\u00f4le utilisateur", source: "m.dupont@casys.fr", metadata: { utilisateur: "p.garcia@casys.fr", ancien_role: "dev", nouveau_role: "lead-dev" } },
      { timestamp: "2026-02-03T12:00:00Z", type: "error" as const, title: "AUTH: Tentative de connexion \u00e9chou\u00e9e (3x)", source: "inconnu@external.com", metadata: { ip: "185.234.xxx.xxx", tentatives: 3, bloque: true } },
      { timestamp: "2026-02-03T09:00:00Z", type: "info" as const, title: "AUTH: Connexion r\u00e9ussie", source: "m.dupont@casys.fr", metadata: { ip: "92.184.xxx.xxx", mfa: true } },
      { timestamp: "2026-02-02T14:00:00Z", type: "info" as const, title: "SCM: Approbation PR #347", source: "m.dupont@casys.fr", metadata: { repo: "casys-pml", pr: 347, titre: "feat: SSO SAML integration" } },
      { timestamp: "2026-02-02T10:30:00Z", type: "warning" as const, title: "CONFIG: Rotation cl\u00e9 API", source: "m.andre@casys.fr", metadata: { service: "stripe", raison: "rotation_planifiee" } },
      { timestamp: "2026-02-02T09:00:00Z", type: "info" as const, title: "AUTH: Connexion r\u00e9ussie", source: "m.andre@casys.fr", metadata: { ip: "86.245.xxx.xxx", mfa: true } },
      { timestamp: "2026-02-01T16:30:00Z", type: "info" as const, title: "CMS: Publication article blog", source: "m.dupont@casys.fr", metadata: { slug: "pml-v2-ce-qui-change", statut: "publie" } },
      { timestamp: "2026-02-01T15:00:00Z", type: "info" as const, title: "API_CALL: POST /api/v2/capabilities", source: "l.bernard@casys.fr", metadata: { method: "POST", status: 201, capability: "std:pdf-export" } },
      { timestamp: "2026-02-01T14:00:00Z", type: "warning" as const, title: "QUOTA: Utilisation API proche du seuil", source: "system", metadata: { client: "\u00cele-de-France Services", utilisation_pct: 87, seuil_pct: 90 } },
      { timestamp: "2026-02-01T09:00:00Z", type: "info" as const, title: "AUTH: Connexion r\u00e9ussie", source: "c.petit@casys.fr", metadata: { ip: "78.234.xxx.xxx", mfa: true } },
      { timestamp: "2026-01-31T22:05:00Z", type: "error" as const, title: "INFRA: Redis failover d\u00e9clench\u00e9", source: "redis-sentinel", metadata: { cause: "master_down", failover_ms: 12000 } },
      { timestamp: "2026-01-31T18:00:00Z", type: "info" as const, title: "BACKUP: Sauvegarde quotidienne", source: "backup-cron", metadata: { taille_gb: 23.4, duree_min: 12, statut: "ok" } },
      { timestamp: "2026-01-31T11:00:00Z", type: "info" as const, title: "DEPLOY: v2.13.9 en production", source: "ci-bot", metadata: { commit: "e4c7a89", auteur: "p.garcia@casys.fr" } },
      { timestamp: "2026-01-31T10:00:00Z", type: "info" as const, title: "API_CALL: DELETE /api/v2/cache", source: "f.duval@casys.fr", metadata: { method: "DELETE", status: 204, raison: "purge_cache_catalogue" } },
      { timestamp: "2026-01-30T16:45:00Z", type: "info" as const, title: "CERT: Renouvellement certificat SSL", source: "cert-manager", metadata: { domaine: "*.casys.fr", validite_jours: 90 } },
    ],
  } as TimelineData,
};

// ============================================================================
// RESOURCE-MONITOR DATASETS (4)
// ============================================================================

const infraProd: DatasetEntry = {
  uiType: "resource-monitor",
  resourceUri: "ui://mcp-std/resource-monitor",
  title: "\u00c9tat des serveurs production",
  data: {
    title: "Infrastructure Production",
    timestamp: "2026-02-06T14:30:00Z",
    resources: [
      {
        name: "node-prod-01 (API Gateway)",
        cpu: { percent: 45, cores: 8 },
        memory: { used: 6.2 * GB, limit: 16 * GB, percent: 38.8 },
        network: { rxBytes: 234 * GB, txBytes: 189 * GB, rxRate: 12.5 * MB, txRate: 8.3 * MB },
        blockIO: { read: 45 * GB, write: 78 * GB },
      },
      {
        name: "node-prod-02 (Worker Pool)",
        cpu: { percent: 72, cores: 16 },
        memory: { used: 24.5 * GB, limit: 32 * GB, percent: 76.6 },
        network: { rxBytes: 156 * GB, txBytes: 89 * GB, rxRate: 5.6 * MB, txRate: 3.2 * MB },
        blockIO: { read: 123 * GB, write: 234 * GB },
      },
      {
        name: "node-prod-03 (PostgreSQL Primary)",
        cpu: { percent: 38, cores: 8 },
        memory: { used: 12.8 * GB, limit: 16 * GB, percent: 80.0 },
        network: { rxBytes: 89 * GB, txBytes: 67 * GB, rxRate: 3.4 * MB, txRate: 2.1 * MB },
        blockIO: { read: 456 * GB, write: 234 * GB },
      },
      {
        name: "node-prod-04 (Redis Cluster)",
        cpu: { percent: 15, cores: 4 },
        memory: { used: 5.6 * GB, limit: 8 * GB, percent: 70.0 },
        network: { rxBytes: 345 * GB, txBytes: 345 * GB, rxRate: 45.2 * MB, txRate: 44.8 * MB },
      },
      {
        name: "node-prod-05 (CDN Edge)",
        cpu: { percent: 22, cores: 4 },
        memory: { used: 2.1 * GB, limit: 8 * GB, percent: 26.3 },
        network: { rxBytes: 1.2 * 1024 * GB, txBytes: 2.8 * 1024 * GB, rxRate: 89 * MB, txRate: 156 * MB },
      },
    ],
  } as MonitorData,
};

const infraDev: DatasetEntry = {
  uiType: "resource-monitor",
  resourceUri: "ui://mcp-std/resource-monitor",
  title: "\u00c9tat des serveurs dev/staging",
  data: {
    title: "Infrastructure Dev/Staging",
    timestamp: "2026-02-06T14:30:00Z",
    resources: [
      {
        name: "dev-server-01 (All-in-one)",
        cpu: { percent: 55, cores: 4 },
        memory: { used: 5.8 * GB, limit: 8 * GB, percent: 72.5 },
        network: { rxBytes: 12 * GB, txBytes: 8 * GB, rxRate: 1.2 * MB, txRate: 0.8 * MB },
        blockIO: { read: 23 * GB, write: 45 * GB },
      },
      {
        name: "staging-server-01 (API + Web)",
        cpu: { percent: 32, cores: 4 },
        memory: { used: 3.4 * GB, limit: 8 * GB, percent: 42.5 },
        network: { rxBytes: 5.6 * GB, txBytes: 3.2 * GB, rxRate: 0.5 * MB, txRate: 0.3 * MB },
        blockIO: { read: 12 * GB, write: 18 * GB },
      },
      {
        name: "ci-runner-01 (GitLab Runner)",
        cpu: { percent: 91, cores: 8 },
        memory: { used: 13.2 * GB, limit: 16 * GB, percent: 82.5 },
        network: { rxBytes: 67 * GB, txBytes: 23 * GB, rxRate: 34 * MB, txRate: 12 * MB },
        blockIO: { read: 234 * GB, write: 189 * GB },
      },
    ],
  } as MonitorData,
};

const containers: DatasetEntry = {
  uiType: "resource-monitor",
  resourceUri: "ui://mcp-std/resource-monitor",
  title: "Containers Docker",
  data: {
    title: "Containers Production (k8s)",
    timestamp: "2026-02-06T14:30:00Z",
    resources: [
      {
        name: "casys-api-7f8d9c-x2k4p",
        cpu: { percent: 34, cores: 2 },
        memory: { used: 512 * MB, limit: 1 * GB, percent: 50.0 },
        network: { rxBytes: 23 * GB, txBytes: 18 * GB, rxRate: 2.3 * MB, txRate: 1.8 * MB },
      },
      {
        name: "casys-api-7f8d9c-m9n1q",
        cpu: { percent: 41, cores: 2 },
        memory: { used: 623 * MB, limit: 1 * GB, percent: 60.8 },
        network: { rxBytes: 25 * GB, txBytes: 20 * GB, rxRate: 2.5 * MB, txRate: 2.0 * MB },
      },
      {
        name: "casys-dashboard-a3b5c7-j4k6l",
        cpu: { percent: 12, cores: 1 },
        memory: { used: 256 * MB, limit: 512 * MB, percent: 50.0 },
        network: { rxBytes: 45 * GB, txBytes: 89 * GB, rxRate: 4.5 * MB, txRate: 8.9 * MB },
      },
      {
        name: "casys-worker-d8e2f4-p7q9r",
        cpu: { percent: 78, cores: 4 },
        memory: { used: 3.2 * GB, limit: 4 * GB, percent: 80.0 },
        network: { rxBytes: 12 * GB, txBytes: 5 * GB, rxRate: 1.2 * MB, txRate: 0.5 * MB },
      },
      {
        name: "casys-worker-d8e2f4-s1t3u",
        cpu: { percent: 65, cores: 4 },
        memory: { used: 2.8 * GB, limit: 4 * GB, percent: 70.0 },
        network: { rxBytes: 10 * GB, txBytes: 4.2 * GB, rxRate: 1.0 * MB, txRate: 0.4 * MB },
      },
      {
        name: "redis-sentinel-0",
        cpu: { percent: 8, cores: 1 },
        memory: { used: 2.8 * GB, limit: 4 * GB, percent: 70.0 },
        network: { rxBytes: 156 * GB, txBytes: 156 * GB, rxRate: 23 * MB, txRate: 23 * MB },
      },
      {
        name: "postgres-primary-0",
        cpu: { percent: 42, cores: 4 },
        memory: { used: 6.4 * GB, limit: 8 * GB, percent: 80.0 },
        network: { rxBytes: 45 * GB, txBytes: 34 * GB, rxRate: 3.4 * MB, txRate: 2.6 * MB },
        blockIO: { read: 234 * GB, write: 156 * GB },
      },
      {
        name: "postgres-replica-0",
        cpu: { percent: 28, cores: 4 },
        memory: { used: 5.1 * GB, limit: 8 * GB, percent: 63.8 },
        network: { rxBytes: 34 * GB, txBytes: 12 * GB, rxRate: 2.6 * MB, txRate: 0.9 * MB },
        blockIO: { read: 189 * GB, write: 67 * GB },
      },
    ],
  } as MonitorData,
};

const databases: DatasetEntry = {
  uiType: "resource-monitor",
  resourceUri: "ui://mcp-std/resource-monitor",
  title: "\u00c9tat des bases de donn\u00e9es",
  data: {
    title: "Bases de donn\u00e9es",
    timestamp: "2026-02-06T14:30:00Z",
    resources: [
      {
        name: "PostgreSQL Primary (casys_prod)",
        cpu: { percent: 42, cores: 8 },
        memory: { used: 12.8 * GB, limit: 16 * GB, percent: 80.0 },
        network: { rxBytes: 89 * GB, txBytes: 67 * GB, rxRate: 3.4 * MB, txRate: 2.1 * MB },
        blockIO: { read: 456 * GB, write: 234 * GB },
      },
      {
        name: "PostgreSQL Replica (casys_replica)",
        cpu: { percent: 28, cores: 8 },
        memory: { used: 10.2 * GB, limit: 16 * GB, percent: 63.8 },
        network: { rxBytes: 67 * GB, txBytes: 23 * GB, rxRate: 2.6 * MB, txRate: 0.9 * MB },
        blockIO: { read: 345 * GB, write: 89 * GB },
      },
      {
        name: "Redis Cluster (cache + sessions)",
        cpu: { percent: 15, cores: 4 },
        memory: { used: 5.6 * GB, limit: 8 * GB, percent: 70.0 },
        network: { rxBytes: 345 * GB, txBytes: 345 * GB, rxRate: 45.2 * MB, txRate: 44.8 * MB },
      },
      {
        name: "PGlite Dev (embedded)",
        cpu: { percent: 5, cores: 1 },
        memory: { used: 128 * MB, limit: 512 * MB, percent: 25.0 },
        network: { rxBytes: 0, txBytes: 0 },
        blockIO: { read: 2 * GB, write: 1 * GB },
      },
    ],
  } as MonitorData,
};

// ============================================================================
// Dataset Registry
// ============================================================================

const DATASETS: Record<string, DatasetEntry> = {
  // table-viewer (8)
  "sales-monthly": salesMonthly,
  "sales-products": salesProducts,
  "employees": employees,
  "inventory": inventory,
  "customers": customers,
  "orders-recent": ordersRecent,
  "support-tickets": supportTickets,
  "marketing-campaigns": marketingCampaigns,
  // metrics-panel (6)
  "kpi-sales": kpiSales,
  "kpi-ops": kpiOps,
  "kpi-hr": kpiHr,
  "kpi-finance": kpiFinance,
  "kpi-marketing": kpiMarketing,
  "kpi-product": kpiProduct,
  // timeline-viewer (5)
  "deploy-history": deployHistory,
  "incident-log": incidentLog,
  "project-milestones": projectMilestones,
  "user-activity": userActivity,
  "audit-trail": auditTrail,
  // resource-monitor (4)
  "infra-prod": infraProd,
  "infra-dev": infraDev,
  "containers": containers,
  "databases": databases,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a dataset by ID. Returns undefined if not found.
 */
export function getDataset(id: string): DatasetEntry | undefined {
  return DATASETS[id];
}

/**
 * List all available dataset IDs.
 */
export function listDatasetIds(): string[] {
  return Object.keys(DATASETS);
}

/**
 * List dataset IDs grouped by UI type.
 */
export function listDatasetsByType(): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const [id, entry] of Object.entries(DATASETS)) {
    if (!grouped[entry.uiType]) {
      grouped[entry.uiType] = [];
    }
    grouped[entry.uiType].push(id);
  }
  return grouped;
}
