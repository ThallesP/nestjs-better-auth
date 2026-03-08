import type { NextFunction, Request, Response } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as express from "express";
import type { OptionsJson } from "body-parser";

export interface SkipBodyParsingMiddlewareOptions {
	/**
	 * The base path for Better Auth routes. Body parsing will be skipped for these routes.
	 * @default "/api/auth"
	 */
	basePath?: string;
	/**
	 * When set to `true`, enables raw body parsing and attaches it to `req.rawBody`.
	 *
	 * This is useful for webhook signature verification that requires the raw,
	 * unparsed request body.
	 *
	 * **Important:** Since this library disables NestJS's built-in body parser,
	 * NestJS's `rawBody: true` option in `NestFactory.create()` has no effect.
	 * Use `enableRawBodyParser: true` in `AuthModule.forRoot()` instead.
	 *
	 * @default false
	 */
	enableRawBodyParser?: boolean;
}

type NestCompatibleRequest = Request & {
	raw?: IncomingMessage & { url?: string };
	originalUrl?: string;
	url?: string;
};

type NestCompatibleResponse = Response & {
	raw?: ServerResponse;
};

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

/**
 * Factory that returns a Nest middleware which skips body parsing for the
 * configured basePath.
 */
export function SkipBodyParsingMiddleware(
	options: SkipBodyParsingMiddlewareOptions = {},
) {
	const { basePath = "/api/auth", enableRawBodyParser = false } = options;

	const jsonParserOptions: OptionsJson = enableRawBodyParser
		? { verify: rawBodyParser }
		: {};

	// Return a middleware function compatible with Nest's consumer.apply()
	// NestJS consumer.apply() accepts plain functions directly
	return (req: Request, res: Response, next: NextFunction): void => {
		const request = req as NestCompatibleRequest;
		const response = res as NestCompatibleResponse;
		const requestPath =
			request.originalUrl ?? request.raw?.url ?? request.url ?? "";
		const requestForParser = request.raw ?? request;
		const responseForParser = response.raw ?? response;
		const contentType = String(request.headers["content-type"] ?? "");

		// skip body parsing for better-auth routes
		if (requestPath.startsWith(basePath)) {
			next();
			return;
		}

		if (contentType.includes("application/json")) {
			express.json(jsonParserOptions)(
				requestForParser as Request,
				responseForParser as Response,
				next,
			);
			return;
		}

		if (contentType.includes("application/x-www-form-urlencoded")) {
			express.urlencoded({ extended: true })(
				requestForParser as Request,
				responseForParser as Response,
				next,
			);
			return;
		}

		next();
	};
}
