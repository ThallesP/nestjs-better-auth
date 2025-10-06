import { Inject, Logger, Module } from "@nestjs/common";
import type {
  DynamicModule,
  MiddlewareConsumer,
  NestModule,
  OnModuleInit,
} from "@nestjs/common";
import {
  DiscoveryModule,
  DiscoveryService,
  HttpAdapterHost,
  MetadataScanner,
  APP_GUARD,
} from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { createAuthMiddleware } from "better-auth/plugins";
import type { Request, Response } from "express";
import {
  type ASYNC_OPTIONS_TYPE,
  type AuthModuleOptions,
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  type OPTIONS_TYPE,
} from "./auth-module-definition.ts";
import { AuthService } from "./auth-service.ts";
import { SkipBodyParsingMiddleware } from "./middlewares.ts";
import { AFTER_HOOK_KEY, BEFORE_HOOK_KEY, HOOK_KEY } from "./symbols.ts";
import { AuthGuard } from "./auth-guard.ts";

const HOOKS = [
  { metadataKey: BEFORE_HOOK_KEY, hookType: "before" as const },
  { metadataKey: AFTER_HOOK_KEY, hookType: "after" as const },
];

// biome-ignore lint/suspicious/noExplicitAny: i don't want to cause issues/breaking changes between different ways of setting up better-auth and even versions
export type Auth = any;

/**
 * NestJS module that integrates the Auth library with NestJS applications.
 * Provides authentication middleware, hooks, and exception handling.
 */
@Module({
  imports: [DiscoveryModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule
  extends ConfigurableModuleClass
  implements NestModule, OnModuleInit
{
  private readonly logger = new Logger(AuthModule.name);
  constructor(
    @Inject(DiscoveryService)
    private readonly discoveryService: DiscoveryService,
    @Inject(MetadataScanner)
    private readonly metadataScanner: MetadataScanner,
    @Inject(HttpAdapterHost)
    private readonly adapter: HttpAdapterHost,
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: AuthModuleOptions
  ) {
    super();
  }

  onModuleInit(): void {
    const providers = this.discoveryService
      .getProviders()
      .filter(
        ({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype)
      );

    const hasHookProviders = providers.length > 0;
    const hooks = this.options.auth?.options?.hooks;
    // Check if hooks is a valid object (not null, not undefined)
    const hooksConfigured = hooks && typeof hooks === "object";

    // Only throw error if there are hook providers but hooks is not properly configured
    if (hasHookProviders && !hooksConfigured) {
      throw new Error(
        "Detected @Hook providers but Better Auth 'hooks' are not configured. Add 'hooks: {}' to your betterAuth(...) options."
      );
    }

    // Return early if no hook providers - no need to set up hooks
    if (!hasHookProviders) return;

    for (const provider of providers) {
      const providerPrototype = Object.getPrototypeOf(provider.instance);
      const methods = this.metadataScanner.getAllMethodNames(providerPrototype);

      for (const method of methods) {
        const providerMethod = providerPrototype[method];
        this.setupHooks(providerMethod, provider.instance);
      }
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    const trustedOrigins = this.options.auth?.options?.trustedOrigins;

    // Handle CORS configuration based on trustedOrigins
    if (trustedOrigins && !this.options.disableTrustedOriginsCors) {
      // function-based trustedOrigins requires a Request (from web-apis) object to evaluate,
      // which is not available in NestJS (we only have an express Request object)
      // if we ever need this, take a look at better-call which shows an implementation for this
      if (!Array.isArray(trustedOrigins)) {
        throw new Error(
          "Function-based trustedOrigins not supported in NestJS. Use string array or disable CORS with disableTrustedOriginsCors: true."
        );
      }

      this.adapter.httpAdapter.enableCors({
        origin: trustedOrigins,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
      });
    }

    if (!this.options.disableBodyParser)
      consumer.apply(SkipBodyParsingMiddleware).forRoutes("*path");

    // Get basePath from options or use default
    let basePath = this.options.auth?.options?.basePath ?? "/api/auth";

    // Ensure basePath starts with /
    if (!basePath.startsWith("/")) {
      basePath = `/${basePath}`;
    }

    // Ensure basePath doesn't end with /
    if (basePath.endsWith("/")) {
      basePath = basePath.slice(0, -1);
    }

    const handler = toNodeHandler(this.options.auth);
    this.adapter.httpAdapter
      .getInstance()
      // little hack to ignore any global prefix
      // for now i'll just not support a global prefix
      .use(`${basePath}/*path`, (req: Request, res: Response) => {
        return handler(req, res);
      });
    this.logger.log(`AuthModule initialized BetterAuth on '${basePath}/*'`);
  }

  private setupHooks(
    providerMethod: (...args: unknown[]) => unknown,
    providerInstance: unknown
  ) {
    const hooks = this.options.auth.options.hooks;

    for (const { metadataKey, hookType } of HOOKS) {
      const hasHook = Reflect.hasMetadata(metadataKey, providerMethod);
      if (!hasHook) continue;

      const hookPath = Reflect.getMetadata(metadataKey, providerMethod);

      const originalHook = hooks[hookType];
      hooks[hookType] = createAuthMiddleware(async (ctx) => {
        if (originalHook) await originalHook(ctx);

        if (hookPath && hookPath !== ctx.path) return;

        await providerMethod.apply(providerInstance, [ctx]);
      });
    }
  }

  static forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
    const module = super.forRootAsync(options);
    return this.addGuardProvider(module, options.disableGlobalAuthGuard);
  }

  static forRoot(options: typeof OPTIONS_TYPE): DynamicModule;
  /**
   * @deprecated Use the object-based signature: AuthModule.forRoot({ auth, ...options })
   */
  static forRoot(
    auth: Auth,
    options?: Omit<typeof OPTIONS_TYPE, "auth">
  ): DynamicModule;
  static forRoot(
    arg1: Auth | typeof OPTIONS_TYPE,
    arg2?: Omit<typeof OPTIONS_TYPE, "auth">
  ): DynamicModule {
    // Check if using new format: forRoot({ auth, ...options })
    const isNewFormat =
      typeof arg1 === "object" && arg1 !== null && "auth" in arg1;

    const normalizedOptions: typeof OPTIONS_TYPE = isNewFormat
      ? (arg1 as typeof OPTIONS_TYPE)
      : { ...(arg2 ?? {}), auth: arg1 };

    const module = super.forRoot(normalizedOptions);
    return this.addGuardProvider(
      module,
      normalizedOptions.disableGlobalAuthGuard
    );
  }

  /**
   * Adds the global AuthGuard provider if not disabled
   */
  private static addGuardProvider(
    module: DynamicModule,
    disableGuard?: boolean
  ): DynamicModule {
    if (disableGuard) return module;

    return {
      ...module,
      providers: [
        ...(module.providers ?? []),
        {
          provide: APP_GUARD,
          useClass: AuthGuard,
        },
      ],
    };
  }
}
