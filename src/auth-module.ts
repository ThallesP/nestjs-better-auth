import { Inject, Logger, Module } from "@nestjs/common";
import type {
	DynamicModule,
	MiddlewareConsumer,
	NestModule,
	OnModuleInit,
} from "@nestjs/common";
import {
	ApplicationConfig,
	DiscoveryModule,
	DiscoveryService,
	HttpAdapterHost,
	MetadataScanner,
} from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { createAuthMiddleware } from "better-auth/api";
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
import { normalizePath } from "@nestjs/common/utils/shared.utils.js";
import { mapToExcludeRoute } from "@nestjs/core/middleware/utils.js";
import { MESSAGES } from "@nestjs/core/constants.js";

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
	private readonly basePath: string;

	constructor(
		@Inject(ApplicationConfig)
		private readonly applicationConfig: ApplicationConfig,
		@Inject(DiscoveryService)
		private readonly discoveryService: DiscoveryService,
		@Inject(MetadataScanner)
		private readonly metadataScanner: MetadataScanner,
		@Inject(HttpAdapterHost)
		private readonly adapter: HttpAdapterHost,
		@Inject(MODULE_OPTIONS_TOKEN)
		private readonly options: AuthModuleOptions,
	) {
		super();

		// Get basePath from options or use default
		// - Ensure basePath starts with /
		// - Ensure basePath doesn't end with /
		this.basePath = normalizePath(
			this.options.auth.options.basePath ?? "/api/auth",
		);

		// Add exclusion to global prefix for Better Auth routes
		const globalPrefixOptions = this.applicationConfig.getGlobalPrefixOptions();
		this.applicationConfig.setGlobalPrefixOptions({
			exclude: [
				...(globalPrefixOptions.exclude ?? []),
				...mapToExcludeRoute([this.basePath, `${this.basePath}/*path`]),
			],
		});
	}

	onModuleInit(): void {
		const providers = this.discoveryService
			.getProviders()
			.filter(
				({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype),
			);

		const hasHookProviders = providers.length > 0;
		const hooksConfigured =
			typeof this.options.auth?.options?.hooks === "object";

		if (hasHookProviders && !hooksConfigured)
			throw new Error(
				"Detected @Hook providers but Better Auth 'hooks' are not configured. Add 'hooks: {}' to your betterAuth(...) options.",
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
		// function-based trustedOrigins requires a Request (from web-apis) object to evaluate, which is not available in NestJS (we only have a express Request object)
		// if we ever need this, take a look at better-call which show an implementation for this
		const isNotFunctionBased = trustedOrigins && Array.isArray(trustedOrigins);

		if (!this.options.disableTrustedOriginsCors && isNotFunctionBased) {
			this.adapter.httpAdapter.enableCors({
				origin: trustedOrigins,
				methods: ["GET", "POST", "PUT", "DELETE"],
				credentials: true,
			});
		} else if (
			trustedOrigins &&
			!this.options.disableTrustedOriginsCors &&
			!isNotFunctionBased
		)
			throw new Error(
				"Function-based trustedOrigins not supported in NestJS. Use string array or disable CORS with disableTrustedOriginsCors: true.",
			);

		if (!this.options.disableBodyParser) {
			consumer
				.apply(
					SkipBodyParsingMiddleware({
						basePath: this.basePath,
						enableRawBodyParser: this.options.enableRawBodyParser,
					}),
				)
				.forRoutes("*path");
		}

		const handler = toNodeHandler(this.options.auth);
		const registerAuthRoute = (path: string) => {
			this.adapter.httpAdapter.all(path, async (req: Request, res: Response) => {
				const request = req as Request & {
					raw?: Request;
					body?: unknown;
					baseUrl?: string;
					url?: string;
					method?: string;
					headers: Request["headers"];
					socket?: Request["socket"];
				};
				const response = res as Response & { raw?: Response };
				const requestForHandler = Object.assign(request.raw ?? request, {
					baseUrl: request.baseUrl ?? "",
					body: request.body,
					headers: request.headers,
					method: request.method,
					socket: request.raw?.socket ?? request.socket,
					url: request.url ?? request.raw?.url,
				});
				const responseForHandler = response.raw ?? response;

				try {
					if (this.options.middleware) {
						await new Promise<void>((resolve, reject) => {
							try {
								this.options.middleware?.(req, res, (error?: unknown) => {
									if (error) {
										reject(error);
										return;
									}
									resolve();
								});
							} catch (error) {
								reject(error);
							}
						});

					if (this.adapter.httpAdapter.isHeadersSent(res)) {
						return;
					}
				}

					await handler(requestForHandler as Request, responseForHandler);
				} catch (error) {
					this.logger.error(
						error && typeof error === "object" && "message" in error
							? String(error.message)
							: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
						error,
					);

					if (!this.adapter.httpAdapter.isHeadersSent(res)) {
						this.adapter.httpAdapter.reply(
							res,
							{
								statusCode: 500,
								message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
							},
							500,
						);
					}
				}
			});
		};

		const authWildcardPath =
			this.adapter.httpAdapter.getType() === "fastify"
				? `${this.basePath}/*`
				: `${this.basePath}/*path`;

		registerAuthRoute(this.basePath);
		registerAuthRoute(authWildcardPath);
		this.logger.log(`AuthModule initialized BetterAuth on '${this.basePath}'`);
	}

	private setupHooks(
		providerMethod: (...args: unknown[]) => unknown,
		providerClass: { new (...args: unknown[]): unknown },
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
				},
			);
		}
	}

	static forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
		const forRootAsyncResult = super.forRootAsync(options);
		const { module } = forRootAsyncResult;

		return {
			...forRootAsyncResult,
			module: options.disableControllers
				? AuthModuleWithoutControllers
				: module,
			controllers: options.disableControllers
				? []
				: forRootAsyncResult.controllers,
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
		options?: Omit<typeof OPTIONS_TYPE, "auth">,
	): DynamicModule;
	static forRoot(
		arg1: Auth | typeof OPTIONS_TYPE,
		arg2?: Omit<typeof OPTIONS_TYPE, "auth">,
	): DynamicModule {
		const normalizedOptions: typeof OPTIONS_TYPE =
			typeof arg1 === "object" && arg1 !== null && "auth" in (arg1 as object)
				? (arg1 as typeof OPTIONS_TYPE)
				: ({ ...(arg2 ?? {}), auth: arg1 as Auth } as typeof OPTIONS_TYPE);

		const forRootResult = super.forRoot(normalizedOptions);
		const { module } = forRootResult;

		return {
			...forRootResult,
			module: normalizedOptions.disableControllers
				? AuthModuleWithoutControllers
				: module,
			controllers: normalizedOptions.disableControllers
				? []
				: forRootResult.controllers,
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

class AuthModuleWithoutControllers extends AuthModule {
	configure(): void {
		return;
	}
}
