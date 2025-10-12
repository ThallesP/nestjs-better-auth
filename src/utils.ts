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
