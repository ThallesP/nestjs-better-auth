import type { IncomingMessage } from "node:http";

export type BodyParserTypeMatcher =
	| string
	| string[]
	| ((req: IncomingMessage) => unknown);

export type BodyParserLimit = number | string;

export interface CommonBodyParserOptions {
	inflate?: boolean;
	limit?: BodyParserLimit;
	type?: BodyParserTypeMatcher;
}

export interface JsonBodyParserOptions extends CommonBodyParserOptions {
	reviver?: (key: string, value: unknown) => unknown;
	strict?: boolean;
}

export interface UrlencodedBodyParserOptions extends CommonBodyParserOptions {
	extended?: boolean;
	parameterLimit?: number;
	charsetSentinel?: boolean;
	defaultCharset?: string;
	interpretNumericEntities?: boolean;
	depth?: number;
}
