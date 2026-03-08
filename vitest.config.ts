import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@thallesp/nestjs-better-auth": fileURLToPath(
				new URL("./dist/index.cjs", import.meta.url),
			),
		},
	},
	test: {
		globals: true,
	},
	plugins: [
		swc.vite({
			module: { type: "es6" },
		}),
	],
});
