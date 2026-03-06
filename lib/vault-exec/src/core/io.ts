export interface VaultWriter {
  writeNote(path: string, content: string): Promise<void>;
}
