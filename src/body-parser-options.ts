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
 * Known body size limit strings: values such as `"300kb"`, `"2mb"`, `"0.5gb"`, or plain digits for bytes (e.g. `"1048576"`).
 */
export type KnownBodyParserLimit =
	| `${number}`
	| `${number}${BodyParserByteUnit}`;

/**
 * Body size limit: a byte count (`number`) or a string limit.
 *
 * String remains accepted for compatibility with Express/body-parser and
 * environment-driven configuration, while known literal forms still show up as
 * TypeScript guidance.
 */
export type BodyParserLimit = number | KnownBodyParserLimit | (string & {});

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
