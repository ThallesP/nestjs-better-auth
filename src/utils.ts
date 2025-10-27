import type { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext, type GqlContextType } from "@nestjs/graphql";

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
export function isFastifyAdapter(adapter: any): boolean {
	return (
		adapter &&
		typeof adapter === "object" &&
		(adapter.constructor?.name === "FastifyAdapter" ||
			adapter.instance?.constructor?.name === "FastifyInstance")
	);
}

/**
 * Returns the platform identifier for the current HTTP adapter
 */
export function getPlatform(adapter: any): "express" | "fastify" {
	return isFastifyAdapter(adapter) ? "fastify" : "express";
}
