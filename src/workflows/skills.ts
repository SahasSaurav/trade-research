import type { FilesystemPermission } from "deepagents";
import { findProjectRoot } from "deepagents";

/** Virtual mount for the repo's skills tree, under the backend root. */
const SKILLS_ROOT = "/skills";

/** Read-only filesystem tools for a skill reader; `read_file` is mandatory. */
const SKILL_TOOLS = ["ls", "read_file", "glob", "grep"] as const;

/**
 * Everything outside a skill's own folder is read-and-write denied. The same
 * rule for every skill, so it is defined once.
 */
const DENY_OUTSIDE_SKILL_FOLDER: FilesystemPermission = {
	operations: ["read", "write"],
	paths: ["/**"],
	mode: "deny",
};

/**
 * The repo root the skill backend reads from: the git root when present, else
 * the working directory (the container runs from `/app` with no `.git`).
 */
const REPO_ROOT = findProjectRoot() ?? process.cwd();

export { DENY_OUTSIDE_SKILL_FOLDER, REPO_ROOT, SKILLS_ROOT, SKILL_TOOLS };
