import * as _nestjs_common from '@nestjs/common';
import { CustomDecorator, createParamDecorator, NestModule, OnModuleInit, MiddlewareConsumer, DynamicModule, CanActivate, ExecutionContext } from '@nestjs/common';
import { createAuthMiddleware, getSession } from 'better-auth/api';
import { Auth as Auth$1 } from 'better-auth';
import { DiscoveryService, MetadataScanner, HttpAdapterHost, Reflector } from '@nestjs/core';

/**
 * Allows unauthenticated (anonymous) access to a route or controller.
 * When applied, the AuthGuard will not perform authentication checks.
 */
declare const AllowAnonymous: () => CustomDecorator<string>;
/**
 * Marks a route or controller as having optional authentication.
 * When applied, the AuthGuard allows the request to proceed
 * even if no session is present.
 */
declare const OptionalAuth: () => CustomDecorator<string>;
/**
 * Specifies the roles required to access a route or controller.
 * The AuthGuard will check if the authenticated user's roles
 * include at least one of the specified roles.
 * @param roles - The roles required for access
 */
declare const Roles: (roles: string[]) => CustomDecorator;
/**
 * @deprecated Use AllowAnonymous() instead.
 */
declare const Public: () => CustomDecorator<string>;
/**
 * @deprecated Use OptionalAuth() instead.
 */
declare const Optional: () => CustomDecorator<string>;
/**
 * Parameter decorator that extracts the user session from the request.
 * Provides easy access to the authenticated user's session data in controller methods.
 * Works with both HTTP and GraphQL execution contexts.
 */
declare const Session: ReturnType<typeof createParamDecorator>;
/**
 * Represents the context object passed to hooks.
 * This type is derived from the parameters of the createAuthMiddleware function.
 */
type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
/**
 * Registers a method to be executed before a specific auth route is processed.
 * @param path - The auth route path that triggers this hook (must start with '/')
 */
declare const BeforeHook: (path?: `/${string}`) => CustomDecorator<symbol>;
/**
 * Registers a method to be executed after a specific auth route is processed.
 * @param path - The auth route path that triggers this hook (must start with '/')
 */
declare const AfterHook: (path?: `/${string}`) => CustomDecorator<symbol>;
/**
 * Class decorator that marks a provider as containing hook methods.
 * Must be applied to classes that use BeforeHook or AfterHook decorators.
 */
declare const Hook: () => ClassDecorator;

type Auth = any;
/**
 * NestJS module that integrates the Auth library with NestJS applications.
 * Provides authentication middleware, hooks, and exception handling.
 */
declare class AuthModule extends ConfigurableModuleClass implements NestModule, OnModuleInit {
    private readonly discoveryService;
    private readonly metadataScanner;
    private readonly adapter;
    private readonly options;
    private readonly logger;
    private readonly platform;
    constructor(discoveryService: DiscoveryService, metadataScanner: MetadataScanner, adapter: HttpAdapterHost, options: AuthModuleOptions);
    onModuleInit(): void;
    configure(consumer: MiddlewareConsumer): void;
    private createPlatformAwareHandler;
    private setupHooks;
    static forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule;
    static forRoot(options: typeof OPTIONS_TYPE): DynamicModule;
    /**
     * @deprecated Use the object-based signature: AuthModule.forRoot({ auth, ...options })
     */
    static forRoot(auth: Auth, options?: Omit<typeof OPTIONS_TYPE, "auth">): DynamicModule;
}

type AuthModuleOptions<A = Auth> = {
    auth: A;
    disableTrustedOriginsCors?: boolean;
    disableBodyParser?: boolean;
    disableGlobalAuthGuard?: boolean;
};
declare const ConfigurableModuleClass: _nestjs_common.ConfigurableModuleCls<AuthModuleOptions<any>, "forRoot", "create", {
    isGlobal: boolean;
    disableTrustedOriginsCors: boolean;
    disableBodyParser: boolean;
    disableGlobalAuthGuard: boolean;
}>;
declare const OPTIONS_TYPE: AuthModuleOptions<any> & Partial<{
    isGlobal: boolean;
    disableTrustedOriginsCors: boolean;
    disableBodyParser: boolean;
    disableGlobalAuthGuard: boolean;
}>;
declare const ASYNC_OPTIONS_TYPE: _nestjs_common.ConfigurableModuleAsyncOptions<AuthModuleOptions<any>, "create"> & Partial<{
    isGlobal: boolean;
    disableTrustedOriginsCors: boolean;
    disableBodyParser: boolean;
    disableGlobalAuthGuard: boolean;
}>;

/**
 * NestJS service that provides access to the Better Auth instance
 * Use generics to support auth instances extended by plugins
 */
declare class AuthService<T extends {
    api: T["api"];
} = Auth$1> {
    private readonly options;
    constructor(options: AuthModuleOptions<T>);
    /**
     * Returns the API endpoints provided by the auth instance
     */
    get api(): T["api"];
    /**
     * Returns the complete auth instance
     * Access this for plugin-specific functionality
     */
    get instance(): T;
}

/**
 * Type representing a valid user session after authentication
 */
type BaseUserSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getSession>>>>;
type UserSession = BaseUserSession & {
    user: BaseUserSession["user"] & {
        role?: string | string[];
        [key: string]: any;
    };
    [key: string]: any;
};
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
declare class AuthGuard implements CanActivate {
    private readonly reflector;
    private readonly options;
    constructor(reflector: Reflector, options: AuthModuleOptions);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private getHeadersFromRequest;
}

declare const BEFORE_HOOK_KEY: symbol;
declare const AFTER_HOOK_KEY: symbol;
declare const HOOK_KEY: symbol;
declare const AUTH_MODULE_OPTIONS_KEY: symbol;

export { AFTER_HOOK_KEY, AUTH_MODULE_OPTIONS_KEY, AfterHook, AllowAnonymous, AuthGuard, AuthModule, AuthService, BEFORE_HOOK_KEY, BeforeHook, HOOK_KEY, Hook, Optional, OptionalAuth, Public, Roles, Session };
export type { Auth, AuthHookContext, BaseUserSession, UserSession };
