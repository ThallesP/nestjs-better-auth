import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { getSession } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import {
  AuthModuleOptions,
  MODULE_OPTIONS_TOKEN,
} from "./auth-module-definition.ts";
import { getRequestFromContext } from "./utils.ts";
import { WsException } from "@nestjs/websockets";

/**
 * Type representing a valid user session after authentication
 */
export type BaseUserSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getSession>>>
>;

export type UserSession = BaseUserSession & {
  user: BaseUserSession["user"] & {
    role?: string | string[];
    [key: string]: any; // Allow custom fields from Better Auth plugins
  };
  [key: string]: any; // Allow custom session fields
};

// Extend the request type to include session and user
declare module "express" {
  interface Request {
    session?: UserSession | null;
    user?: UserSession["user"] | null;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    session?: UserSession | null;
    user?: UserSession["user"] | null;
  }
}

/**
 * NestJS guard that handles authentication for protected routes
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: AuthModuleOptions
  ) {}

	/**
	 * Validates if the current request is authenticated
	 * Attaches session and user information to the request object
	 * Supports HTTP, GraphQL and WebSocket execution contexts
	 * @param context - The execution context of the current request
	 * @returns True if the request is authorized to proceed, throws an error otherwise
	 */
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = getRequestFromContext(context);
    
		const session: UserSession | null = await this.options.auth.api.getSession({
			headers: fromNodeHeaders(
				request.headers || request?.handshake?.headers || [],
			),
		});

    // Attach session and user to request
    (request as any).session = session;
    (request as any).user = session?.user ?? null;

    const isPublic = this.reflector.getAllAndOverride<boolean>("PUBLIC", [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>("OPTIONAL", [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isOptional && !session) return true;

		const ctxType = context.getType();

		if (!session) {
			if (ctxType === "http") {
				throw new UnauthorizedException({
					code: "UNAUTHORIZED",
					message: "Unauthorized",
				});
			} else if (ctxType === "ws") {
				throw new WsException("UNAUTHORIZED");
			} else {
				// TODO: Properly handle other types like "rpc"
				throw new Error("UNAUTHORIZED");
			}
		}

    const requiredRoles = this.reflector.getAllAndOverride<string[]>("ROLES", [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      const userRole = session.user.role;
      let hasRole = false;
      if (Array.isArray(userRole)) {
        hasRole = userRole.some((role) => requiredRoles.includes(role));
      } else if (typeof userRole === "string") {
        hasRole = requiredRoles.includes(userRole);
      }

			if (!hasRole) {
				if (ctxType === "http") {
					throw new ForbiddenException({
						code: "FORBIDDEN",
						message: "Insufficient permissions",
					});
				} else if (ctxType === "ws") {
					throw new WsException("FORBIDDEN");
				} else {
					// TODO: Properly handle other types like "rpc"
					throw new Error("FORBIDDEN");
				}
			}
		}

    return true;
  }

}
