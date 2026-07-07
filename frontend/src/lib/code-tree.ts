/**
 * lib/code-tree.ts
 *
 * Pure helpers for building a folder-tree view over a flat list of code
 * files. Split out from the CodeExplorer component so we can unit-test the
 * tree logic without touching React.
 */

import type { GeneratedFile } from "@/lib/generated-files";

export type TreeFile = {
  kind: "file";
  name: string;
  path: string;
  language: GeneratedFile["language"];
};
export type TreeDir = {
  kind: "dir";
  name: string;
  path: string;
  children: TreeNode[];
};
export type TreeNode = TreeFile | TreeDir;

/**
 * Fold flat paths into a directory tree. Sort order: directories first,
 * then alphabetical. Matches VS Code's file explorer.
 */
export function buildTree(files: GeneratedFile[]): TreeNode[] {
  const rootChildren: TreeNode[] = [];

  function insert(
    segments: string[],
    file: GeneratedFile,
    level: TreeNode[],
    prefix: string
  ): void {
    const [head, ...rest] = segments;
    if (rest.length === 0) {
      const existingIdx = level.findIndex(
        (n) => n.kind === "file" && n.name === head
      );
      const node: TreeFile = {
        kind: "file",
        name: head,
        path: file.path,
        language: file.language,
      };
      if (existingIdx >= 0) level[existingIdx] = node;
      else level.push(node);
      return;
    }
    let dir = level.find(
      (n): n is TreeDir => n.kind === "dir" && n.name === head
    );
    if (!dir) {
      dir = {
        kind: "dir",
        name: head,
        path: prefix + head,
        children: [],
      };
      level.push(dir);
    }
    insert(rest, file, dir.children, prefix + head + "/");
  }

  for (const f of files) {
    const segments = f.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    insert(segments, f, rootChildren, "");
  }

  function sort(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.kind === "dir") sort(n.children);
    }
  }
  sort(rootChildren);
  return rootChildren;
}

/** Every directory path in a tree. Used to seed the expanded set. */
export function collectDirPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  function walk(list: TreeNode[]): void {
    for (const n of list) {
      if (n.kind === "dir") {
        paths.push(n.path);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return paths;
}
