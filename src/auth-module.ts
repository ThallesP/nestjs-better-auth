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
import { APP_GUARD } from "@nestjs/core";
import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPlatform } from "./utils.ts";

const HOOKS = [
  { metadataKey: BEFORE_HOOK_KEY, hookType: "before" as const },
  { metadataKey: AFTER_HOOK_KEY, hookType: "after" as const },
];

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
  private readonly platform: "express" | "fastify";

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
    this.platform = getPlatform(this.adapter.httpAdapter);
  }

  onModuleInit(): void {
    const providers = this.discoveryService
      .getProviders()
      .filter(
        ({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype)
      );

    const hasHookProviders = providers.length > 0;
    const hooksConfigured =
      typeof this.options.auth?.options?.hooks === "object";

    if (hasHookProviders && !hooksConfigured)
      throw new Error(
        "Detected @Hook providers but Better Auth 'hooks' are not configured. Add 'hooks: {}' to your betterAuth(...) options."
      );

    if (!hooksConfigured) return;

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
    const trustedOrigins = this.options.auth.options.trustedOrigins;
    const isNotFunctionBased = trustedOrigins && Array.isArray(trustedOrigins);

    // Handle CORS
    if (!this.options.disableTrustedOriginsCors && isNotFunctionBased) {
      if (this.platform === "express") {
        this.adapter.httpAdapter.enableCors({
          origin: trustedOrigins,
          methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          credentials: true,
        });
      } else {
        this.logger.warn(
          "Fastify CORS setup should be configured during adapter creation if needed."
        );
      }
    } else if (
      trustedOrigins &&
      !this.options.disableTrustedOriginsCors &&
      !isNotFunctionBased
    ) {
      throw new Error(
        "Function-based trustedOrigins not supported in NestJS. Use string array or disable CORS."
      );
    }

    if (!this.options.disableBodyParser && this.platform === "express") {
      consumer.apply(SkipBodyParsingMiddleware).forRoutes("*path");
    }

    if (this.platform === "fastify") {
      const fastifyInstance =
        this.adapter.httpAdapter.getInstance() as FastifyInstance;
      const hasMultipart =
        !!fastifyInstance.hasContentTypeParser &&
        fastifyInstance.hasContentTypeParser("multipart/form-data");

      if (!hasMultipart && typeof fastifyInstance.register === "function") {
        try {
          fastifyInstance.register(fastifyMultipart, {
            limits: { fileSize: 10_000_000 },
          });
        } catch (err) {
          this.logger.warn(
            "Failed to register @fastify/multipart automatically. Please install it manually if you use form-data."
          );
        }
      }
    }

    let basePath = this.options.auth.options.basePath ?? "/api/auth";
    if (!basePath.startsWith("/")) basePath = `/${basePath}`;
    if (basePath.endsWith("/")) basePath = basePath.slice(0, -1);

    const handler = toNodeHandler(this.options.auth);
    this.createPlatformAwareHandler(basePath, handler);

    this.logger.log(
      `AuthModule initialized BetterAuth on '${basePath}/*' with ${this.platform}`
    );
  }

  private createPlatformAwareHandler(basePath: string, handler: any) {
    if (this.platform === "express") {
      this.adapter.httpAdapter
        .getInstance()
        .use(`${basePath}/*path`, (req: Request, res: Response) =>
          handler(req, res)
        );
    } else {
      const fastifyInstance =
        this.adapter.httpAdapter.getInstance() as FastifyInstance;

      fastifyInstance.route({
        method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        url: `${basePath}/*`,
        onRequest: async (request: FastifyRequest, reply: FastifyReply) => {
          reply.hijack();
          const req = request.raw;
          const res = reply.raw;
          await handler(req, res);
          throw new Error("__HIJACKED__");
        },
        onError: async (
          request: FastifyRequest,
          reply: FastifyReply,
          error: Error
        ) => {
          if (error.message === "__HIJACKED__") {
            return;
          }
          throw error;
        },
        handler: async () => {
          throw new Error("Should not reach handler");
        },
      });
    }
  }

  private setupHooks(
    providerMethod: (...args: unknown[]) => unknown,
    providerClass: { new (...args: unknown[]): unknown }
  ) {
    if (!this.options.auth.options.hooks) return;

    for (const { metadataKey, hookType } of HOOKS) {
      const hasHook = Reflect.hasMetadata(metadataKey, providerMethod);
      if (!hasHook) continue;

      const hookPath = Reflect.getMetadata(metadataKey, providerMethod);

      const originalHook = this.options.auth.options.hooks[hookType];
      this.options.auth.options.hooks[hookType] = createAuthMiddleware(
        async (ctx) => {
          if (originalHook) {
            await originalHook(ctx);
          }

          if (hookPath && hookPath !== ctx.path) return;

          await providerMethod.apply(providerClass, [ctx]);
        }
      );
    }
  }

  static forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
    const forRootAsyncResult = super.forRootAsync(options);
    return {
      ...super.forRootAsync(options),
      providers: [
        ...(forRootAsyncResult.providers ?? []),
        ...(!options.disableGlobalAuthGuard
          ? [
              {
                provide: APP_GUARD,
                useClass: AuthGuard,
              },
            ]
          : []),
      ],
    };
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
    const normalizedOptions: typeof OPTIONS_TYPE =
      typeof arg1 === "object" && arg1 !== null && "auth" in (arg1 as object)
        ? (arg1 as typeof OPTIONS_TYPE)
        : ({ ...(arg2 ?? {}), auth: arg1 as Auth } as typeof OPTIONS_TYPE);

    const forRootResult = super.forRoot(normalizedOptions);

    return {
      ...forRootResult,
      providers: [
        ...(forRootResult.providers ?? []),
        ...(!normalizedOptions.disableGlobalAuthGuard
          ? [
              {
                provide: APP_GUARD,
                useClass: AuthGuard,
              },
            ]
          : []),
      ],
    };
  }
}
