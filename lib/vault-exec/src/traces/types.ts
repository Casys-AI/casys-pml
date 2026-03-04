export interface ExecutionTrace {
  intent?: string;
  intentEmbedding?: number[];
  targetNote: string;
  path: string[];
  success: boolean;
  synthetic: boolean;
}
