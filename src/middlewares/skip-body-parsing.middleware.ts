import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import * as express from "express";

@Injectable()
export class SkipBodyParsingMiddleware implements NestMiddleware {
	use(req: Request, res: Response, next: NextFunction): void {
		// skip body parsing for better-auth routes
		if (req.baseUrl.startsWith("/api/auth")) {
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
	}
}
