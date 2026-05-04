import type { IncomingMessage } from "node:http";

export type BodyParserTypeMatcher =
	| string
	| string[]
	| ((req: IncomingMessage) => unknown);

/** Base-2 byte multipliers for string {@link BodyParserLimit} values (e.g. `"2mb"`). */
export const BYTE_UNITS = {
	b: 1,
	kb: 1 << 10,
	mb: 1 << 20,
	gb: 1 << 30,
} as const;

export type BodyParserByteUnit = keyof typeof BYTE_UNITS;

/**
 * Body size limit: a positive byte count (`number`) or a string such as `"300kb"`, `"2mb"`, `"0.5gb"`, or plain digits for bytes (e.g. `"1048576"`).
 */
export type BodyParserLimit =
	| number
	| `${number}`
	| `${number}${BodyParserByteUnit}`;

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
