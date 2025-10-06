import type { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext, type GqlContextType } from "@nestjs/graphql";
import type { Request } from "express";

/**
 * Extracts the request object from either HTTP or GraphQL execution context
 * @param context - The execution context
 * @returns The request object
 */
export function getRequestFromContext(context: ExecutionContext): Request {
	const contextType = context.getType<GqlContextType>();
	return handleContexts(contextType, context);
}

function handleContexts(
	type: GqlContextType,
	context: ExecutionContext,
): Request {
	let request = context.switchToHttp().getRequest<Request>();
	switch (type) {
		case "graphql":
			request = GqlExecutionContext.create(context).getContext<{
				req: Request;
			}>().req;
			break;
		case "http":
			request = context.switchToHttp().getRequest<Request>();
			break;
		case "ws":
		case "rpc":
			throw new Error(
				`Context type '${type}' is not supported. Only 'http' and 'graphql' contexts are supported.`,
			);
	}
	return request;
}
