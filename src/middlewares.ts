import type { NextFunction, Request, Response } from "express";
import * as express from "express";

/**
 * Factory that returns a Nest middleware which skips body parsing for the
 * configured basePath.
 */
export function SkipBodyParsingMiddleware(basePath = "/api/auth") {
	// Return a middleware function compatible with Nest's consumer.apply()
	// NestJS consumer.apply() accepts plain functions directly
	return (req: Request, res: Response, next: NextFunction): void => {
		// skip body parsing for better-auth routes
		if (req.baseUrl.startsWith(basePath)) {
			next();
			return;
		}

		// Parse the body as usual
		express.json()(req, res, (err) => {
			if (err) {
				next(err);
				return;
			}
			express.urlencoded({ extended: true })(req, res, next);
		});
	};
}
