import {
  createGitCheckpoint,
  discardGitCheckpoint,
  inspectGitCheckpoint,
} from "./gitCheckpointStore.js";

export function gitCheckpoint(cwd: string) {
  return createGitCheckpoint(cwd);
}

export function gitCheckpointDiscard(checkpointId: string) {
  return discardGitCheckpoint(checkpointId);
}

export function gitCheckpointInspect(
  cwd: string,
  checkpointId: string,
) {
  return inspectGitCheckpoint(cwd, checkpointId);
}
