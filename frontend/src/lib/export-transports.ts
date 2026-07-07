/**
 * lib/export-transports.ts
 *
 * The "how it ships" layer. Every function here takes a ``ProjectBundle``
 * and does exactly one thing with it. Adding a new destination is
 * additive: implement the transport, wire it to a button. Nothing else
 * needs to change.
 *
 * Currently implemented
 * ---------------------
 *   * downloadBundleAsZip   -- assemble a .zip with every file, trigger
 *                              a browser download
 *   * downloadBundleFile    -- pull one file out and download it as-is
 *   * downloadBundleSubset  -- download a filtered subset as a .zip
 *
 * Reserved
 * --------
 *   * pushBundleToGitHub    -- stub. Contract is defined; body throws
 *                              "not implemented". This is the extension
 *                              point for future GitHub integration.
 */

import JSZip from "jszip";
import type { BundleCategory, ProjectBundle } from "@/lib/project-bundle";

// ---------------------------------------------------------------------------
// Utility: turn a blob into a browser download
// ---------------------------------------------------------------------------

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a beat to start the download before revoking the
  // object URL. 1s is generous but harmless.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Safe-ish filesystem name: no slashes, no spaces, keep case. Used for the
 * top-level folder inside the zip and the zip filename itself.
 */
function toFolderName(projectName: string): string {
  const slug = projectName
    .trim()
    .replace(/[^a-zA-Z0-9-_.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "forgeos-project";
}

// ---------------------------------------------------------------------------
// ZIP download
// ---------------------------------------------------------------------------

/**
 * Assemble the full bundle into a .zip and trigger the browser to save it.
 * The zip root is a single folder named after the project so users don't
 * get their downloads folder polluted by loose files.
 */
export async function downloadBundleAsZip(bundle: ProjectBundle): Promise<void> {
  const zip = new JSZip();
  const folderName = toFolderName(bundle.projectName);
  const root = zip.folder(folderName);
  if (!root) throw new Error("Failed to create root folder in zip");

  for (const file of bundle.files) {
    root.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadBlob(blob, `${folderName}.zip`);
}

/**
 * Assemble a filtered subset of the bundle into a .zip.
 *
 * Used by the "Export Source Code" button (paths from the ``source_code``
 * category). Also usable by future callers that want to ship, say, only
 * the documentation.
 */
export async function downloadBundleSubset(
  bundle: ProjectBundle,
  paths: string[],
  suffix: string
): Promise<void> {
  const zip = new JSZip();
  const folderName = toFolderName(bundle.projectName);
  const root = zip.folder(folderName);
  if (!root) throw new Error("Failed to create root folder in zip");

  const pathSet = new Set(paths);
  const included = bundle.files.filter((f) => pathSet.has(f.path));
  if (included.length === 0) {
    throw new Error(
      `Bundle contains none of the requested paths for the "${suffix}" export.`
    );
  }
  for (const file of included) {
    root.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadBlob(blob, `${folderName}-${suffix}.zip`);
}

// ---------------------------------------------------------------------------
// Single-file download
// ---------------------------------------------------------------------------

/**
 * Look up a file in the bundle by path and download it directly (no zip).
 * Used by the "Export README", "Export PRD", "Export Architecture" buttons
 * when a category resolves to exactly one file.
 *
 * Throws when the path isn't in the bundle -- callers should have already
 * checked ``bundle.categories``.
 */
export function downloadBundleFile(
  bundle: ProjectBundle,
  path: string
): void {
  const file = bundle.files.find((f) => f.path === path);
  if (!file) {
    throw new Error(`No file in bundle at path: ${path}`);
  }
  const mime =
    file.language === "markdown"
      ? "text/markdown"
      : file.language === "json"
      ? "application/json"
      : "text/plain";
  const blob = new Blob([file.content], { type: `${mime};charset=utf-8` });
  const filename = path.split("/").pop() || "download.txt";
  downloadBlob(blob, filename);
}

/**
 * Export every file in one category. Uses a single-file download when the
 * category has exactly one entry; otherwise packs into a subset zip.
 * Prefer this over calling ``downloadBundleFile`` directly, so the
 * "Export PRD" button behaves consistently whether the run had 1 PRD file
 * or (in a future version) 3.
 */
export async function downloadBundleCategory(
  bundle: ProjectBundle,
  category: BundleCategory
): Promise<void> {
  const paths = bundle.categories[category];
  if (paths.length === 0) {
    throw new Error(
      `Bundle has no files in category "${category}". Run may have failed to produce this artifact.`
    );
  }
  if (paths.length === 1) {
    downloadBundleFile(bundle, paths[0]);
    return;
  }
  await downloadBundleSubset(bundle, paths, category);
}

// ---------------------------------------------------------------------------
// GitHub push (reserved for future work)
// ---------------------------------------------------------------------------

/**
 * Options for pushing a bundle to GitHub. Kept in the transport module so
 * the shape is stable across the codebase before any implementation lands.
 */
export type GitHubPushOptions = {
  /** Personal-access token with 'repo' scope. Never persisted client-side. */
  token: string;
  /** ``owner/repo`` shorthand, e.g. "acme/my-forgeos-app". */
  repoFullName: string;
  /** Target branch. Defaults to "main" when omitted. */
  branch?: string;
  /** Commit message. Defaults to a ForgeOS default when omitted. */
  commitMessage?: string;
  /** When true, create the repo if it doesn't exist. */
  createIfMissing?: boolean;
};

/**
 * Push the ProjectBundle to a GitHub repository.
 *
 * NOT YET IMPLEMENTED. This function is defined so that:
 *   1. The transport contract is stable and reviewable before the network
 *      code lands.
 *   2. The UI can safely feature-detect the transport (``typeof
 *      pushBundleToGitHub === 'function'``) without a build error.
 *   3. When the integration lands, the only work is filling in the body:
 *      no signature negotiation, no callers to update.
 *
 * Implementation plan when this ships:
 *   1. If ``createIfMissing``, hit ``POST /user/repos`` first.
 *   2. Build a git tree from ``bundle.files`` via ``POST /repos/{o}/{r}/git/blobs``
 *      per file, then ``POST /repos/{o}/{r}/git/trees`` with the blob refs.
 *   3. Commit with ``POST /repos/{o}/{r}/git/commits`` and update the branch
 *      ref with ``PATCH /repos/{o}/{r}/git/refs/heads/{branch}``.
 *   4. Return the commit URL.
 *
 * Token handling: never store the PAT. Accept it per-call. Instructions
 * in the UI should tell the user to create a fine-scoped token and revoke
 * it after use.
 */
export async function pushBundleToGitHub(
  _bundle: ProjectBundle,
  _options: GitHubPushOptions
): Promise<{ commitUrl: string }> {
  throw new Error(
    "pushBundleToGitHub is not yet implemented. This is the extension " +
      "point for future GitHub integration; see JSDoc for the planned flow."
  );
}

/**
 * Feature-detect whether GitHub push is implemented yet. UI code uses this
 * to hide/disable the button rather than checking a version constant.
 */
export function isGitHubExportAvailable(): boolean {
  // Toggle when the implementation lands.
  return false;
}
