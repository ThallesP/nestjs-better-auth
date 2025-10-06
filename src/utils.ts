import type { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext, type GqlContextType } from "@nestjs/graphql";
import type { Request } from "express";

// Session is typed as unknown because users can extend the session type
type RequestWithSession = Request & { session: unknown };

/**
 * Extracts the request object from either HTTP or GraphQL execution context
 * @param context - The execution context
 * @returns The request object
 */
export function getRequestFromContext(
	context: ExecutionContext,
): RequestWithSession {
	const contextType = context.getType<GqlContextType>();
	if (contextType === "graphql") {
		const { req } = GqlExecutionContext.create(context).getContext<{
			req: RequestWithSession;
		}>();
		return req;
	}
	return context.switchToHttp().getRequest<RequestWithSession>();
}
