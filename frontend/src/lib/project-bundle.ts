/**
 * lib/project-bundle.ts
 *
 * Assembles a ``ProjectBundle`` from the completed orchestration state. A
 * bundle is a plain, transport-agnostic description of every file we would
 * export: keyed by relative path, with content and language metadata.
 *
 * This module is deliberately side-effect free. It doesn't touch the DOM,
 * it doesn't fetch anything, and it doesn't zip. That work lives in the
 * transport layer (``lib/export-transports.ts``). Splitting them this way
 * means the same bundle can be shipped by a downloader today and by a
 * GitHub pusher tomorrow, with no refactor to the assembly logic.
 */

import type { OrchestrationState } from "@/lib/orchestration-types";
import { classifyProject, deriveProductName } from "@/lib/product-templates";
import { buildGeneratedFiles, type GeneratedFile } from "@/lib/generated-files";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single file in a bundle. Language is a coarse tag used by transports
 * (a zip encoder doesn't care; a GitHub API caller might set a file mode
 * or blob type based on it).
 */
export type BundleFile = {
  path: string;
  language: string;
  content: string;
  /**
   * Origin of the file:
   *   - 'artifact'   -- from state.deliverables (PRD, Architecture, etc.)
   *   - 'code'       -- from state.codeBundle (Engineer's LLM code)
   *   - 'template'   -- from the fallback file templates
   *   - 'meta'       -- assembled here (README, manifest.json)
   */
  origin: "artifact" | "code" | "template" | "meta";
};

/** Categorised subsets of the bundle, used by targeted-export buttons. */
export type BundleCategory = "readme" | "architecture" | "prd" | "source_code";

/**
 * A complete, exportable ProjectBundle.
 *
 * Downstream transports (zip download, GitHub push) treat this as their
 * single source of truth. If a field isn't on the bundle, it doesn't ship.
 */
export type ProjectBundle = {
  /** Product name, used as the top-level folder inside the export. */
  projectName: string;
  /** A short human-readable one-liner. */
  tagline: string;
  /** The prompt the user typed to start the run. */
  projectIdea: string;
  /** Every file in the export, keyed by relative path. */
  files: BundleFile[];
  /** Grouped index into ``files`` for targeted-export buttons. */
  categories: Record<BundleCategory, string[]>;
  /** Manifest info, useful for both the README and the GitHub description. */
  manifest: {
    generatedAt: string;
    forgeosVersion: string;
    fileCount: number;
    codeBundleSource: "llm" | "deterministic" | "hybrid" | null;
    aiEmployees: Array<{ role: string; name: string }>;
    techStack: string[];
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORGEOS_VERSION = "1.0.0";

/**
 * Map a deliverable title to a bundle file path. Uses lowercase, hyphenated
 * paths under ``docs/`` so all artifacts group together in the export.
 */
function pathForArtifact(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `docs/${slug}.md`;
}

/** Normalise a language tag for the bundle. */
function normaliseLanguage(raw: string): string {
  const t = raw.toLowerCase();
  if (t === "typescript") return "ts";
  if (t === "py") return "python";
  if (t === "md") return "markdown";
  return t;
}

/**
 * Choose whether a deliverable file goes into the "prd" or "architecture"
 * category (or neither). Categorisation is title-based, not code-based, so
 * a run with just an Architecture artifact still gets useful buttons.
 */
function categoriseArtifact(title: string): BundleCategory | null {
  const t = title.toLowerCase();
  if (t.includes("prd")) return "prd";
  if (t.includes("architecture") || t.includes("api spec")) return "architecture";
  return null; // Security Review, Test Plan, Deployment Plan land in "all" only
}

// ---------------------------------------------------------------------------
// Bundle assembler
// ---------------------------------------------------------------------------

/**
 * Build a ProjectBundle from the completed orchestration state.
 *
 * Rules:
 *   * Every deliverable with content becomes a docs/*.md file.
 *   * When ``state.codeBundle`` is present, its files ship as-is (source =
 *     'code'). When absent, fall back to the template file generator so
 *     the export is still non-empty (source = 'template'). This mirrors the
 *     Product Showcase's own preference logic.
 *   * A README.md is always assembled from bundle metadata.
 *   * A manifest.json is always assembled. This is the file a future
 *     GitHub-integration layer inspects to decide what to push, and the
 *     format that lets the export be re-hydrated by other tools.
 */
export function buildProjectBundle(state: OrchestrationState): ProjectBundle {
  const template = classifyProject(state.projectIdea);
  const projectName = deriveProductName(
    state.projectIdea,
    template,
    state.projectPlan?.companyName
  );
  const tagline = state.projectPlan?.mission || template.tagline;

  const files: BundleFile[] = [];
  const categories: Record<BundleCategory, string[]> = {
    readme: [],
    architecture: [],
    prd: [],
    source_code: [],
  };

  // 1. Artifacts (PRD, Architecture, API Spec, etc.)
  for (const d of state.deliverables) {
    if (!d.content || !d.content.trim()) continue;
    const path = pathForArtifact(d.title);
    files.push({
      path,
      language: "markdown",
      content: d.content,
      origin: "artifact",
    });
    const category = categoriseArtifact(d.title);
    if (category) categories[category].push(path);
  }

  // 2. Source code -- prefer the LLM-generated bundle, else fall back to
  //    the template file library so the export is never empty.
  const codeFiles: GeneratedFile[] =
    state.codeBundle && state.codeBundle.files.length > 0
      ? state.codeBundle.files.map((f) => ({
          path: f.path,
          language: normaliseLanguage(f.language) as GeneratedFile["language"],
          content: f.content,
        }))
      : buildGeneratedFiles(template, projectName, tagline);

  const codeOrigin: BundleFile["origin"] = state.codeBundle ? "code" : "template";
  for (const f of codeFiles) {
    // Skip the README from the file generator -- we assemble our own below
    // that references the bundle's metadata.
    if (f.path.toLowerCase() === "readme.md") continue;
    files.push({
      path: f.path,
      language: normaliseLanguage(f.language),
      content: f.content,
      origin: codeOrigin,
    });
    categories.source_code.push(f.path);
  }

  // 3. Bundle metadata
  const techStack =
    state.projectPlan?.recommendedStack && state.projectPlan.recommendedStack.length > 0
      ? state.projectPlan.recommendedStack
      : template.fallbackStack;

  const aiEmployees = state.employees.map((e) => ({
    role: e.role,
    name: e.name,
  }));

  const manifest: ProjectBundle["manifest"] = {
    generatedAt: state.completedAt ?? new Date().toISOString(),
    forgeosVersion: FORGEOS_VERSION,
    fileCount: files.length + 2, // +README, +manifest.json (added below)
    codeBundleSource: state.codeBundle ? state.codeBundle.source : null,
    aiEmployees,
    techStack,
  };

  // 4. README.md (always assembled here so it reflects the bundle exactly)
  const readmeContent = buildReadme({
    projectName,
    tagline,
    projectIdea: state.projectIdea,
    manifest,
    filePaths: files.map((f) => f.path),
  });
  files.push({
    path: "README.md",
    language: "markdown",
    content: readmeContent,
    origin: "meta",
  });
  categories.readme.push("README.md");

  // 5. manifest.json. This is the file that future integrations parse to
  //    figure out what to do. Kept intentionally simple: no schema version
  //    yet, but easy to add later.
  //
  //    The manifest's ``files`` array describes THE COMPLETE EXPORT,
  //    including README.md and manifest.json itself. That makes the export
  //    self-describing (a future GitHub pusher can iterate the manifest
  //    rather than the file system).
  const allPathsForManifest = [
    ...files.map((f) => ({
      path: f.path,
      language: f.language,
      origin: f.origin,
    })),
    // manifest.json describes itself
    { path: "manifest.json", language: "json", origin: "meta" as const },
  ];
  const manifestJson: Record<string, unknown> = {
    project_name: projectName,
    tagline,
    project_idea: state.projectIdea,
    generated_at: manifest.generatedAt,
    forgeos_version: manifest.forgeosVersion,
    code_bundle_source: manifest.codeBundleSource,
    ai_employees: manifest.aiEmployees,
    tech_stack: manifest.techStack,
    files: allPathsForManifest,
  };
  files.push({
    path: "manifest.json",
    language: "json",
    content: JSON.stringify(manifestJson, null, 2) + "\n",
    origin: "meta",
  });

  // Fix up the count now that README + manifest are in.
  manifest.fileCount = files.length;

  return {
    projectName,
    tagline,
    projectIdea: state.projectIdea,
    files,
    categories,
    manifest,
  };
}

// ---------------------------------------------------------------------------
// README assembler
// ---------------------------------------------------------------------------

type ReadmeInputs = {
  projectName: string;
  tagline: string;
  projectIdea: string;
  manifest: ProjectBundle["manifest"];
  filePaths: string[];
};

function buildReadme(inputs: ReadmeInputs): string {
  const {
    projectName,
    tagline,
    projectIdea,
    manifest,
    filePaths,
  } = inputs;

  const employees = manifest.aiEmployees
    .map((e) => `- **${e.role}** — ${e.name}`)
    .join("\n");

  const stack = manifest.techStack.map((s) => `- ${s}`).join("\n");

  const layout = filePaths
    .slice()
    .sort()
    .map((p) => `- \`${p}\``)
    .join("\n");

  const sourceLine =
    manifest.codeBundleSource === "llm"
      ? "AI-authored by the Engineer agent."
      : manifest.codeBundleSource === "hybrid"
      ? "Partially AI-authored; some files template-generated."
      : "Template-generated (LLM was disabled or unavailable during the run).";

  return `# ${projectName}

${tagline}

## About

This project was generated by ForgeOS, an autonomous AI software company.
The original prompt was:

> ${projectIdea}

**Source code**: ${sourceLine}
**Generated at**: ${manifest.generatedAt}
**ForgeOS version**: ${manifest.forgeosVersion}

## AI employees

${employees}

## Tech stack

${stack}

## Contents

${layout}

## Getting started

\`\`\`bash
npm install
cp .env.example .env
npm run dev
\`\`\`

## License

The generated code is starter scaffolding intended to be modified,
extended, and made your own. ForgeOS does not claim ownership over any of
the output.
`;
}
