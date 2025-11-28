import type { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext, type GqlContextType } from "@nestjs/graphql";
import type { AbstractHttpAdapter } from "@nestjs/core";

/**
 * Extracts the request object from either HTTP, GraphQL or WebSocket execution context
 * @param context - The execution context
 * @returns The request object
 */
export function getRequestFromContext(context: ExecutionContext) {
	const contextType = context.getType<GqlContextType>();
	if (contextType === "graphql") {
		return GqlExecutionContext.create(context).getContext().req;
	}

	if (contextType === "ws") {
		return context.switchToWs().getClient();
	}

	return context.switchToHttp().getRequest();
}

/**
 * Detects if the current platform adapter is Fastify
 */
export function isFastifyAdapter(
	adapter: AbstractHttpAdapter | null | undefined,
): boolean {
	if (!adapter) return false;

	const instance = adapter.getInstance?.();
	return (
		adapter.constructor?.name === "FastifyAdapter" ||
		(instance &&
			"constructor" in instance &&
			instance.constructor?.name === "FastifyInstance")
	);
}

/**
 * Returns the platform identifier for the current HTTP adapter
 */
export function getPlatform(adapter: {
	httpAdapter: AbstractHttpAdapter | null;
}): "express" | "fastify" {
	return isFastifyAdapter(adapter.httpAdapter) ? "fastify" : "express";
}
