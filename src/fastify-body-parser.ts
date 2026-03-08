import type { HttpAdapterHost } from "@nestjs/core";
import { createRequire } from "node:module";
import type {
	BodyParserLimit,
	BodyParserTypeMatcher,
} from "./body-parser-options.ts";
import type {
	ResolvedBodyParserOptions,
	ResolvedJsonBodyParserOptions,
	ResolvedUrlencodedBodyParserOptions,
} from "./middlewares.ts";

type FastifyHttpAdapter = HttpAdapterHost["httpAdapter"];
type FastifyUseBodyParser = NonNullable<FastifyHttpAdapter["useBodyParser"]>;
type FastifyBodyParserDone = (err: Error | null, body?: unknown) => void;
type FastifyBodyParserHandler = (
	body: Buffer,
	done: FastifyBodyParserDone,
) => void;
type QsModule = typeof import("qs");

const require = createRequire(import.meta.url);

let cachedQsParse: QsModule["parse"] | null | undefined;

function resolveFastifyParserType(
	type: BodyParserTypeMatcher | undefined,
	fallback: string | string[],
) {
	if (type === undefined) {
		return fallback;
	}

	if (typeof type === "function") {
		throw new Error(
			"Function-based bodyParser type matchers are not supported with the Fastify adapter.",
		);
	}

	return type;
}

function resolveFastifyBodyLimit(limit: BodyParserLimit | undefined) {
	if (limit === undefined) {
		return undefined;
	}

	if (typeof limit === "number") {
		return limit;
	}

	const normalizedLimit = limit.trim().toLowerCase();
	const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/.exec(normalizedLimit);

	if (!match) {
		throw new Error(
			`Unsupported Fastify body parser limit '${limit}'. Use a number of bytes or a string like '2mb'.`,
		);
	}

	const units = {
		b: 1,
		kb: 1024,
		mb: 1024 * 1024,
		gb: 1024 * 1024 * 1024,
	};
	const value = Number.parseFloat(match[1]);
	const unit = (match[2] ?? "b") as keyof typeof units;

	return Math.floor(value * units[unit]);
}

function parseFastifyJsonBody(
	body: Buffer,
	options: Pick<ResolvedJsonBodyParserOptions, "reviver" | "strict">,
) {
	const rawBody = body.toString("utf8");
	const trimmedBody = rawBody.trim();

	if (trimmedBody.length === 0) {
		return {};
	}

	if (options.strict !== false) {
		const firstCharacter = trimmedBody[0];

		if (firstCharacter !== "{" && firstCharacter !== "[") {
			throw new SyntaxError("Invalid JSON payload");
		}
	}

	return JSON.parse(rawBody, options.reviver);
}

function parseSimpleFormBody(body: string, parameterLimit?: number) {
	const params = new URLSearchParams(body);
	const result: Record<string, string | string[]> = {};
	let count = 0;

	for (const [key, value] of params.entries()) {
		count += 1;

		if (parameterLimit !== undefined && count > parameterLimit) {
			break;
		}

		const currentValue = result[key];

		if (currentValue === undefined) {
			result[key] = value;
			continue;
		}

		result[key] = Array.isArray(currentValue)
			? [...currentValue, value]
			: [currentValue, value];
	}

	return result;
}

function parseFastifyUrlencodedBody(
	body: Buffer,
	options: Pick<
		ResolvedUrlencodedBodyParserOptions,
		| "extended"
		| "parameterLimit"
		| "charsetSentinel"
		| "defaultCharset"
		| "interpretNumericEntities"
		| "depth"
	>,
) {
	const encoding = options.defaultCharset === "iso-8859-1" ? "latin1" : "utf8";
	const rawBody = body.toString(encoding);

	if (options.extended === false) {
		return parseSimpleFormBody(rawBody, options.parameterLimit);
	}

	const parseQs = getQsParse();

	return parseQs(rawBody, {
		charset: options.defaultCharset === "iso-8859-1" ? "iso-8859-1" : "utf-8",
		charsetSentinel: options.charsetSentinel,
		depth: options.depth,
		interpretNumericEntities: options.interpretNumericEntities,
		parameterLimit: options.parameterLimit,
	});
}

function getQsParse() {
	if (cachedQsParse !== undefined) {
		return cachedQsParse;
	}

	try {
		cachedQsParse = (require("qs") as QsModule).parse;
	} catch (error) {
		const moduleError = error as NodeJS.ErrnoException;

		if (moduleError.code === "MODULE_NOT_FOUND") {
			cachedQsParse = null;
		} else {
			throw error;
		}
	}

	if (!cachedQsParse) {
		throw new Error(
			"Fastify bodyParser.urlencoded with extended: true requires the optional peer dependency 'qs'. Install 'qs' in your application to enable nested URL-encoded parsing.",
		);
	}

	return cachedQsParse;
}

function registerFastifyBodyParser(
	useBodyParser: FastifyUseBodyParser | undefined,
	{
		type,
		fallbackType,
		rawBody,
		limit,
		parse,
	}: {
		type: BodyParserTypeMatcher | undefined;
		fallbackType: string;
		rawBody: boolean;
		limit: BodyParserLimit | undefined;
		parse: FastifyBodyParserHandler;
	},
) {
	useBodyParser?.(
		resolveFastifyParserType(type, fallbackType),
		rawBody,
		{
			bodyLimit: resolveFastifyBodyLimit(limit),
		},
		(_req: unknown, body: Buffer, done: FastifyBodyParserDone) => {
			parse(body, done);
		},
	);
}

export function configureFastifyBodyParser(
	httpAdapter: FastifyHttpAdapter,
	bodyParserOptions: ResolvedBodyParserOptions,
) {
	const fastifyInstance = httpAdapter.getInstance() as {
		removeContentTypeParser?: (contentType: string | string[]) => void;
	};
	const useBodyParser = httpAdapter.useBodyParser?.bind(httpAdapter);

	fastifyInstance.removeContentTypeParser?.([
		"application/json",
		"application/x-www-form-urlencoded",
	]);

	registerFastifyBodyParser(useBodyParser, {
		type: bodyParserOptions.json.type,
		fallbackType: "application/json",
		rawBody: bodyParserOptions.json.rawBody,
		limit: bodyParserOptions.json.limit,
		parse: (body, done) => {
			if (!bodyParserOptions.json.enabled) {
				done(null, undefined);
				return;
			}

			try {
				done(null, parseFastifyJsonBody(body, bodyParserOptions.json));
			} catch (error) {
				done(error as Error);
			}
		},
	});

	registerFastifyBodyParser(useBodyParser, {
		type: bodyParserOptions.urlencoded.type,
		fallbackType: "application/x-www-form-urlencoded",
		rawBody: bodyParserOptions.json.rawBody,
		limit: bodyParserOptions.urlencoded.limit,
		parse: (body, done) => {
			if (!bodyParserOptions.urlencoded.enabled) {
				done(null, undefined);
				return;
			}

			try {
				done(
					null,
					parseFastifyUrlencodedBody(body, bodyParserOptions.urlencoded),
				);
			} catch (error) {
				done(error as Error);
			}
		},
	});
}
