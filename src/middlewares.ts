import type { NextFunction, Request, RequestHandler, Response } from "express";
import * as express from "express";
import type { AuthModuleBodyParserOptions } from "./auth-module-definition.ts";

type RequestWithRawBody = Request & {
	rawBody?: Buffer;
};

type ExpressVerifyCallback = (
	req: Request,
	res: Response,
	buf: Buffer,
	encoding: string,
) => void;

function withRawBodySupport<T extends { verify?: ExpressVerifyCallback }>(
	options: T,
	rawBody = false,
): T {
	if (!rawBody) return options;

	const verify = options.verify;

	return {
		...options,
		verify: (req, res, buf, encoding) => {
			(req as RequestWithRawBody).rawBody = buf;
			verify?.(req, res, buf, encoding);
		},
	};
}

function createJsonBodyParser(
	config?: AuthModuleBodyParserOptions["json"],
	rawBody = false,
): RequestHandler | undefined {
	const { enabled = true, ...options } = config ?? {};
	if (!enabled) return;

	return express.json(withRawBodySupport(options, rawBody));
}

function createUrlencodedBodyParser(
	config?: AuthModuleBodyParserOptions["urlencoded"],
	rawBody = false,
): RequestHandler | undefined {
	const { enabled = true, extended = true, ...options } = config ?? {};
	if (!enabled) return;

	return express.urlencoded(
		withRawBodySupport({ extended, ...options }, rawBody),
	);
}

function runMiddleware(
	middleware: RequestHandler | undefined,
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (!middleware) {
		next();
		return;
	}

	middleware(req, res, next);
}

/**
 * Factory that returns a Nest middleware which skips body parsing for the
 * configured basePath.
 */
export function SkipBodyParsingMiddleware(
	basePath = "/api/auth",
	bodyParser: AuthModuleBodyParserOptions = {},
	rawBody = false,
) {
	const jsonBodyParser = createJsonBodyParser(bodyParser.json, rawBody);
	const urlencodedBodyParser = createUrlencodedBodyParser(
		bodyParser.urlencoded,
		rawBody,
	);

	// Return a middleware function compatible with Nest's consumer.apply()
	// NestJS consumer.apply() accepts plain functions directly
	return (req: Request, res: Response, next: NextFunction): void => {
		// skip body parsing for better-auth routes
		if (req.baseUrl.startsWith(basePath)) {
			next();
			return;
		}

		// Parse the body as usual
		runMiddleware(jsonBodyParser, req, res, (err) => {
			if (err) {
				next(err);
				return;
			}
			runMiddleware(urlencodedBodyParser, req, res, next);
		});
	};
}
