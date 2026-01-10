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
import { GraphQLError, GraphQLErrorOptions } from "graphql";

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
	session: BaseUserSession["session"] & {
		activeOrganizationId?: string;
	};
};

const AuthErrorType = {
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
} as const;

/**
 * Lazy-load WsException to make @nestjs/websockets an optional dependency
 */
// biome-ignore lint/suspicious/noExplicitAny: WsException type comes from optional @nestjs/websockets dependency
let WsException: any;
function getWsException() {
	if (!WsException) {
		try {
			WsException = require("@nestjs/websockets").WsException;
		} catch (_error) {
			throw new Error(
				"@nestjs/websockets is required for WebSocket support. Please install it: npm install @nestjs/websockets @nestjs/platform-socket.io",
			);
		}
	}
	return WsException;
}

const AuthContextErrorMap: Record<
	ContextType | "graphql",
	Record<keyof typeof AuthErrorType, (args?: unknown) => Error>
> = {
	http: {
		UNAUTHORIZED: (args) =>
			new UnauthorizedException(
				args ?? {
					code: "UNAUTHORIZED",
					message: "Unauthorized",
				},
			),
		FORBIDDEN: (args) =>
			new ForbiddenException(
				args ?? {
					code: "FORBIDDEN",
					message: "Insufficient permissions",
				},
			),
	},
	graphql: {
		UNAUTHORIZED: (args) => {
			if (typeof args === "string") {
				return new GraphQLError(args);
			} else if (typeof args === "object") {
				return new GraphQLError(
					// biome-ignore lint: if `message` is not set, a default is already in place.
					(args as any)?.message ?? "Forbidden",
					args as GraphQLErrorOptions,
				);
			}

			return new GraphQLError("Unauthorized");
		},
		FORBIDDEN: (args) => {
			if (typeof args === "string") {
				return new GraphQLError(args);
			} else if (typeof args === "object") {
				return new GraphQLError(
					// biome-ignore lint: if `message` is not set, a default is already in place.
					(args as any)?.message ?? "Forbidden",
					args as GraphQLErrorOptions,
				);
			}

			return new GraphQLError("Forbidden");
		},
	},
	ws: {
		UNAUTHORIZED: (args) => {
			const WsExceptionClass = getWsException();
			return new WsExceptionClass(args ?? "UNAUTHORIZED");
		},
		FORBIDDEN: (args) => {
			const WsExceptionClass = getWsException();
			return new WsExceptionClass(args ?? "FORBIDDEN");
		},
	},
	rpc: {
		UNAUTHORIZED: () => new Error("UNAUTHORIZED"),
		FORBIDDEN: () => new Error("FORBIDDEN"),
	},
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
		const session: UserSession | null = await this.options.auth.api.getSession({
			headers: fromNodeHeaders(
				request.headers || request?.handshake?.headers || [],
			),
		});

		request.session = session;
		request.user = session?.user ?? null; // useful for observability tools like Sentry

		const isPublic = this.reflector.getAllAndOverride<boolean>("PUBLIC", [
			context.getHandler(),
			context.getClass(),
		]);

		if (isPublic) return true;

		const isOptional = this.reflector.getAllAndOverride<boolean>("OPTIONAL", [
			context.getHandler(),
			context.getClass(),
		]);

		if (!session && isOptional) return true;

		const ctxType = context.getType();
		if (!session) throw AuthContextErrorMap[ctxType].UNAUTHORIZED();

		const requiredRoles = this.reflector.getAllAndOverride<string[]>("ROLES", [
			context.getHandler(),
			context.getClass(),
		]);

		if (requiredRoles && requiredRoles.length > 0) {
			const headers = fromNodeHeaders(
				request.headers || request?.handshake?.headers || [],
			);
			const hasRole = await this.checkUserHasRequiredRole(
				session,
				headers,
				requiredRoles,
			);

			if (!hasRole) throw AuthContextErrorMap[ctxType].FORBIDDEN();
		}

		return true;
	}

	/**
	 * Checks if a role value matches any of the required roles
	 * Handles both array and comma-separated string role formats
	 * @param role - The role value to check (string, array, or undefined)
	 * @param requiredRoles - Array of roles that grant access
	 * @returns True if the role matches any required role
	 */
	private matchesRequiredRole(
		role: string | string[] | undefined,
		requiredRoles: string[],
	): boolean {
		if (!role) return false;

		if (Array.isArray(role)) {
			return role.some((r) => requiredRoles.includes(r));
		}

		if (typeof role === "string") {
			return role.split(",").some((r) => requiredRoles.includes(r.trim()));
		}

		return false;
	}

	/**
	 * Fetches the user's role within an organization from the member table
	 * Uses Better Auth's organization plugin API if available
	 * @param headers - The request headers containing session cookies
	 * @returns The member's role in the organization, or undefined if not found
	 */
	private async getMemberRoleInOrganization(
		headers: Headers,
	): Promise<string | undefined> {
		try {
			// Better Auth organization plugin exposes getActiveMemberRole or getActiveMember API
			// biome-ignore lint/suspicious/noExplicitAny: Better Auth API types vary by plugin configuration
			const authApi = this.options.auth.api as any;

			// Try getActiveMemberRole first (most direct for our use case)
			if (typeof authApi.getActiveMemberRole === "function") {
				const result = await authApi.getActiveMemberRole({ headers });
				return result?.role;
			}

			// Fallback: try getActiveMember
			if (typeof authApi.getActiveMember === "function") {
				const member = await authApi.getActiveMember({ headers });
				return member?.role;
			}

			return undefined;
		} catch {
			// Organization plugin not available or API call failed
			return undefined;
		}
	}

	/**
	 * Checks if the user has any of the required roles using OR logic
	 * Checks both user.role AND organization member role (if in org context)
	 * Access is granted if the user has the required role in EITHER location
	 * @param session - The user's session
	 * @param headers - The request headers for API calls
	 * @param requiredRoles - Array of roles that grant access
	 * @returns True if the user has any required role
	 */
	private async checkUserHasRequiredRole(
		session: UserSession,
		headers: Headers,
		requiredRoles: string[],
	): Promise<boolean> {
		// Check user-level role (existing behavior)
		if (this.matchesRequiredRole(session.user.role, requiredRoles)) {
			return true;
		}

		// Check organization member role if in organization context
		const activeOrgId = session.session?.activeOrganizationId;
		if (activeOrgId) {
			const memberRole = await this.getMemberRoleInOrganization(headers);
			if (this.matchesRequiredRole(memberRole, requiredRoles)) {
				return true;
			}
		}

		return false;
	}
}
