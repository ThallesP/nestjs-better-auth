import type { CustomDecorator, ExecutionContext } from "@nestjs/common";
import { SetMetadata, createParamDecorator } from "@nestjs/common";
import type {
	Account,
	Session as BetterAuthSession,
	GenericEndpointContext,
	User,
	Verification,
} from "better-auth";
import type { createAuthMiddleware } from "better-auth/api";
import {
	AFTER_HOOK_KEY,
	BEFORE_HOOK_KEY,
	DATABASE_HOOK_KEY,
	DATABASE_HOOK_METADATA_KEY,
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

const DATABASE_MODELS = ["user", "session", "account", "verification"] as const;

export type DatabaseHookModel = (typeof DATABASE_MODELS)[number];
export type DatabaseHookOperation = "create" | "update";
export type DatabaseHookStage = "before" | "after";

type DatabaseHookEntityMap = {
	user: User & Record<string, unknown>;
	session: BetterAuthSession & Record<string, unknown>;
	account: Account & Record<string, unknown>;
	verification: Verification & Record<string, unknown>;
};

export type DatabaseHookMetadata = {
	model: DatabaseHookModel;
	operation: DatabaseHookOperation;
	stage: DatabaseHookStage;
};

export type DatabaseHookContext = GenericEndpointContext;

export type DatabaseHookPayload<
	Model extends DatabaseHookModel,
	Operation extends DatabaseHookOperation,
	Stage extends DatabaseHookStage,
> = Stage extends "after"
	? DatabaseHookEntityMap[Model]
	: Operation extends "create"
		? DatabaseHookEntityMap[Model]
		: Partial<DatabaseHookEntityMap[Model]>;

export type DatabaseHookBeforeResult<Model extends DatabaseHookModel> =
	| false
	| undefined
	| {
			data: Partial<DatabaseHookEntityMap[Model]> & Record<string, unknown>;
	  };

export type DatabaseHookHandler<
	Model extends DatabaseHookModel,
	Operation extends DatabaseHookOperation,
	Stage extends DatabaseHookStage,
> = (
	data: DatabaseHookPayload<Model, Operation, Stage>,
	ctx?: DatabaseHookContext,
) => Promise<Stage extends "before" ? DatabaseHookBeforeResult<Model> : void>;

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
 * Class decorator that marks a provider as containing Better Auth database hook methods.
 * Must be applied to classes that use BeforeDatabaseHook or AfterDatabaseHook decorators.
 */
export const DatabaseHook = (): ClassDecorator =>
	SetMetadata(DATABASE_HOOK_KEY, true);

function createDatabaseHookDecorator(stage: DatabaseHookStage) {
	return function databaseHookDecorator<
		Model extends DatabaseHookModel,
		Operation extends DatabaseHookOperation,
	>(model: Model, operation: Operation): MethodDecorator {
		const decorator: MethodDecorator = (target, propertyKey, descriptor) => {
			const handler = descriptor?.value as
				| DatabaseHookHandler<Model, Operation, typeof stage>
				| undefined;

			if (!handler) {
				throw new Error(
					`@${
						stage === "before" ? "Before" : "After"
					}DatabaseHook can only be applied to methods`,
				);
			}

			const metadata: DatabaseHookMetadata = {
				model,
				operation,
				stage,
			};

			Reflect.defineMetadata(DATABASE_HOOK_METADATA_KEY, metadata, handler);

			if (propertyKey !== undefined) {
				Reflect.defineMetadata(
					DATABASE_HOOK_METADATA_KEY,
					metadata,
					target,
					propertyKey,
				);
			}
			return descriptor;
		};

		return decorator;
	};
}

/**
 * Registers a method to be executed before a database operation is processed.
 * @param model - The database model to observe (user, session, account, verification)
 * @param operation - The database operation to target (create or update)
 */
export const BeforeDatabaseHook = createDatabaseHookDecorator("before");

/**
 * Registers a method to be executed after a database operation is processed.
 * @param model - The database model to observe (user, session, account, verification)
 * @param operation - The database operation to target (create or update)
 */
export const AfterDatabaseHook = createDatabaseHookDecorator("after");
