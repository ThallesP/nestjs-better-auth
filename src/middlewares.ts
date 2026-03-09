import type { NextFunction, Request, Response } from "express";
import * as express from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthModuleOptions } from "./auth-module-definition.ts";
import type {
	JsonBodyParserOptions,
	UrlencodedBodyParserOptions,
} from "./body-parser-options.ts";

export interface SkipBodyParsingMiddlewareOptions {
	/**
	 * The base path for Better Auth routes. Body parsing will be skipped for these routes.
	 * @default "/api/auth"
	 */
	basePath?: string;
	bodyParser?: ResolvedBodyParserOptions;
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

type RequestLike = Request & {
	raw?: Request;
	originalUrl?: string;
	url?: string;
	baseUrl?: string;
};

type ResponseLike = Response & {
	raw?: Response;
};

type NodeRequestLike = IncomingMessage & {
	method?: string;
	headers: IncomingMessage["headers"];
};

type NodeResponseLike = ServerResponse<IncomingMessage> & {
	getHeader(name: string): number | string | string[] | undefined;
	setHeader(name: string, value: number | string | readonly string[]): this;
	statusCode: number;
};

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

function getHeaderValue(header: string | string[] | undefined) {
	if (Array.isArray(header)) {
		return header.join(", ");
	}

	return header;
}

function appendVaryHeader(res: NodeResponseLike, value: string) {
	const currentHeader = res.getHeader("Vary");
	const currentValue =
		typeof currentHeader === "number"
			? String(currentHeader)
			: Array.isArray(currentHeader)
				? currentHeader.join(", ")
				: currentHeader;

	const varyValues = new Set(
		currentValue
			?.split(",")
			.map((item) => item.trim())
			.filter(Boolean) ?? [],
	);
	varyValues.add(value);

	res.setHeader("Vary", Array.from(varyValues).join(", "));
}

function escapeRegex(pattern: string) {
	return pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function matchesOriginPattern(origin: string, pattern: string) {
	if (pattern === "*") return true;

	const regex = new RegExp(
		`^${pattern.split("*").map(escapeRegex).join(".*")}$`,
	);
	return regex.test(origin);
}

function isAllowedOrigin(origin: string, trustedOrigins: string[]) {
	return trustedOrigins.some((trustedOrigin) =>
		matchesOriginPattern(origin, trustedOrigin),
	);
}

export interface FastifyTrustedOriginsCorsOptions {
	trustedOrigins: string[];
}

export function handleFastifyTrustedOriginsCors(
	req: RequestLike,
	res: ResponseLike,
	options: FastifyTrustedOriginsCorsOptions,
) {
	const nodeReq = getNodeRequest(req) as NodeRequestLike;
	const nodeRes = getNodeResponse(res) as NodeResponseLike;
	const origin = getHeaderValue(nodeReq.headers.origin);

	if (!origin || !isAllowedOrigin(origin, options.trustedOrigins)) {
		return false;
	}

	nodeRes.setHeader("Access-Control-Allow-Origin", origin);
	nodeRes.setHeader("Access-Control-Allow-Credentials", "true");
	appendVaryHeader(nodeRes, "Origin");

	if (nodeReq.method?.toUpperCase() !== "OPTIONS") {
		return false;
	}

	const requestMethod = getHeaderValue(
		nodeReq.headers["access-control-request-method"],
	);
	const requestHeaders = getHeaderValue(
		nodeReq.headers["access-control-request-headers"],
	);

	nodeRes.setHeader(
		"Access-Control-Allow-Methods",
		requestMethod ?? "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
	);

	if (requestHeaders) {
		nodeRes.setHeader("Access-Control-Allow-Headers", requestHeaders);
		appendVaryHeader(nodeRes, "Access-Control-Request-Headers");
	}

	nodeRes.statusCode = 204;
	nodeRes.setHeader("Content-Length", "0");
	nodeRes.end();

	return true;
}

/**
 * Factory that returns a Nest middleware which skips body parsing for the
 * configured basePath.
 */
export function SkipBodyParsingMiddleware(
	options: SkipBodyParsingMiddlewareOptions = {},
) {
	const { basePath = "/api/auth", bodyParser = resolveBodyParserOptions() } =
		options;

	const {
		enabled: jsonEnabled,
		rawBody,
		...jsonParserOptions
	} = bodyParser.json;
	const { enabled: urlencodedEnabled, ...urlencodedParserOptions } =
		bodyParser.urlencoded;

	const expressJsonParserOptions = rawBody
		? { ...jsonParserOptions, verify: rawBodyParser }
		: jsonParserOptions;
	const jsonParser = jsonEnabled
		? express.json(expressJsonParserOptions as never)
		: null;
	const urlencodedParser = urlencodedEnabled
		? express.urlencoded(urlencodedParserOptions as never)
		: null;

	return (req: RequestLike, res: ResponseLike, next: NextFunction): void => {
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
