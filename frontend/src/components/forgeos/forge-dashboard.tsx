"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIEmployee } from "@/lib/constants";
import { AgentReasoningDrawer } from "@/components/forgeos/agent-reasoning-drawer";
import { AIEmployeesSidebar } from "@/components/forgeos/ai-employees-sidebar";
import { ArtifactCenter } from "@/components/forgeos/artifact-center";
import { BlueprintGrid } from "@/components/forgeos/blueprint-grid";
import { DeploymentSequence, useDeploymentSequence } from "@/components/forgeos/deployment-sequence";
import { LivePreviewPanel } from "@/components/forgeos/live-preview-panel";
import { DeliverablesPanel } from "@/components/forgeos/deliverables-panel";
import { HeroSection } from "@/components/forgeos/hero-section";
import { DemoModeBadge, FallbackNotice } from "@/components/forgeos/fallback-notice";
import { IntelligencePanel } from "@/components/forgeos/intelligence-panel";
import { LaunchSequence, useLaunchSequence } from "@/components/forgeos/launch-sequence";
import { LiveActivityPanel } from "@/components/forgeos/live-activity-panel";
import { MissionControlPanel } from "@/components/forgeos/mission-control-panel";
import { OrchestrationProgress } from "@/components/forgeos/orchestration-progress";
import { ProductReadyReveal } from "@/components/forgeos/product-ready-reveal";
import { ProductShowcasePanel } from "@/components/forgeos/product-showcase-panel";
import {
  CompletionCelebration,
  RunStatsPanel,
  computeRunStats,
} from "@/components/forgeos/run-stats";
import { TimelinePanel } from "@/components/forgeos/timeline-panel";
import { classifyProject, deriveProductName } from "@/lib/product-templates";
import { cn } from "@/lib/utils";
import { useOrchestration } from "@/hooks/use-orchestration";

export function ForgeDashboard() {
  const { state, launch, source, error } = useOrchestration();
  const hasStarted = state.isRunning || state.isComplete;

  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const selectedEmployee = useMemo(
    () => state.employees.find((e) => e.role === selectedRole) ?? null,
    [state.employees, selectedRole]
  );
  const handleSelectEmployee = useCallback((employee: AIEmployee) => {
    setSelectedRole(employee.role);
  }, []);
  const handleDrawerOpenChange = useCallback((next: boolean) => {
    if (!next) setSelectedRole(null);
  }, []);

  const pendingProjectRef = useRef<string | null>(null);
  const { state: seqState, start: startSequence } = useLaunchSequence(() => {
    const idea = pendingProjectRef.current;
    pendingProjectRef.current = null;
    if (idea) launch(idea);
  });

  const handleLaunch = useCallback(
    (idea: string) => {
      pendingProjectRef.current = idea;
      startSequence();
    },
    [startSequence]
  );

  const {
    state: deployState,
    start: startDeployment,
    reset: resetDeployment,
  } = useDeploymentSequence();

  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (state.isRunning && !wasRunningRef.current) {
      resetDeployment();
    }
    wasRunningRef.current = state.isRunning;
  }, [state.isRunning, resetDeployment]);

  // devops complete is on rawState; adapter maps complete -> idle for sidebar
  const devopsCompleteRef = useRef(false);
  useEffect(() => {
    const devops = state.employees.find((e) => e.role === "DevOps");
    const devopsDone =
      devops?.rawState === "complete" || devops?.status === "complete";
    if (devopsDone && !devopsCompleteRef.current) {
      devopsCompleteRef.current = true;
      startDeployment();
    }
    if (state.isRunning && !state.isComplete) {
      devopsCompleteRef.current = false;
    }
  }, [state.employees, state.isRunning, state.isComplete, startDeployment]);

  useEffect(() => {
    if (
      state.isComplete &&
      !deployState.finished &&
      deployState.phase === "idle" &&
      !devopsCompleteRef.current
    ) {
      devopsCompleteRef.current = true;
      startDeployment();
    }
  }, [
    state.isComplete,
    deployState.finished,
    deployState.phase,
    startDeployment,
  ]);

  const previewTemplate = useMemo(
    () => classifyProject(state.projectIdea),
    [state.projectIdea]
  );
  const productName = useMemo(
    () =>
      deriveProductName(
        state.projectIdea,
        previewTemplate,
        state.projectPlan?.companyName
      ),
    [state.projectIdea, previewTemplate, state.projectPlan?.companyName]
  );

  const [revealDismissed, setRevealDismissed] = useState(false);
  const [forceReveal, setForceReveal] = useState(false);
  useEffect(() => {
    if (state.isRunning && !state.isComplete) {
      setRevealDismissed(false);
      setForceReveal(false);
    }
  }, [state.isRunning, state.isComplete]);
  useEffect(() => {
    if (!state.isComplete) return;
    const t = window.setTimeout(() => setForceReveal(true), 7000);
    return () => window.clearTimeout(t);
  }, [state.isComplete]);

  const revealDownstream =
    state.isComplete &&
    (deployState.finished || deployState.phase === "done" || forceReveal);
  const showProductReady = revealDownstream && !revealDismissed;

  const stats = useMemo(() => computeRunStats(state), [state]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <BlueprintGrid />

      <LaunchSequence
        visible={seqState.visible}
        phase={seqState.phase}
        countdown={seqState.countdown}
      />
      <DeploymentSequence phase={deployState.phase} productName={productName} />
      <CompletionCelebration
        isComplete={revealDownstream && revealDismissed}
        stats={stats}
      />

      <ProductReadyReveal
        visible={showProductReady}
        state={state}
        onDismiss={() => setRevealDismissed(true)}
      />

      <AgentReasoningDrawer
        employee={selectedEmployee}
        state={state}
        open={selectedEmployee !== null}
        onOpenChange={handleDrawerOpenChange}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:flex-row">
        <AIEmployeesSidebar
          employees={state.employees}
          onSelectEmployee={handleSelectEmployee}
        />

        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-auto transition-[filter,opacity] duration-500",
            showProductReady && "pointer-events-none opacity-40 blur-[2px]"
          )}
        >
          <HeroSection
            onLaunch={handleLaunch}
            isRunning={state.isRunning}
            isComplete={state.isComplete}
            source={source}
          />

          {error && !state.isRunning && (
            <div className="px-4 pb-4 sm:px-6">
              <FallbackNotice message={error} />
            </div>
          )}

          {state.projectPlan?.planSource === "deterministic" && (
            <div className="px-4 pb-4 sm:px-6">
              <DemoModeBadge />
            </div>
          )}

          <OrchestrationProgress
            progress={state.progress}
            isRunning={state.isRunning}
            isComplete={state.isComplete}
          />

          {hasStarted && (
            <div className="px-4 pb-6 sm:px-6">
              <RunStatsPanel
                stats={stats}
                hasStarted={hasStarted}
                isComplete={state.isComplete}
              />
            </div>
          )}

          {hasStarted && (
            <div className="px-4 pb-6 sm:px-6">
              <IntelligencePanel state={state} hasStarted={hasStarted} />
            </div>
          )}

          {revealDismissed && (
            <div className="px-4 pb-6 sm:px-6">
              <ProductShowcasePanel state={state} />
            </div>
          )}

          {revealDismissed && (
            <div className="px-4 pb-6 sm:px-6">
              <LivePreviewPanel state={state} />
            </div>
          )}

          <div className="grid flex-1 gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-3">
            <LiveActivityPanel
              activities={state.activities}
              isRunning={state.isRunning}
              hasStarted={hasStarted}
            />
            <TimelinePanel events={state.timelineEvents} hasStarted={hasStarted} />
            <DeliverablesPanel
              deliverables={state.deliverables}
              hasStarted={hasStarted}
            />
          </div>

          <div className="px-4 pb-6 sm:px-6">
            <MissionControlPanel
              messages={state.missionControlMessages}
              hasStarted={hasStarted}
              isRunning={state.isRunning}
            />
          </div>

          <div className="px-4 pb-6 sm:px-6">
            <ArtifactCenter
              deliverables={state.deliverables}
              hasStarted={hasStarted}
            />
          </div>
        </main>
      </div>

    </div>
  );
}
