export type VirtualEdgeStatus = "candidate" | "promoted" | "rejected";

export interface VirtualEdgeRow {
  source: string;
  target: string;
  score: number;
  support: number;
  rejects: number;
  status: VirtualEdgeStatus;
  promotedAt?: string;
  updatedAt: string;
}

export interface VirtualEdgeUpdate {
  source: string;
  target: string;
  scoreDelta: number;
  reason:
    | "selected_path"
    | "rejected_candidate"
    | "execution_success"
    | "execution_failure";
}
