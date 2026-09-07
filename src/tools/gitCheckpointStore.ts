import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { runGit } from "./gitCommand.js";

interface UntrackedFileSnapshot {
  relativePath: string;
  content: Buffer;
}

interface Checkpoint {
  id: string;
  repository: string;
  head: string;
  stashRef?: string;
  untrackedFiles: UntrackedFileSnapshot[];
}

export interface GitCheckpointResult {
  success: boolean;
  id?: string;
  repository?: string;
  head?: string;
  message: string;
  error?: string;
  hasChanges?: boolean;
  stdout?: string;
}

const checkpoints = new Map<string, Checkpoint>();

async function getRepository(cwd: string): Promise<string> {
  const result = await runGit(
    ["rev-parse", "--show-toplevel"],
    cwd,
  );

  if (!result.success) {
    throw new Error(
      (result.error ?? result.stderr) || "Not a Git repository.",
    );
  }

  return result.stdout.trim();
}

async function getUntrackedFiles(
  repository: string,
): Promise<UntrackedFileSnapshot[]> {
  const result = await runGit(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    repository,
  );

  if (!result.success) {
    throw new Error(
      (result.error ?? result.stderr) || "Unable to list untracked files.",
    );
  }

  const files = result.stdout
    .split("\0")
    .filter(Boolean);
  const snapshots: UntrackedFileSnapshot[] = [];

  for (const relativePath of files) {
    const filePath = path.join(repository, relativePath);

    try {
      const stat = await fs.stat(filePath);

      if (stat.isFile()) {
        snapshots.push({
          relativePath,
          content: await fs.readFile(filePath),
        });
      }
    } catch {
      // Ignore files that disappear while taking the snapshot.
    }
  }

  return snapshots;
}

export async function createGitCheckpoint(
  cwd: string,
): Promise<GitCheckpointResult> {
  try {
    const repository = await getRepository(cwd);
    const headResult = await runGit(
      ["rev-parse", "HEAD"],
      repository,
    );

    if (!headResult.success) {
      throw new Error(
        (headResult.error ?? headResult.stderr) || "Unable to resolve HEAD.",
      );
    }

    const stashResult = await runGit(
      ["stash", "create", "mini-codex checkpoint"],
      repository,
    );

    if (!stashResult.success) {
      throw new Error(
        (stashResult.error ?? stashResult.stderr) || "Unable to create checkpoint.",
      );
    }

    const id = `checkpoint-${crypto.randomUUID()}`;
    const checkpoint: Checkpoint = {
      id,
      repository,
      head: headResult.stdout.trim(),
      ...(stashResult.stdout.trim()
        ? { stashRef: stashResult.stdout.trim() }
        : {}),
      untrackedFiles: await getUntrackedFiles(repository),
    };

    checkpoints.set(id, checkpoint);

    return {
      success: true,
      id,
      repository,
      head: checkpoint.head,
      message: "Git checkpoint created.",
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: "Unable to create Git checkpoint.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function rollbackGitCheckpoint(
  cwd: string,
  id: string,
): Promise<GitCheckpointResult> {
  const checkpoint = checkpoints.get(id);

  if (!checkpoint) {
    return {
      success: false,
      message: "Git checkpoint was not found or has already been rolled back.",
      error: `Unknown checkpoint: ${id}`,
    };
  }

  try {
    const repository = await getRepository(cwd);
    if (path.resolve(repository) !== path.resolve(checkpoint.repository)) {
      throw new Error("Checkpoint belongs to a different Git repository.");
    }

    const resetResult = await runGit(
      ["reset", "--hard", checkpoint.head],
      repository,
    );

    if (!resetResult.success) {
      throw new Error(
        (resetResult.error ?? resetResult.stderr) || "Unable to reset repository.",
      );
    }

    const cleanResult = await runGit(
      ["clean", "-fd"],
      repository,
    );

    if (!cleanResult.success) {
      throw new Error(
        (cleanResult.error ?? cleanResult.stderr) || "Unable to clean repository.",
      );
    }

    if (checkpoint.stashRef) {
      const applyResult = await runGit(
        ["stash", "apply", "--index", checkpoint.stashRef],
        repository,
      );

      if (!applyResult.success) {
        throw new Error(
          (applyResult.error ?? applyResult.stderr) || "Unable to restore checkpoint.",
        );
      }
    }

    for (const file of checkpoint.untrackedFiles) {
      const filePath = path.join(
        repository,
        file.relativePath,
      );

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
    }

    checkpoints.delete(id);

    return {
      success: true,
      id,
      repository,
      head: checkpoint.head,
      message: "Git checkpoint rolled back.",
    };
  } catch (error: unknown) {
    return {
      success: false,
      id,
      repository: checkpoint.repository,
      head: checkpoint.head,
      message: "Unable to roll back Git checkpoint.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function discardGitCheckpoint(
  id: string,
): GitCheckpointResult {
  const checkpoint = checkpoints.get(id);

  if (!checkpoint) {
    return {
      success: false,
      id,
      message: "Git checkpoint was not found or has already been discarded.",
      error: `Unknown checkpoint: ${id}`,
    };
  }

  checkpoints.delete(id);

  return {
    success: true,
    id,
    repository: checkpoint.repository,
    head: checkpoint.head,
    message: "Git checkpoint discarded.",
  };
}

export async function inspectGitCheckpoint(
  cwd: string,
  id: string,
): Promise<GitCheckpointResult> {
  const checkpoint = checkpoints.get(id);
  if (!checkpoint) {
    return {
      success: false,
      id,
      message: "Git checkpoint was not found.",
      error: `Unknown checkpoint: ${id}`,
    };
  }

  try {
    const repository = await getRepository(cwd);
    if (path.resolve(repository) !== path.resolve(checkpoint.repository)) {
      throw new Error("Checkpoint belongs to a different Git repository.");
    }

    const base = checkpoint.stashRef ?? checkpoint.head;
    const diffResult = await runGit(["diff", base], repository);
    if (!diffResult.success) {
      throw new Error(
        (diffResult.error ?? diffResult.stderr) || "Unable to inspect checkpoint.",
      );
    }

    const currentUntracked = await getUntrackedFiles(repository);
    const baseline = new Map(
      checkpoint.untrackedFiles.map((file) => [
        file.relativePath,
        file.content,
      ]),
    );
    const untrackedChanges: string[] = [];

    for (const file of currentUntracked) {
      const previous = baseline.get(file.relativePath);
      if (!previous || !previous.equals(file.content)) {
        untrackedChanges.push(`?? ${file.relativePath}`);
      }
      baseline.delete(file.relativePath);
    }
    for (const relativePath of baseline.keys()) {
      untrackedChanges.push(`D  ${relativePath}`);
    }

    const stdout = [
      diffResult.stdout.trim(),
      ...untrackedChanges,
    ].filter(Boolean).join("\n");

    return {
      success: true,
      id,
      repository,
      head: checkpoint.head,
      hasChanges: Boolean(stdout),
      stdout,
      message: "Git checkpoint inspected.",
    };
  } catch (error: unknown) {
    return {
      success: false,
      id,
      repository: checkpoint.repository,
      head: checkpoint.head,
      message: "Unable to inspect Git checkpoint.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
