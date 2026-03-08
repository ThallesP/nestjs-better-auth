import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { transformFileSync } from "@swc/core";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(rootDir, "src");
const vitestCjsDir = join(rootDir, ".vitest-cjs");
function getSourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			return getSourceFiles(entryPath);
		}

		return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
	});
}

function rewriteRelativeTsRequires(code: string) {
	return code.replace(
		/require\((['"])(\.{1,2}\/[^'"]+)\.ts\1\)/g,
		"require($1$2.cjs$1)",
	);
}

function assertValidCommonJs(code: string, sourceFile: string) {
	try {
		new Script(code, { filename: sourceFile });
	} catch (error) {
		const reason =
			error instanceof Error ? error.message : "Unknown CommonJS parse failure";

		throw new Error(
			`Vitest CommonJS guard failed for ${relative(rootDir, sourceFile)}: ${reason}`,
			{ cause: error },
		);
	}
}

function buildVitestCjsSourceTree() {
	rmSync(vitestCjsDir, { force: true, recursive: true });
	mkdirSync(vitestCjsDir, { recursive: true });

	for (const sourceFile of getSourceFiles(srcDir)) {
		const outputFile = join(
			vitestCjsDir,
			relative(srcDir, sourceFile).replace(/\.ts$/, ".cjs"),
		);
		const transformed = transformFileSync(sourceFile, {
			swcrc: false,
			sourceMaps: "inline",
			jsc: {
				parser: {
					syntax: "typescript",
					decorators: true,
					dynamicImport: true,
				},
				target: "es2022",
				transform: {
					legacyDecorator: true,
					decoratorMetadata: true,
				},
			},
			module: {
				type: "commonjs",
			},
		});
		const commonJsCode = rewriteRelativeTsRequires(transformed.code);

		assertValidCommonJs(commonJsCode, sourceFile);

		mkdirSync(dirname(outputFile), { recursive: true });
		writeFileSync(outputFile, commonJsCode);
	}
}

buildVitestCjsSourceTree();

export default defineConfig({
	test: {
		globals: true,
	},
	plugins: [
		swc.vite({
			module: { type: "es6" },
		}),
		{
			name: "vitest-cjs-source-resolver",
			enforce: "pre",
			resolveId(source, importer) {
				if (!importer || !source.startsWith(".")) {
					return null;
				}

				const resolvedImport = resolve(dirname(importer), source);
				if (
					!resolvedImport.startsWith(srcDir) ||
					!resolvedImport.endsWith(".ts")
				) {
					return null;
				}

				return join(
					vitestCjsDir,
					relative(srcDir, resolvedImport).replace(/\.ts$/, ".cjs"),
				);
			},
		},
		{
			name: "vitest-cjs-source-tree",
			handleHotUpdate(ctx) {
				if (!ctx.file.startsWith(srcDir)) {
					return;
				}

				buildVitestCjsSourceTree();
			},
		},
	],
});
