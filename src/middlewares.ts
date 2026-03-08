import type { NextFunction, Request, Response } from "express";
import type { OptionsJson, OptionsUrlencoded } from "body-parser";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as express from "express";
import type { AuthModuleOptions } from "./auth-module-definition.ts";

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

export type ResolvedJsonBodyParserOptions = Omit<OptionsJson, "verify"> & {
	enabled: boolean;
	rawBody: boolean;
};

export type ResolvedUrlencodedBodyParserOptions = OptionsUrlencoded & {
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

	const {
		enabled: jsonEnabled = bodyParserEnabledByDefault,
		rawBody = options.enableRawBodyParser ?? false,
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
	const { basePath = "/api/auth", bodyParser = resolveBodyParserOptions() } =
		options;

	const {
		enabled: jsonEnabled,
		rawBody,
		...jsonParserOptions
	} = bodyParser.json;
	const { enabled: urlencodedEnabled, ...urlencodedParserOptions } =
		bodyParser.urlencoded;

	const expressJsonParserOptions: OptionsJson = rawBody
		? { ...jsonParserOptions, verify: rawBodyParser }
		: jsonParserOptions;
	const jsonParser = jsonEnabled
		? express.json(expressJsonParserOptions)
		: null;
	const urlencodedParser = urlencodedEnabled
		? express.urlencoded(urlencodedParserOptions)
		: null;

	// Return a middleware function compatible with Nest's consumer.apply()
	// NestJS consumer.apply() accepts plain functions directly
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
