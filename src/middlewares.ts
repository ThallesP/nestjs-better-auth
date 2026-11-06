import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import bodyParsers from "body-parser";
import type { AuthModuleOptions } from "./auth-module-definition.ts";
import type {
	JsonBodyParserOptions,
	UrlencodedBodyParserOptions,
} from "./body-parser-options.ts";

const require = createRequire(import.meta.url);

type MiddlewareNext = (error?: unknown) => void;
type BodyParserHandler = (
	req: IncomingMessage,
	res: ServerResponse<IncomingMessage>,
	next: MiddlewareNext,
) => void;

type BodyParserModule = {
	json(options?: unknown): BodyParserHandler;
	urlencoded(options?: unknown): BodyParserHandler;
};

export interface SkipBodyParsingMiddlewareOptions {
	/**
	 * The base path for Better Auth routes. Body parsing will be skipped for these routes.
	 * @default "/api/auth"
	 */
	basePath?: string;
	bodyParser?: ResolvedBodyParserOptions;
	/**
	 * The `getType()` of the Nest HTTP adapter. It selects which package
	 * provides the JSON and URL-encoded parsers: `@nestjs/platform-node` for
	 * `"node"` (so `express` does not have to be installed), `body-parser` otherwise.
	 * @default "express"
	 */
	adapterType?: string;
}

/**
 * Raw body parser verify callback.
 * Same implementation as NestJS's rawBodyParser.
 * @see https://github.com/nestjs/nest/blob/master/packages/platform-express/adapters/utils/get-body-parser-options.util.ts
 */
const rawBodyParser = (
	req: IncomingMessage & { rawBody?: Buffer },
	_res: ServerResponse,
	buffer: Buffer,
) => {
	if (Buffer.isBuffer(buffer)) {
		req.rawBody = buffer;
	}
	return true;
};

type RequestLike = IncomingMessage & {
	raw?: IncomingMessage;
	originalUrl?: string;
	url?: string;
	baseUrl?: string;
};

type ResponseLike = ServerResponse<IncomingMessage> & {
	raw?: ServerResponse<IncomingMessage>;
};

/**
 * Loads the body parsers of the active adapter. `@nestjs/platform-node` ships
 * its own `json()`/`urlencoded()`, which take the same options as `body-parser`;
 * every other adapter uses `body-parser`, a direct dependency of this package.
 */
function getBodyParserModule(adapterType: string): BodyParserModule {
	if (adapterType === "node") {
		return require("@nestjs/platform-node/body-parser/body-parser") as BodyParserModule;
	}

	return bodyParsers;
}

export type ResolvedJsonBodyParserOptions = JsonBodyParserOptions & {
	enabled: boolean;
	rawBody: boolean;
};

export type ResolvedUrlencodedBodyParserOptions =
	UrlencodedBodyParserOptions & {
		enabled: boolean;
	};

export type ResolvedBodyParserOptions = {
	json: ResolvedJsonBodyParserOptions;
	urlencoded: ResolvedUrlencodedBodyParserOptions;
};

export function resolveBodyParserOptions(
	options: Pick<
		AuthModuleOptions,
		"bodyParser" | "disableBodyParser" | "enableRawBodyParser"
	> = {},
): ResolvedBodyParserOptions {
	const bodyParserEnabledByDefault = !options.disableBodyParser;
	const jsonOptions = options.bodyParser?.json;
	const urlencodedOptions = options.bodyParser?.urlencoded;
	const rawBody =
		options.bodyParser?.rawBody ?? options.enableRawBodyParser ?? false;

	const {
		enabled: jsonEnabled = bodyParserEnabledByDefault,
		...jsonParserOptions
	} = jsonOptions ?? {};
	const {
		enabled: urlencodedEnabled = bodyParserEnabledByDefault,
		extended = true,
		...urlencodedParserOptions
	} = urlencodedOptions ?? {};

	return {
		json: {
			enabled: jsonEnabled,
			rawBody,
			...jsonParserOptions,
		},
		urlencoded: {
			enabled: urlencodedEnabled,
			extended,
			...urlencodedParserOptions,
		},
	};
}

export function getRequestPath(req: RequestLike) {
	return req.originalUrl ?? req.url ?? req.baseUrl ?? req.raw?.url ?? "";
}

export function getNodeRequest(req: RequestLike) {
	return req.raw ?? req;
}

export function getNodeResponse(res: ResponseLike) {
	return res.raw ?? res;
}

export function matchesBasePath(req: RequestLike, basePath: string) {
	const requestPath = getRequestPath(req);

	return requestPath === basePath || requestPath.startsWith(`${basePath}/`);
}

/**
 * Factory that returns a Nest middleware which skips body parsing for the
 * configured basePath.
 */
export function SkipBodyParsingMiddleware(
	options: SkipBodyParsingMiddlewareOptions = {},
) {
	const {
		basePath = "/api/auth",
		bodyParser = resolveBodyParserOptions(),
		adapterType = "express",
	} = options;
	const parsers = getBodyParserModule(adapterType);

	const {
		enabled: jsonEnabled,
		rawBody,
		...jsonParserOptions
	} = bodyParser.json;
	const { enabled: urlencodedEnabled, ...urlencodedParserOptions } =
		bodyParser.urlencoded;

	const jsonParserOptionsWithRawBody = rawBody
		? { ...jsonParserOptions, verify: rawBodyParser }
		: jsonParserOptions;
	const jsonParser = jsonEnabled
		? parsers.json(jsonParserOptionsWithRawBody as never)
		: null;
	const urlencodedParser = urlencodedEnabled
		? parsers.urlencoded(urlencodedParserOptions as never)
		: null;

	return (req: RequestLike, res: ResponseLike, next: MiddlewareNext): void => {
		if (matchesBasePath(req, basePath)) {
			next();
			return;
		}

		const nodeReq = getNodeRequest(req);
		const nodeRes = getNodeResponse(res);

		const runUrlencodedParser = (err?: unknown) => {
			if (err) {
				next(err);
				return;
			}

			if (!urlencodedParser) {
				next();
				return;
			}

			urlencodedParser(nodeReq, nodeRes, next);
		};

		if (!jsonParser) {
			runUrlencodedParser();
			return;
		}

		jsonParser(nodeReq, nodeRes, runUrlencodedParser);
	};
}
