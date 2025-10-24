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

export type PlatformRequest = ExpressRequest | FastifyRequest;

/**
 * Extracts the request object from either HTTP or GraphQL execution context
 */
export function getRequestFromContext(
  context: ExecutionContext
): PlatformRequest {
  const contextType = context.getType<GqlContextType>();
  if (contextType === "graphql") {
    return GqlExecutionContext.create(context).getContext().req;
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

/**
 * Gets the base URL from a request (works for both Express and Fastify)
 */
export function getBaseUrl(req: PlatformRequest): string {
  if ("raw" in req && req.raw) {
    return req.raw.baseUrl || req.raw.originalUrl || req.raw.url || "";
  }
  // Express request
  return (
    (req as ExpressRequest).baseUrl ||
    (req as ExpressRequest).originalUrl ||
    req.url ||
    ""
  );
}

/**
 * Checks if a request is an Express request
 */
export function isExpressRequest(req: PlatformRequest): boolean {
  return !("raw" in req) || !req.raw;
}
