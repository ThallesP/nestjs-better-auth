import type { ExecutionContext } from "@nestjs/common";
import type { GqlExecutionContext as GqlExecutionContextType } from "@nestjs/graphql";

let GqlExecutionContext: typeof GqlExecutionContextType | undefined;

function getGqlExecutionContext(): typeof GqlExecutionContextType {
	if (!GqlExecutionContext) {
		GqlExecutionContext = require("@nestjs/graphql").GqlExecutionContext;
	}
	return GqlExecutionContext as typeof GqlExecutionContextType;
}

/**
 * Extracts the request object from either HTTP, GraphQL or WebSocket execution context
 * @param context - The execution context
 * @returns The request object
 */
export function getRequestFromContext(context: ExecutionContext) {
	const contextType = context.getType<"graphql" | "ws" | "http">();
	if (contextType === "graphql") {
		return getGqlExecutionContext().create(context).getContext().req;
	}

	if (contextType === "ws") {
		return context.switchToWs().getClient();
	}

	return context.switchToHttp().getRequest();
}
