import type { NextFunction, Request, Response } from "express";
import * as express from "express";

type RequestLike = Request & {
	raw?: Request;
	originalUrl?: string;
	url?: string;
	baseUrl?: string;
};

type ResponseLike = Response & {
	raw?: Response;
};

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
export function SkipBodyParsingMiddleware(basePath = "/api/auth") {
	// Return a middleware function compatible with Nest's consumer.apply()
	// NestJS consumer.apply() accepts plain functions directly
	return (req: RequestLike, res: ResponseLike, next: NextFunction): void => {
		// skip body parsing for better-auth routes
		if (matchesBasePath(req, basePath)) {
			next();
			return;
		}

		// Parse the body as usual
		const nodeReq = getNodeRequest(req);
		const nodeRes = getNodeResponse(res);

		express.json()(nodeReq, nodeRes, (err) => {
			if (err) {
				next(err);
				return;
			}
			express.urlencoded({ extended: true })(nodeReq, nodeRes, next);
		});
	};
}
