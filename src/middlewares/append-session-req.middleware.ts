import { NestMiddleware } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { AuthService } from "../auth-service.ts";

export class AppendSessionReqMiddleware implements NestMiddleware {
	constructor(private readonly authService: AuthService) {}
	async use(req: Request, _: Response, next: NextFunction): Promise<void> {
		const headers = fromNodeHeaders(req.headers);
		const sessionResponse = await this.authService.api.getSession({ headers });
		if (!sessionResponse) {
			req.session = null;
			req.user = null;
			return next();
		}
		const { session, user } = sessionResponse;
		req.session = session;
		req.user = user ?? null;
		return next();
	}
}
