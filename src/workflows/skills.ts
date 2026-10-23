import type { FilesystemPermission } from "deepagents";
import { findProjectRoot } from "deepagents";

/** Virtual mount for the repo's skills tree, under the backend root. */
const SKILLS_ROOT = "/skills";

/**
 * The only filesystem tool a skill reader gets.
 *
 * A skill and its `references/` files are read by path — nothing lists, searches
 * or writes them — and every tool schema is re-sent on every model call, so the
 * other seven deepagents ships (ls, write_file, edit_file, delete, glob, grep,
 * execute) would be paid for on every turn without ever being called.
 */
const SKILL_TOOLS = ["read_file"] as const;

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
