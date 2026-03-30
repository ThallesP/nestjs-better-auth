import { SetMetadata, createParamDecorator } from "@nestjs/common";
import type { CustomDecorator, ExecutionContext } from "@nestjs/common";
import type { createAuthMiddleware } from "better-auth/api";
import {
	AFTER_HOOK_KEY,
	BEFORE_HOOK_KEY,
	DATABASE_HOOK_KEY,
	DB_HOOK_METHOD_KEY,
	HOOK_KEY,
} from "./symbols.ts";
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
 * Specifies the user-level roles required to access a route or controller.
 * Checks ONLY the `user.role` field (from Better Auth's admin plugin).
 * Does NOT check organization member roles.
 *
 * Use this for system-wide admin protection (e.g., superadmin routes).
 *
 * @param roles - The roles required for access
 * @example
 * ```ts
 * @Roles(['admin'])  // Only users with user.role = 'admin' can access
 * ```
 */
export const Roles = (roles: string[]): CustomDecorator =>
	SetMetadata("ROLES", roles);

/**
 * Specifies the organization-level roles required to access a route or controller.
 * Checks ONLY the organization member role (from Better Auth's organization plugin).
 * Requires an active organization (`activeOrganizationId` in session).
 *
 * Use this for organization-scoped protection (e.g., org admin routes).
 *
 * @param roles - The organization roles required for access
 * @example
 * ```ts
 * @OrgRoles(['owner', 'admin'])  // Only org owners/admins can access
 * ```
 */
export const OrgRoles = (roles: string[]): CustomDecorator =>
	SetMetadata("ORG_ROLES", roles);

/**
 * Type for permission checks - maps resource names to arrays of actions
 */
export type PermissionCheck = Record<string, string[]>;

/**
 * Options for the UserHasPermission decorator
 */
export interface UserHasPermissionOptions {
	/**
	 * The user ID to check permissions for (optional, defaults to current user)
	 */
	userId?: string;
	/**
	 * The role to check permissions for (server-only, optional)
	 */
	role?: string;
	/**
	 * A single permission to check. Must use this, or permissions.
	 */
	permission?: PermissionCheck;
	/**
	 * Multiple permissions to check. Must use this, or permission.
	 */
	permissions?: PermissionCheck;
}

/**
 * Specifies the permissions required to access a route or controller.
 * Checks user permissions using Better Auth's access control system.
 *
 * Use this for fine-grained permission-based access control.
 *
 * @param options - Permission check options
 * @example
 * ```ts
 * @UserHasPermission({ permission: { project: ["create", "update"] } })
 * @UserHasPermission({ permissions: { project: ["create"], sale: ["create"] } })
 * @UserHasPermission({ role: "admin", permission: { project: ["create"] } })
 * ```
 */
export const UserHasPermission = (
	options: UserHasPermissionOptions,
): CustomDecorator => {
	if (!options.permission && !options.permissions) {
		throw new Error(
			"UserHasPermission: Either 'permission' or 'permissions' must be provided",
		);
	}
	return SetMetadata("USER_HAS_PERMISSION", options);
};

/**
 * Options for the MemberHasPermission decorator
 */
export interface MemberHasPermissionOptions {
	/**
	 * The permissions to check. Must match the structure in your organization access control.
	 */
	permissions: PermissionCheck;
}

/**
 * Specifies the organization member permissions required to access a route or controller.
 * Checks organization member permissions using Better Auth's organization plugin access control.
 * Requires an active organization (`activeOrganizationId` in session).
 *
 * Use this for fine-grained permission-based access control within organizations.
 *
 * @param options - Permission check options
 * @example
 * ```ts
 * @MemberHasPermission({ permissions: { project: ["create", "update"] } })
 * @MemberHasPermission({ permissions: { project: ["create"], sale: ["create"] } })
 * ```
 */
export const MemberHasPermission = (
	options: MemberHasPermissionOptions,
): CustomDecorator => {
	if (!options.permissions) {
		throw new Error("MemberHasPermission: 'permissions' must be provided");
	}
	return SetMetadata("MEMBER_HAS_PERMISSION", options);
};

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
	createParamDecorator(
		async (_data: unknown, context: ExecutionContext): Promise<unknown> => {
			const request = await getRequestFromContext(context);
			return request.session;
		},
	);
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

/**
 * The four Better Auth base model names that support database hooks.
 */
export type DatabaseHookModel = "user" | "session" | "account" | "verification";

/**
 * The database operations that support hooks.
 */
export type DatabaseHookOperation = "create" | "update" | "delete";

/**
 * The timing of a database hook relative to the operation.
 */
export type DatabaseHookTiming = "before" | "after";

/**
 * Metadata stored on methods decorated with database hook decorators.
 */
export interface DatabaseHookMethodMetadata {
	model: DatabaseHookModel;
	operation: DatabaseHookOperation;
	timing: DatabaseHookTiming;
}

/**
 * Class decorator that marks a provider as containing database hook methods.
 * Must be applied to classes that use BeforeCreate, AfterCreate, BeforeUpdate,
 * AfterUpdate, BeforeDelete, or AfterDelete decorators.
 *
 * @example
 * ```ts
 * @DatabaseHook()
 * @Injectable()
 * class UserDatabaseHook {
 *   @BeforeCreate('user')
 *   async handleBeforeCreate(data: Record<string, unknown>) {
 *     return { data: { ...data, role: 'member' } };
 *   }
 * }
 * ```
 */
export const DatabaseHook = (): ClassDecorator =>
	SetMetadata(DATABASE_HOOK_KEY, true);

function createDatabaseHookMethodDecorator(
	operation: DatabaseHookOperation,
	timing: DatabaseHookTiming,
) {
	return (model: DatabaseHookModel): MethodDecorator =>
		SetMetadata(DB_HOOK_METHOD_KEY, {
			model,
			operation,
			timing,
		} satisfies DatabaseHookMethodMetadata);
}

/**
 * Registers a method to be executed before a model record is created.
 * The method can return `{ data: ... }` to modify the data, `false` to abort, or void to continue.
 *
 * @param model - The Better Auth model to hook into
 */
export const BeforeCreate = createDatabaseHookMethodDecorator(
	"create",
	"before",
);

/**
 * Registers a method to be executed after a model record is created.
 * The method receives the persisted entity for side effects.
 *
 * @param model - The Better Auth model to hook into
 */
export const AfterCreate = createDatabaseHookMethodDecorator("create", "after");

/**
 * Registers a method to be executed before a model record is updated.
 * The method can return `{ data: ... }` to modify the data, `false` to abort, or void to continue.
 *
 * @param model - The Better Auth model to hook into
 */
export const BeforeUpdate = createDatabaseHookMethodDecorator(
	"update",
	"before",
);

/**
 * Registers a method to be executed after a model record is updated.
 * The method receives the updated entity for side effects.
 *
 * @param model - The Better Auth model to hook into
 */
export const AfterUpdate = createDatabaseHookMethodDecorator("update", "after");

/**
 * Registers a method to be executed before a model record is deleted.
 * The method can return `false` to abort the deletion, or void to continue.
 *
 * @param model - The Better Auth model to hook into
 */
export const BeforeDelete = createDatabaseHookMethodDecorator(
	"delete",
	"before",
);

/**
 * Registers a method to be executed after a model record is deleted.
 * The method receives the deleted entity for side effects.
 *
 * @param model - The Better Auth model to hook into
 */
export const AfterDelete = createDatabaseHookMethodDecorator("delete", "after");
