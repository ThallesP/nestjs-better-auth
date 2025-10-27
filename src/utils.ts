import type { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext, type GqlContextType } from "@nestjs/graphql";
import { HttpAdapterHost } from "@nestjs/core";
import { UserSession } from "./auth-guard.ts";

export interface ExpressRequest {
  baseUrl?: string;
  originalUrl?: string;
  url?: string;
  session?: UserSession;
  headers: Record<string, string | string[]>;
  app?: any;
  handshake?: { headers: Record<string, string | string[]> };
}

export interface FastifyRequest {
  raw?: ExpressRequest;
  url?: string;
  headers: Record<string, string | string[]>;
  protocol: string;
  hostname: string;
  ip: string;
  session?: UserSession;
}

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
 * Detects if the current platform is Fastify
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
 * Gets the base platform (express or fastify)
 */
export function getPlatform(adapter: any): "express" | "fastify" {
  return isFastifyAdapter(adapter) ? "fastify" : "express";
}
