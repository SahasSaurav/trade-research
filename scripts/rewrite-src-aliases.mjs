/**
 * Rewrites the `@src/*` specifiers `tsc` leaves in `dist/` into relative paths.
 *
 * The compiler does not rewrite path aliases, so the emitted JavaScript cannot
 * be resolved by Node on its own. Doing it here keeps `dist/` runnable without a
 * loader (`tsx`) and without shipping the TypeScript sources — which is what the
 * Docker image relies on. Run as part of `npm run build`.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIST_DIR = "dist";

/** Where the aliases point: `@src/a/b.js` is `dist/src/a/b.js` on disk. */
const ALIAS_TARGET_DIR = path.join(DIST_DIR, "src");

/** Emitted files that can carry an import or export specifier. */
const EMITTED_EXTENSIONS = [".js", ".d.ts"];

/** Every emitted file under `dir`, depth-first. */
async function collectEmittedFiles(dir) {
	const found = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...(await collectEmittedFiles(full)));
		} else if (EMITTED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
			found.push(full);
		}
	}
	return found;
}

/** The relative path from `file` to the alias target, always `./`-prefixed. */
function relativeTarget(file, specifier) {
	const target = path.join(ALIAS_TARGET_DIR, specifier.slice("@src/".length));
	const relative = path.relative(path.dirname(file), target);
	const withPrefix = relative.startsWith(".") ? relative : `./${relative}`;
	return withPrefix.split(path.sep).join("/");
}

const emitted = await collectEmittedFiles(DIST_DIR);
let rewritten = 0;

for (const file of emitted) {
	const source = await readFile(file, "utf8");
	// Keep the quote character so single-quoted specifiers stay single-quoted.
	const updated = source.replace(/(["'])@src\/[^"']+\1/g, (specifier) => {
		const quote = specifier[0];
		return `${quote}${relativeTarget(file, specifier.slice(1, -1))}${quote}`;
	});
	if (updated !== source) {
		await writeFile(file, updated);
		rewritten += 1;
	}
}

console.log(
	`rewrite-src-aliases: rewrote ${rewritten} of ${emitted.length} emitted files`,
);
