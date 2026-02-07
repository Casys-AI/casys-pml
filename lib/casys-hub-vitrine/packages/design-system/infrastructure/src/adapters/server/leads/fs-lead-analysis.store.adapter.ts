import fs from 'node:fs/promises';
import path from 'node:path';

import type { LeadAnalysisStorePort, LeadSnapshot, LeadUnlockRecord, SaveLeadSnapshotParams } from '@casys/application';

function sanitizeDomain(domain: string): string {
  return (domain || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class FsLeadAnalysisStoreAdapter implements LeadAnalysisStorePort {
  private readonly leadsDir: string;
  private readonly unlocksFile: string;

  constructor(private readonly baseDir: string) {
    if (!baseDir || typeof baseDir !== 'string') {
      throw new Error('[FsLeadAnalysisStoreAdapter] baseDir requis');
    }
    this.leadsDir = path.resolve(baseDir, 'data/leads');
    this.unlocksFile = path.resolve(this.leadsDir, '_unlocks.json');
  }

  private async ensureDirs() {
    await fs.mkdir(this.leadsDir, { recursive: true });
  }

  private fileForDomain(domain: string): string {
    const name = sanitizeDomain(domain);
    return path.resolve(this.leadsDir, `${name}.json`);
  }

  async getByDomain(domain: string): Promise<LeadSnapshot | null> {
    try {
      await this.ensureDirs();
      const file = this.fileForDomain(domain);
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw) as LeadSnapshot;
    } catch (e) {
      return null;
    }
  }

  async getById(id: string): Promise<LeadSnapshot | null> {
    try {
      await this.ensureDirs();
      const files = await fs.readdir(this.leadsDir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const raw = await fs.readFile(path.resolve(this.leadsDir, f), 'utf8');
        const snap = JSON.parse(raw) as LeadSnapshot;
        if (snap.id === id) return snap;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async save(params: SaveLeadSnapshotParams): Promise<void> {
    await this.ensureDirs();
    const snap = params.snapshot;
    if (!snap || !snap.domain) throw new Error('[FsLeadAnalysisStoreAdapter] snapshot invalide');
    const file = this.fileForDomain(snap.domain);
    const content = JSON.stringify(snap, null, 2);
    await fs.writeFile(file, content, 'utf8');
  }

  private async readUnlocks(): Promise<Record<string, LeadUnlockRecord[]>> {
    try {
      await this.ensureDirs();
      const raw = await fs.readFile(this.unlocksFile, 'utf8');
      const data = JSON.parse(raw) as Record<string, LeadUnlockRecord[]>;
      return data ?? {};
    } catch {
      return {};
    }
  }

  private async writeUnlocks(map: Record<string, LeadUnlockRecord[]>): Promise<void> {
    await this.ensureDirs();
    await fs.writeFile(this.unlocksFile, JSON.stringify(map, null, 2), 'utf8');
  }

  async upsertUnlock(record: LeadUnlockRecord): Promise<void> {
    const map = await this.readUnlocks();
    const key = sanitizeDomain(record.domain);
    const list = map[key] ?? [];
    const idx = list.findIndex(r => r.email.toLowerCase() === record.email.toLowerCase());
    if (idx >= 0) list[idx] = record; else list.push(record);
    map[key] = list;
    await this.writeUnlocks(map);
  }

  async findUnlockToken(domain: string, email: string): Promise<string | null> {
    const map = await this.readUnlocks();
    const key = sanitizeDomain(domain);
    const list = map[key] ?? [];
    const rec = list.find(r => r.email.toLowerCase() === email.toLowerCase());
    return rec?.token ?? null;
  }
}
