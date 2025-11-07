import type { NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that creates a MikroORM RequestContext for each request.
 * This ensures that each Better Auth request gets its own EntityManager fork,
 * preventing the "Using global EntityManager instance methods for context specific
 * actions is disallowed" error.
 *
 * This middleware requires @mikro-orm/core to be installed.
 */
export class MikroOrmContextMiddleware implements NestMiddleware {
	constructor(private readonly orm: unknown) {}

	use(req: Request, res: Response, next: NextFunction): void {
		// Dynamically import RequestContext to avoid requiring @mikro-orm/core as a dependency
		const { RequestContext } = this.orm as {
			em: { fork: () => unknown };
			// biome-ignore lint/suspicious/noExplicitAny: MikroORM types are not available
			[key: string]: any;
		};

		if (RequestContext?.create) {
			// Use MikroORM's RequestContext to create a forked EntityManager for this request
			const em = (this.orm as { em: unknown }).em;
			RequestContext.create(em, next);
		} else {
			// If RequestContext is not available, just continue without context
			next();
		}
	}
}

/**
 * Creates a MikroORM context middleware factory that can be used with consumer.apply()
 * @param orm - The MikroORM instance
 * @returns A middleware factory function
 */
export function createMikroOrmContextMiddleware(orm: unknown) {
	return class extends MikroOrmContextMiddleware {
		constructor() {
			super(orm);
		}
	};
}
