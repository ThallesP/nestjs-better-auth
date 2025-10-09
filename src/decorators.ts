import { SetMetadata, createParamDecorator } from "@nestjs/common";
import type { CustomDecorator, ExecutionContext } from "@nestjs/common";
import type { createAuthMiddleware } from "better-auth/api";
import { AFTER_HOOK_KEY, BEFORE_HOOK_KEY, HOOK_KEY } from "./symbols.ts";
import { getRequestFromContext } from "./utils.ts";

/**
 * Allows unauthenticated (anonymous) access to a route or controller.
 * When applied, the AuthGuard will not perform authentication checks.
 */
export const AllowAnonymous = (): CustomDecorator<string> =>
	SetMetadata("PUBLIC", true);

/**
 * Marks a route or controller as having optional authentication.
 * When applied, the AuthGuard allows the request to proceed
 * even if no session is present.
 */
export const OptionalAuth = (): CustomDecorator<string> =>
	SetMetadata("OPTIONAL", true);

/**
 * Specifies the roles required to access a route or controller.
 * The AuthGuard will check if the authenticated user's roles
 * include at least one of the specified roles.
 * @param roles - The roles required for access
 */
export const Roles = (roles: string[]): CustomDecorator =>
	SetMetadata("ROLES", roles);

/**
 * @deprecated Use AllowAnonymous() instead.
 */
export const Public = AllowAnonymous;

/**
 * @deprecated Use OptionalAuth() instead.
 */
export const Optional = OptionalAuth;

/**
 * Parameter decorator that extracts the user session from the request.
 * Provides easy access to the authenticated user's session data in controller methods.
 * Works with both HTTP and GraphQL execution contexts.
 */
export const Session: ReturnType<typeof createParamDecorator> =
	createParamDecorator((_data: unknown, context: ExecutionContext): unknown => {
		const request = getRequestFromContext(context);
		return request.session;
	});
/**
 * Represents the context object passed to hooks.
 * This type is derived from the parameters of the createAuthMiddleware function.
 */
export type AuthHookContext = Parameters<
	Parameters<typeof createAuthMiddleware>[0]
>[0];

/**
 * Registers a method to be executed before a specific auth route is processed.
 * @param path - The auth route path that triggers this hook (must start with '/')
 */
export const BeforeHook = (path?: `/${string}`): CustomDecorator<symbol> =>
	SetMetadata(BEFORE_HOOK_KEY, path);

/**
 * Registers a method to be executed after a specific auth route is processed.
 * @param path - The auth route path that triggers this hook (must start with '/')
 */
export const AfterHook = (path?: `/${string}`): CustomDecorator<symbol> =>
	SetMetadata(AFTER_HOOK_KEY, path);

/**
 * Class decorator that marks a provider as containing hook methods.
 * Must be applied to classes that use BeforeHook or AfterHook decorators.
 */
export const Hook = (): ClassDecorator => SetMetadata(HOOK_KEY, true);
