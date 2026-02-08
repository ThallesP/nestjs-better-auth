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
		// skip body parsing for better-auth routes
		if (req.baseUrl.startsWith(basePath)) {
			next();
			return;
		}

		// Parse the body as usual
		express.json(jsonParserOptions)(req, res, (err) => {
			if (err) {
				next(err);
				return;
			}
			express.urlencoded({ extended: true })(req, res, next);
		});
	};
}
