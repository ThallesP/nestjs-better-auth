import {
	ForbiddenException,
	Inject,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import type {
	CanActivate,
	ContextType,
	ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { getSession } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import {
	type AuthModuleOptions,
	MODULE_OPTIONS_TOKEN,
} from "./auth-module-definition.ts";
import { getRequestFromContext } from "./utils.ts";
import { WsException } from "@nestjs/websockets";
import type { GqlContextType } from "@nestjs/graphql";

const AuthErrorType = {
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
} as const;

const AuthContextErrorMap: Record<
	ContextType,
	Record<keyof typeof AuthErrorType, (args?: unknown) => Error>
> = {
	http: {
		UNAUTHORIZED: (args) =>
			new UnauthorizedException(
				args ?? { code: "UNAUTHORIZED", message: "Unauthorized" },
			),
		FORBIDDEN: (args) =>
			new ForbiddenException(
				args ?? { code: "FORBIDDEN", message: "Insufficient permissions" },
			),
	},
	ws: {
		UNAUTHORIZED: (args?: unknown) =>
			new WsException(
				typeof args === "string" || (args && typeof args === "object")
					? (args as string | object)
					: "UNAUTHORIZED",
			),
		FORBIDDEN: (args?: unknown) =>
			new WsException(
				typeof args === "string" || (args && typeof args === "object")
					? (args as string | object)
					: "FORBIDDEN",
			),
	},
	rpc: {
		UNAUTHORIZED: (args?: unknown) =>
			new Error(typeof args === "string" ? args : "UNAUTHORIZED"),
		FORBIDDEN: (args?: unknown) =>
			new Error(typeof args === "string" ? args : "FORBIDDEN"),
	},
};

/**
 * Type representing a valid user session after authentication
 * Excludes null and undefined values from the session return type
 */
export type BaseUserSession = NonNullable<
	Awaited<ReturnType<ReturnType<typeof getSession>>>
>;

export type UserSession = BaseUserSession & {
	user: BaseUserSession["user"] & {
		role?: string | string[];
	};
};

/**
 * NestJS guard that handles authentication for protected routes
 * Can be configured with @AllowAnonymous() or @OptionalAuth() decorators to modify authentication behavior
 */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		@Inject(Reflector)
		private readonly reflector: Reflector,
		@Inject(MODULE_OPTIONS_TOKEN)
		private readonly options: AuthModuleOptions,
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

		// Robust header extraction across HTTP, GraphQL, and WS
		const headers =
			(request as any)?.headers ??
			(request as any)?.handshake?.headers ??
			{};

		const session: UserSession | null = await this.options.auth.api.getSession({
			headers: fromNodeHeaders(headers),
		});

		// Attach session and user to the request for all contexts
		(request as any).session = session;
		(request as any).user = session?.user ?? null;

		// Decorator checks
		const isPublic = this.reflector.getAllAndOverride<boolean>("PUBLIC", [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) return true;

		const isOptional = this.reflector.getAllAndOverride<boolean>("OPTIONAL", [
			context.getHandler(),
			context.getClass(),
		]);
		// Optional routes should always proceed, regardless of session or roles
		if (isOptional) return true;

		// Normalize context key: treat GraphQL as HTTP for error mapping
		const ctxType = context.getType();
		const gqlType = context.getType<GqlContextType>();
		const ctxKey: ContextType = gqlType === "graphql" ? "http" : ctxType;

		// Require session for non-optional routes
		if (!session) throw AuthContextErrorMap[ctxKey].UNAUTHORIZED();

		// Role-based access control
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

			if (!hasRole) throw AuthContextErrorMap[ctxKey].FORBIDDEN();
		}

		return true;
	}
}