/**
 * Shared data resolution for the Product Showcase and Product Ready reveal.
 * Keeps naming, files, and stack consistent across both surfaces.
 */

import type { OrchestrationState } from "@/lib/orchestration-types";
import {
  classifyProject,
  deriveProductName,
  type ProductTemplate,
} from "@/lib/product-templates";
import { buildGeneratedFiles, type GeneratedFile } from "@/lib/generated-files";

export function coerceLanguage(raw: string): GeneratedFile["language"] {
  const t = raw.toLowerCase();
  if (t === "tsx") return "tsx";
  if (t === "ts" || t === "typescript") return "ts";
  if (t === "sql") return "sql";
  if (t === "markdown" || t === "md") return "markdown";
  if (t === "json") return "json";
  if (t === "python" || t === "py") return "python";
  if (t === "css") return "text";
  return "text";
}

export type ShowcaseData = {
  template: ProductTemplate;
  productName: string;
  tagline: string;
  stack: string[];
  files: GeneratedFile[];
  filesFromLlm: boolean;
};

export function resolveShowcaseData(state: OrchestrationState): ShowcaseData {
  const template = classifyProject(state.projectIdea);
  const productName = deriveProductName(
    state.projectIdea,
    template,
    state.projectPlan?.companyName
  );
  const tagline = state.projectPlan?.mission || template.tagline;
  const fromPlan = state.projectPlan?.recommendedStack;
  const stack =
    fromPlan && fromPlan.length > 0 ? fromPlan : template.fallbackStack;

  const bundle = state.codeBundle;
  const files: GeneratedFile[] =
    bundle && bundle.files.length > 0
      ? bundle.files.map((f) => ({
          path: f.path,
          language: coerceLanguage(f.language),
          content: f.content,
        }))
      : buildGeneratedFiles(template, productName, tagline);

  return {
    template,
    productName,
    tagline,
    stack,
    files,
    filesFromLlm: bundle !== null && bundle.files.length > 0,
  };
}

/** Plausible pitch numbers for the reveal footer. Deterministic per run. */
export function estimateBuildEconomics(
  state: Pick<OrchestrationState, "deliverables" | "projectIdea">
): {
  developmentUsd: number;
  hostingMonthlyUsd: number;
  launchReadinessPct: number;
} {
  const completed = state.deliverables.filter((d) => d.progress >= 100).length;
  const developmentUsd = 24000 + completed * 2800;
  const hostingMonthlyUsd = 18 + (state.projectIdea.length % 4) * 7;
  const launchReadinessPct = Math.min(99, 88 + completed);
  return { developmentUsd, hostingMonthlyUsd, launchReadinessPct };
}
