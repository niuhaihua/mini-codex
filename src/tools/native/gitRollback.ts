import { rollbackGitCheckpoint } from "./gitCheckpointStore.js";

export function gitRollback(
  cwd: string,
  checkpointId: string,
) {
  return rollbackGitCheckpoint(cwd, checkpointId);
}
