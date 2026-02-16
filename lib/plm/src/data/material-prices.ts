/**
 * Material price database for PLM costing tools
 *
 * Prices are average EUR values for 2025-2026, sourced from LME, MatWeb,
 * supplier catalogs, and industry estimates. Prices reflect raw material
 * cost per kg (or per unit for discrete items like fasteners/electronics).
 *
 * @module lib/plm/data/material-prices
 */

// ============================================================================
// Types
// ============================================================================

export type MaterialCategory =
  | "ferrous"
  | "aluminum"
  | "copper"
  | "titanium"
  | "nickel"
  | "stainless"
  | "plastic"
  | "composite"
  | "elastomer"
  | "electronic"
  | "fastener";

export interface MaterialPrice {
  /** Unique identifier (lowercase, hyphenated) */
  id: string;
  /** Display name */
  name: string;
  /** Material category */
  category: MaterialCategory;
  /** Density in kg/m3 */
  density_kg_m3: number;
  /** Price per kg in EUR (or per unit for electronics/fasteners) */
  price_per_kg: number;
  /** Machining difficulty multiplier (1.0 = baseline, higher = harder/costlier) */
  machining_factor: number;
  /** Price source */
  source: string;
  /** Additional notes */
  notes?: string;
}

// ============================================================================
// Material database
// ============================================================================

export const MATERIALS: MaterialPrice[] = [
  // --------------------------------------------------------------------------
  // Ferrous steels
  // --------------------------------------------------------------------------
  {
    id: "aisi-1045",
    name: "AISI 1045 Carbon Steel",
    category: "ferrous",
    density_kg_m3: 7850,
    price_per_kg: 1.1,
    machining_factor: 1.2,
    source: "Steel benchmarks avg 2025",
    notes: "Medium carbon, general purpose structural steel",
  },
  {
    id: "aisi-4140",
    name: "AISI 4140 Alloy Steel",
    category: "ferrous",
    density_kg_m3: 7850,
    price_per_kg: 1.5,
    machining_factor: 1.5,
    source: "Steel benchmarks avg 2025",
    notes: "Chromoly, quenched & tempered, shafts and gears",
  },
  {
    id: "42crmo4",
    name: "42CrMo4 (EN 1.7225)",
    category: "ferrous",
    density_kg_m3: 7850,
    price_per_kg: 1.6,
    machining_factor: 1.5,
    source: "European steel distributors avg 2025",
    notes: "Equivalent to AISI 4140, common in EU engineering",
  },
  {
    id: "s355j2",
    name: "S355J2 Structural Steel",
    category: "ferrous",
    density_kg_m3: 7850,
    price_per_kg: 0.9,
    machining_factor: 1.1,
    source: "Steel benchmarks avg 2025",
    notes: "Structural grade, weldable, frames and chassis",
  },
  {
    id: "aisi-d2",
    name: "AISI D2 Tool Steel",
    category: "ferrous",
    density_kg_m3: 7700,
    price_per_kg: 4.5,
    machining_factor: 2.5,
    source: "Tool steel suppliers 2025",
    notes: "High carbon high chromium, dies and cutting tools",
  },

  // --------------------------------------------------------------------------
  // Stainless steels
  // --------------------------------------------------------------------------
  {
    id: "aisi-304",
    name: "AISI 304 Stainless Steel",
    category: "stainless",
    density_kg_m3: 8000,
    price_per_kg: 3.8,
    machining_factor: 1.6,
    source: "LME Ni + alloy surcharge avg 2025",
    notes: "18/8 austenitic, general purpose stainless",
  },
  {
    id: "aisi-316l",
    name: "AISI 316L Stainless Steel",
    category: "stainless",
    density_kg_m3: 8000,
    price_per_kg: 5.2,
    machining_factor: 1.7,
    source: "LME Ni + Mo surcharge avg 2025",
    notes: "Mo-bearing austenitic, marine and chemical environments",
  },
  {
    id: "17-4ph",
    name: "17-4PH Stainless Steel",
    category: "stainless",
    density_kg_m3: 7780,
    price_per_kg: 7.5,
    machining_factor: 1.8,
    source: "Specialty steel suppliers 2025",
    notes: "Precipitation hardened, aerospace and medical",
  },
  {
    id: "duplex-2205",
    name: "Duplex 2205 Stainless Steel",
    category: "stainless",
    density_kg_m3: 7800,
    price_per_kg: 6.0,
    machining_factor: 1.8,
    source: "Specialty steel suppliers 2025",
    notes: "Austenitic-ferritic duplex, high strength + corrosion resistance",
  },

  // --------------------------------------------------------------------------
  // Aluminum alloys
  // --------------------------------------------------------------------------
  {
    id: "al6061-t6",
    name: "Aluminum 6061-T6",
    category: "aluminum",
    density_kg_m3: 2700,
    price_per_kg: 3.5,
    machining_factor: 1.3,
    source: "LME Al + alloy premium avg 2025",
    notes: "Most common structural aluminum, extrusion and machining",
  },
  {
    id: "al7075-t6",
    name: "Aluminum 7075-T6",
    category: "aluminum",
    density_kg_m3: 2810,
    price_per_kg: 6.0,
    machining_factor: 1.4,
    source: "LME Al + aerospace premium 2025",
    notes: "High strength aerospace aluminum, Zn-Mg-Cu",
  },
  {
    id: "al2024-t3",
    name: "Aluminum 2024-T3",
    category: "aluminum",
    density_kg_m3: 2780,
    price_per_kg: 5.5,
    machining_factor: 1.4,
    source: "LME Al + aerospace premium 2025",
    notes: "High fatigue strength, aircraft skins and structures",
  },
  {
    id: "al5052-h32",
    name: "Aluminum 5052-H32",
    category: "aluminum",
    density_kg_m3: 2680,
    price_per_kg: 3.8,
    machining_factor: 1.3,
    source: "LME Al + alloy premium avg 2025",
    notes: "Marine grade, sheet metal and formed parts",
  },
  {
    id: "al6082-t6",
    name: "Aluminum 6082-T6",
    category: "aluminum",
    density_kg_m3: 2710,
    price_per_kg: 3.6,
    machining_factor: 1.3,
    source: "LME Al + alloy premium avg 2025",
    notes: "European structural alloy, higher strength than 6061",
  },

  // --------------------------------------------------------------------------
  // Copper alloys
  // --------------------------------------------------------------------------
  {
    id: "cu-etp",
    name: "Copper ETP (C11000)",
    category: "copper",
    density_kg_m3: 8940,
    price_per_kg: 8.5,
    machining_factor: 1.4,
    source: "LME Cu avg 2025",
    notes: "Electrolytic tough pitch, 99.9% Cu, electrical conductors",
  },
  {
    id: "cuzn37",
    name: "Brass CuZn37 (C27200)",
    category: "copper",
    density_kg_m3: 8440,
    price_per_kg: 6.5,
    machining_factor: 1.2,
    source: "LME Cu + Zn avg 2025",
    notes: "Common brass, fittings and decorative parts",
  },
  {
    id: "cuzn39pb3",
    name: "Brass CuZn39Pb3 (C38500)",
    category: "copper",
    density_kg_m3: 8470,
    price_per_kg: 6.8,
    machining_factor: 1.0,
    source: "LME Cu + Zn avg 2025",
    notes: "Free-machining brass, excellent machinability",
  },
  {
    id: "cube2",
    name: "Beryllium Copper CuBe2 (C17200)",
    category: "copper",
    density_kg_m3: 8250,
    price_per_kg: 35.0,
    machining_factor: 1.6,
    source: "Specialty copper suppliers 2025",
    notes: "Spring contacts, non-sparking tools, high cost due to Be content",
  },
  {
    id: "cusn8",
    name: "Phosphor Bronze CuSn8 (C52100)",
    category: "copper",
    density_kg_m3: 8800,
    price_per_kg: 12.0,
    machining_factor: 1.4,
    source: "LME Cu + Sn avg 2025",
    notes: "Springs, bearings, electrical connectors",
  },

  // --------------------------------------------------------------------------
  // Titanium alloys
  // --------------------------------------------------------------------------
  {
    id: "ti-6al-4v",
    name: "Titanium Ti-6Al-4V (Grade 5)",
    category: "titanium",
    density_kg_m3: 4430,
    price_per_kg: 20.0,
    machining_factor: 3.0,
    source: "Titanium mill products avg 2025 (bar stock)",
    notes: "Alpha-beta alloy, aerospace standard, difficult to machine",
  },
  {
    id: "ti-grade2",
    name: "Titanium Grade 2 CP",
    category: "titanium",
    density_kg_m3: 4510,
    price_per_kg: 13.5,
    machining_factor: 2.5,
    source: "Titanium mill products avg 2025 (bar stock)",
    notes: "Commercially pure, chemical processing and marine",
  },
  {
    id: "ti-6al-2sn-4zr-2mo",
    name: "Titanium Ti-6Al-2Sn-4Zr-2Mo",
    category: "titanium",
    density_kg_m3: 4540,
    price_per_kg: 35.0,
    machining_factor: 3.2,
    source: "Aerospace titanium suppliers 2025",
    notes: "High-temp aerospace alloy, jet engine components",
  },

  // --------------------------------------------------------------------------
  // Nickel superalloys
  // --------------------------------------------------------------------------
  {
    id: "inconel-718",
    name: "Inconel 718",
    category: "nickel",
    density_kg_m3: 8190,
    price_per_kg: 55.0,
    machining_factor: 3.5,
    source: "Special Metals / superalloy distributors 2025",
    notes: "Ni-Cr precipitation hardened, turbine discs and fasteners",
  },
  {
    id: "inconel-625",
    name: "Inconel 625",
    category: "nickel",
    density_kg_m3: 8440,
    price_per_kg: 48.0,
    machining_factor: 3.2,
    source: "Special Metals / superalloy distributors 2025",
    notes: "Solid-solution strengthened, marine and chemical processing",
  },
  {
    id: "hastelloy-c276",
    name: "Hastelloy C-276",
    category: "nickel",
    density_kg_m3: 8890,
    price_per_kg: 60.0,
    machining_factor: 3.5,
    source: "Haynes International / distributors 2025",
    notes: "Extreme corrosion resistance, chemical and pollution control",
  },
  {
    id: "monel-400",
    name: "Monel 400",
    category: "nickel",
    density_kg_m3: 8800,
    price_per_kg: 28.0,
    machining_factor: 2.2,
    source: "Special Metals distributors 2025",
    notes: "Ni-Cu alloy, marine valves, pump shafts",
  },

  // --------------------------------------------------------------------------
  // Engineering plastics
  // --------------------------------------------------------------------------
  {
    id: "abs",
    name: "ABS (Acrylonitrile Butadiene Styrene)",
    category: "plastic",
    density_kg_m3: 1050,
    price_per_kg: 1.8,
    machining_factor: 1.0,
    source: "ICIS resin pricing avg 2025",
    notes: "Injection molding standard, enclosures and housings",
  },
  {
    id: "pom",
    name: "POM / Delrin (Polyoxymethylene)",
    category: "plastic",
    density_kg_m3: 1410,
    price_per_kg: 3.0,
    machining_factor: 1.1,
    source: "DuPont / ICIS resin pricing 2025",
    notes: "Excellent dimensional stability, gears and bushings",
  },
  {
    id: "peek",
    name: "PEEK (Polyether Ether Ketone)",
    category: "plastic",
    density_kg_m3: 1300,
    price_per_kg: 90.0,
    machining_factor: 1.8,
    source: "Victrex / specialty resin pricing 2025",
    notes: "High-performance thermoplastic, aerospace and medical implants",
  },
  {
    id: "pa6",
    name: "PA6 (Nylon 6)",
    category: "plastic",
    density_kg_m3: 1140,
    price_per_kg: 2.5,
    machining_factor: 1.1,
    source: "ICIS resin pricing avg 2025",
    notes: "General purpose nylon, bearings, slides, wear parts",
  },
  {
    id: "pa66",
    name: "PA66 (Nylon 66)",
    category: "plastic",
    density_kg_m3: 1150,
    price_per_kg: 3.5,
    machining_factor: 1.1,
    source: "Resin pricing indices avg 2025",
    notes: "Higher temp than PA6, automotive under-hood components",
  },
  {
    id: "pps",
    name: "PPS (Polyphenylene Sulfide)",
    category: "plastic",
    density_kg_m3: 1350,
    price_per_kg: 18.0,
    machining_factor: 1.3,
    source: "ICIS specialty resin pricing 2025",
    notes: "Chemical resistant, high temp, electrical connectors",
  },
  {
    id: "ptfe",
    name: "PTFE (Teflon)",
    category: "plastic",
    density_kg_m3: 2170,
    price_per_kg: 15.0,
    machining_factor: 1.2,
    source: "Fluoropolymer suppliers 2025",
    notes: "Low friction, chemical inert, seals and bearings",
  },
  {
    id: "pc",
    name: "PC (Polycarbonate)",
    category: "plastic",
    density_kg_m3: 1200,
    price_per_kg: 3.8,
    machining_factor: 1.1,
    source: "Resin pricing indices avg 2025",
    notes: "Transparent, impact resistant, lenses and guards",
  },
  {
    id: "pp",
    name: "PP (Polypropylene)",
    category: "plastic",
    density_kg_m3: 905,
    price_per_kg: 1.5,
    machining_factor: 1.0,
    source: "Commodity resin pricing 2025",
    notes: "Lightweight, chemical resistant, packaging and tanks",
  },
  {
    id: "pe-hd",
    name: "PE-HD (High Density Polyethylene)",
    category: "plastic",
    density_kg_m3: 955,
    price_per_kg: 1.4,
    machining_factor: 1.0,
    source: "Commodity resin pricing 2025",
    notes: "Pipe, tanks, wear strips",
  },
  {
    id: "pei-ultem",
    name: "PEI Ultem",
    category: "plastic",
    density_kg_m3: 1270,
    price_per_kg: 45.0,
    machining_factor: 1.5,
    source: "SABIC / specialty resin pricing 2025",
    notes: "High temp amorphous, aerospace interiors, sterilizable",
  },

  // --------------------------------------------------------------------------
  // Composites
  // --------------------------------------------------------------------------
  {
    id: "cfrp-ud",
    name: "CFRP Unidirectional (Carbon/Epoxy UD)",
    category: "composite",
    density_kg_m3: 1550,
    price_per_kg: 40.0,
    machining_factor: 2.0,
    source: "Composite materials suppliers avg 2025",
    notes: "Unidirectional prepreg, primary aerospace structures",
  },
  {
    id: "cfrp-woven",
    name: "CFRP Woven (Carbon/Epoxy Fabric)",
    category: "composite",
    density_kg_m3: 1550,
    price_per_kg: 48.0,
    machining_factor: 2.0,
    source: "Composite materials suppliers avg 2025",
    notes: "Woven fabric prepreg, skins and fairings",
  },
  {
    id: "gfrp",
    name: "GFRP (Glass/Epoxy)",
    category: "composite",
    density_kg_m3: 1900,
    price_per_kg: 10.0,
    machining_factor: 1.5,
    source: "Composite materials suppliers avg 2025",
    notes: "E-glass / epoxy, boats, wind turbine blades, enclosures",
  },
  {
    id: "kevlar-epoxy",
    name: "Kevlar/Epoxy (Aramid Composite)",
    category: "composite",
    density_kg_m3: 1380,
    price_per_kg: 65.0,
    machining_factor: 2.2,
    source: "DuPont / composite suppliers 2025",
    notes: "Ballistic protection, racing, vibration damping",
  },

  // --------------------------------------------------------------------------
  // Elastomers
  // --------------------------------------------------------------------------
  {
    id: "nbr",
    name: "NBR (Nitrile Rubber)",
    category: "elastomer",
    density_kg_m3: 1000,
    price_per_kg: 4.0,
    machining_factor: 1.0,
    source: "Rubber suppliers avg 2025",
    notes: "Oil resistant seals and O-rings, -40 to +120C",
  },
  {
    id: "epdm",
    name: "EPDM (Ethylene Propylene Diene)",
    category: "elastomer",
    density_kg_m3: 860,
    price_per_kg: 3.5,
    machining_factor: 1.0,
    source: "Rubber suppliers avg 2025",
    notes: "Weather and ozone resistant, outdoor seals and gaskets",
  },
  {
    id: "silicone",
    name: "Silicone Rubber (VMQ)",
    category: "elastomer",
    density_kg_m3: 1100,
    price_per_kg: 12.0,
    machining_factor: 1.0,
    source: "Rubber suppliers avg 2025",
    notes: "Wide temp range -60 to +230C, food and medical grade",
  },
  {
    id: "fkm-viton",
    name: "FKM / Viton (Fluoroelastomer)",
    category: "elastomer",
    density_kg_m3: 1800,
    price_per_kg: 45.0,
    machining_factor: 1.0,
    source: "Chemours / fluoroelastomer suppliers 2025",
    notes: "Chemical and high temp resistance -20 to +250C, aerospace seals",
  },

  // --------------------------------------------------------------------------
  // Electronics (price per unit, not per kg)
  // --------------------------------------------------------------------------
  {
    id: "pcb-fr4",
    name: "PCB FR4 (per unit, 100x100mm 2-layer)",
    category: "electronic",
    density_kg_m3: 1850,
    price_per_kg: 10.0,
    machining_factor: 1.0,
    source: "PCB manufacturers avg 2025",
    notes: "Price is per unit (100x100mm board), 1.6mm 2-layer, batch qty 100+",
  },
  {
    id: "pcb-fr4-4l",
    name: "PCB FR4 (per unit, 100x100mm 4-layer)",
    category: "electronic",
    density_kg_m3: 1850,
    price_per_kg: 12.0,
    machining_factor: 1.0,
    source: "PCB manufacturers avg 2025",
    notes: "Price is per unit (100x100mm board), 1.6mm 4-layer, batch qty 100+",
  },
  {
    id: "connector-generic",
    name: "Connector (generic, per unit)",
    category: "electronic",
    density_kg_m3: 2000,
    price_per_kg: 2.5,
    machining_factor: 1.0,
    source: "Mouser/Digi-Key avg 2025",
    notes: "Price is per unit, generic JST/Molex 2-10 pin connector",
  },
  {
    id: "sensor-generic",
    name: "Sensor module (generic, per unit)",
    category: "electronic",
    density_kg_m3: 2500,
    price_per_kg: 15.0,
    machining_factor: 1.0,
    source: "Mouser/Digi-Key avg 2025",
    notes: "Price is per unit, generic temp/pressure/accel sensor module",
  },

  // --------------------------------------------------------------------------
  // Fasteners (price per unit)
  // --------------------------------------------------------------------------
  {
    id: "screw-m3-ss",
    name: "Screw M3 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.04,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 912 socket head cap screw, A2-70",
  },
  {
    id: "screw-m4-ss",
    name: "Screw M4 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.05,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 912 socket head cap screw, A2-70",
  },
  {
    id: "screw-m5-ss",
    name: "Screw M5 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.06,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 912 socket head cap screw, A2-70",
  },
  {
    id: "screw-m6-ss",
    name: "Screw M6 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.08,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 912 socket head cap screw, A2-70",
  },
  {
    id: "screw-m8-ss",
    name: "Screw M8 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.12,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 912 socket head cap screw, A2-70",
  },
  {
    id: "screw-m10-ss",
    name: "Screw M10 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.18,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 912 socket head cap screw, A2-70",
  },
  {
    id: "screw-m12-ss",
    name: "Screw M12 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.25,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 912 socket head cap screw, A2-70",
  },
  {
    id: "insert-m3",
    name: "Threaded Insert M3 Brass (per unit)",
    category: "fastener",
    density_kg_m3: 8500,
    price_per_kg: 0.15,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, heat-set or press-fit brass insert for plastics",
  },
  {
    id: "insert-m4",
    name: "Threaded Insert M4 Brass (per unit)",
    category: "fastener",
    density_kg_m3: 8500,
    price_per_kg: 0.18,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, heat-set or press-fit brass insert for plastics",
  },
  {
    id: "insert-m5",
    name: "Threaded Insert M5 Brass (per unit)",
    category: "fastener",
    density_kg_m3: 8500,
    price_per_kg: 0.22,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, heat-set or press-fit brass insert for plastics",
  },
  {
    id: "washer-m5-ss",
    name: "Washer M5 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.02,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 125 flat washer, A2",
  },
  {
    id: "washer-m8-ss",
    name: "Washer M8 Stainless Steel (per unit)",
    category: "fastener",
    density_kg_m3: 8000,
    price_per_kg: 0.03,
    machining_factor: 1.0,
    source: "Fastener distributors 2025",
    notes: "Price is per unit, DIN 125 flat washer, A2",
  },
];

// ============================================================================
// Lookup helpers
// ============================================================================

/** Get a material by exact ID */
export function getMaterialPrice(id: string): MaterialPrice | undefined {
  return MATERIALS.find((m) => m.id === id);
}

/** Get all materials in a given category */
export function getMaterialsByCategory(category: MaterialCategory): MaterialPrice[] {
  return MATERIALS.filter((m) => m.category === category);
}

/** Fuzzy lookup by name (case-insensitive substring match) */
export function lookupMaterialByName(query: string): MaterialPrice[] {
  const q = query.toLowerCase();
  return MATERIALS.filter(
    (m) => m.name.toLowerCase().includes(q) || m.id.includes(q),
  );
}
