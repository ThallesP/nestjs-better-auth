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
	 * Supports both HTTP and GraphQL execution contexts
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

		if (!session)
			throw new UnauthorizedException({
				code: "UNAUTHORIZED",
				message: "Unauthorized",
			});

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
				throw new ForbiddenException({
					code: "FORBIDDEN",
					message: "Insufficient permissions",
				});
			}
		}

		return true;
	}
}
