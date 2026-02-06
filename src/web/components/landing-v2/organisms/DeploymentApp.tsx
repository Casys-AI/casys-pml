/**
 * DeploymentApp - L'application de déploiement qui apparaît
 *
 * Une vraie UI avec header, métriques, progress et actions.
 * C'est ça "l'application qui apparaît" dans le chat.
 *
 * @module web/components/landing-v2/organisms/DeploymentApp
 */

import { AppCard } from "../atoms/AppCard.tsx";
import { ProgressBar } from "../atoms/ProgressBar.tsx";
import { AppHeader } from "../molecules/AppHeader.tsx";
import { MetricsRow } from "../molecules/MetricsRow.tsx";
import { ActionBar } from "../molecules/ActionBar.tsx";

interface DeploymentAppProps {
  version: string;
  podsStatus: string;
  progress: number;
  isComplete?: boolean;
  activeButton?: "rollback" | "continue" | null;
  class?: string;
}

export function DeploymentApp({
  version,
  podsStatus,
  progress,
  isComplete = false,
  activeButton = null,
  class: className = "",
}: DeploymentAppProps) {
  const metrics = [
    { value: version, label: "current version", variant: "accent" as const },
    { value: podsStatus, label: "pod status", variant: "success" as const },
  ];

  const actions = [
    { label: "Rollback", variant: "danger" as const, active: activeButton === "rollback" },
    { label: "Continue", variant: "primary" as const, active: activeButton === "continue" },
  ];

  return (
    <AppCard class={className}>
      <AppHeader
        icon="🚀"
        title="Deployment Dashboard"
        status={isComplete ? "healthy" : "pending"}
        statusLabel={isComplete ? "Deployed" : "In Progress"}
      />

      <div class="p-4 space-y-4">
        {/* Metrics */}
        <MetricsRow metrics={metrics} />

        {/* Progress */}
        <ProgressBar
          progress={progress}
          label="Rolling out to production"
          variant={isComplete ? "success" : "default"}
        />

        {/* Actions */}
        <ActionBar actions={actions} size="sm" />
      </div>
    </AppCard>
  );
}
