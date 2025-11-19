import type {
	CanActivate,
	ContextType,
	ExecutionContext,
} from "@nestjs/common";
import {
	ForbiddenException,
	Inject,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { WsException } from "@nestjs/websockets";
import type { getSession } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import {
	type AuthModuleOptions,
	MODULE_OPTIONS_TOKEN,
} from "./auth-module-definition.ts";
import { getRequestFromContext } from "./utils.ts";

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

const AuthErrorType = {
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
} as const;

type ExtendedContextType = ContextType | "graphql";

const AuthContextErrorMap: Record<
	ExtendedContextType,
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
	ws: {
		UNAUTHORIZED: (args) => new WsException(args ?? "UNAUTHORIZED"),
		FORBIDDEN: (args) => new WsException(args ?? "FORBIDDEN"),
	},
	rpc: {
		UNAUTHORIZED: () => new Error("UNAUTHORIZED"),
		FORBIDDEN: () => new Error("FORBIDDEN"),
	},
	graphql: {} as never,
};

AuthContextErrorMap.graphql = AuthContextErrorMap.http;

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

		if (isOptional && !session) return true;

		const ctxType = (context.getType() as ExtendedContextType) ?? "http";
		const errorFactory =
			AuthContextErrorMap[ctxType] ?? AuthContextErrorMap.http;

		if (!session) throw errorFactory.UNAUTHORIZED();

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
				hasRole = userRole
					.split(",")
					.some((role) => requiredRoles.includes(role));
			}

			if (!hasRole) throw errorFactory.FORBIDDEN();
		}

		return true;
	}
}
