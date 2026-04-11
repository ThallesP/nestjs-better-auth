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
import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import {
	type ASYNC_OPTIONS_TYPE,
	type AuthModuleOptions,
	ConfigurableModuleClass,
	MODULE_OPTIONS_TOKEN,
	type OPTIONS_TYPE,
} from "./auth-module-definition.ts";
import { AuthService } from "./auth-service.ts";
import { configureFastifyBodyParser } from "./fastify-body-parser.ts";
import {
	handleFastifyTrustedOriginsCors,
} from "./fastify-trusted-origins-cors.ts";
import {
	SkipBodyParsingMiddleware,
	getNodeRequest,
	getNodeResponse,
	matchesBasePath,
	resolveBodyParserOptions,
} from "./middlewares.ts";
import {
	AFTER_DATABASE_HOOK_KEY,
	AFTER_HOOK_KEY,
	BEFORE_DATABASE_HOOK_KEY,
	BEFORE_HOOK_KEY,
	DATABASE_HOOK_KEY,
	HOOK_KEY,
} from "./symbols.ts";
import type { DatabaseHookModel, DatabaseHookOperation } from "./decorators.ts";
import { AuthGuard } from "./auth-guard.ts";
import { APP_GUARD } from "@nestjs/core";
import { normalizePath } from "@nestjs/common/utils/shared.utils.js";
import { mapToExcludeRoute } from "@nestjs/core/middleware/utils.js";

const HOOKS = [
	{ metadataKey: BEFORE_HOOK_KEY, hookType: "before" as const },
	{ metadataKey: AFTER_HOOK_KEY, hookType: "after" as const },
];

const DATABASE_HOOKS = [
	{ metadataKey: BEFORE_DATABASE_HOOK_KEY, hookType: "before" as const },
	{ metadataKey: AFTER_DATABASE_HOOK_KEY, hookType: "after" as const },
];

type AdapterRequest = ExpressRequest & {
	raw?: ExpressRequest;
	originalUrl?: string;
	url?: string;
	baseUrl?: string;
};

type AdapterResponse = ExpressResponse & {
	raw?: ExpressResponse;
};

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
		const hookProviders = this.discoveryService
			.getProviders()
			.filter(
				({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype),
			);

		const hasHookProviders = hookProviders.length > 0;
		const hooksConfigured =
			typeof this.options.auth?.options?.hooks === "object";

		if (hasHookProviders && !hooksConfigured)
			throw new Error(
				"Detected @Hook providers but Better Auth 'hooks' are not configured. Add 'hooks: {}' to your betterAuth(...) options.",
			);

		if (hooksConfigured) {
			for (const provider of hookProviders) {
				const providerPrototype = Object.getPrototypeOf(provider.instance);
				const methods =
					this.metadataScanner.getAllMethodNames(providerPrototype);

				for (const method of methods) {
					const providerMethod = providerPrototype[method];
					this.setupHooks(providerMethod, provider.instance);
				}
			}
		}

		// Database hooks discovery
		const databaseHookProviders = this.discoveryService
			.getProviders()
			.filter(
				({ metatype }) =>
					metatype && Reflect.getMetadata(DATABASE_HOOK_KEY, metatype),
			);

		const hasDatabaseHookProviders = databaseHookProviders.length > 0;
		const databaseHooksConfigured =
			typeof this.options.auth?.options?.databaseHooks === "object";

		if (hasDatabaseHookProviders && !databaseHooksConfigured)
			throw new Error(
				"Detected @DatabaseHook providers but Better Auth 'databaseHooks' is not configured. Add an empty 'databaseHooks: {}' object to your betterAuth(...) options.",
			);

		if (!hasDatabaseHookProviders) return;

		for (const provider of databaseHookProviders) {
			const providerPrototype = Object.getPrototypeOf(provider.instance);
			const methods = this.metadataScanner.getAllMethodNames(providerPrototype);

			for (const method of methods) {
				const providerMethod = providerPrototype[method];
				this.setupDatabaseHooks(providerMethod, provider.instance);
			}
		}
	}

	configure(consumer: MiddlewareConsumer): void {
		const adapterType = this.adapter.httpAdapter.getType();
		const trustedOrigins = this.options.auth.options.trustedOrigins;
		const bodyParserOptions = resolveBodyParserOptions(this.options);
		// function-based trustedOrigins requires a Request (from web-apis) object to evaluate, which is not available in NestJS (we only have a express Request object)
		// if we ever need this, take a look at better-call which show an implementation for this
		const isNotFunctionBased = trustedOrigins && Array.isArray(trustedOrigins);

		if (!this.options.disableTrustedOriginsCors && isNotFunctionBased) {
			if (adapterType !== "fastify") {
				this.adapter.httpAdapter.enableCors({
					origin: trustedOrigins,
					methods: ["GET", "POST", "PUT", "DELETE"],
					credentials: true,
				});
			}
		} else if (
			trustedOrigins &&
			!this.options.disableTrustedOriginsCors &&
			!isNotFunctionBased
		)
			throw new Error(
				"Function-based trustedOrigins not supported in NestJS. Use string array or disable CORS with disableTrustedOriginsCors: true.",
			);

		if ("disableBodyParser" in this.options) {
			this.logger.warn(
				"`disableBodyParser` is deprecated. Use `bodyParser.json.enabled` and `bodyParser.urlencoded.enabled` instead.",
			);
		}

		if ("enableRawBodyParser" in this.options) {
			this.logger.warn(
				"`enableRawBodyParser` is deprecated. Use `bodyParser.rawBody` instead.",
			);
		}

		if (adapterType !== "fastify") {
			consumer
				.apply(
					SkipBodyParsingMiddleware({
						basePath: this.basePath,
						bodyParser: bodyParserOptions,
					}),
				)
				.forRoutes("*path");
		}

		if (adapterType === "fastify") {
			configureFastifyBodyParser(this.adapter.httpAdapter, bodyParserOptions);
		}

		const handler = toNodeHandler(this.options.auth);
		const authHandler = (
			req: AdapterRequest,
			res: AdapterResponse,
			next: () => void,
		) => {
			if (!matchesBasePath(req, this.basePath)) {
				next();
				return;
			}

			if (
				adapterType === "fastify" &&
				!this.options.disableTrustedOriginsCors &&
				isNotFunctionBased &&
				handleFastifyTrustedOriginsCors(req, res, {
					trustedOrigins,
				})
			) {
				return;
			}

			const nodeReq = getNodeRequest(req);
			const nodeRes = getNodeResponse(res);

			if (this.options.middleware) {
				return this.options.middleware(req, res, () =>
					handler(nodeReq, nodeRes),
				);
			}
			return handler(nodeReq, nodeRes);
		};

		this.adapter.httpAdapter.use(
			(
				// biome-ignore lint/suspicious/noExplicitAny: adapter request type should not leak into the public declaration
				req: any,
				// biome-ignore lint/suspicious/noExplicitAny: adapter response type should not leak into the public declaration
				res: any,
				next: () => void,
			) => authHandler(req as AdapterRequest, res as AdapterResponse, next),
		);
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

	private setupDatabaseHooks(
		providerMethod: (...args: unknown[]) => unknown,
		providerClass: { new (...args: unknown[]): unknown },
	) {
		if (!this.options.auth.options.databaseHooks) return;

		for (const { metadataKey, hookType } of DATABASE_HOOKS) {
			if (!Reflect.hasMetadata(metadataKey, providerMethod)) continue;

			const { model, operation } = Reflect.getMetadata(
				metadataKey,
				providerMethod,
			) as { model: DatabaseHookModel; operation: DatabaseHookOperation };

			const databaseHooks = this.options.auth.options.databaseHooks;

			// Ensure the nested structure exists: databaseHooks[model][operation]
			databaseHooks[model] ??= {};
			databaseHooks[model][operation] ??= {};

			const originalHook = databaseHooks[model][operation][hookType];
			databaseHooks[model][operation][hookType] = async (
				...args: unknown[]
			) => {
				if (originalHook) {
					await originalHook(...args);
				}
				return providerMethod.apply(providerClass, args);
			};
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
