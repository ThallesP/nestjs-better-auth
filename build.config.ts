import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	rollup: {
		emitCJS: true,
		esbuild: {
			tsconfigRaw: {
				compilerOptions: {
					experimentalDecorators: true,
				},
			},
		},
	},
});
