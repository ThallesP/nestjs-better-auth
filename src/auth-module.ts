import type {
	DynamicModule,
	MiddlewareConsumer,
	NestModule,
	OnApplicationBootstrap,
} from "@nestjs/common";
import { Inject, Logger, Module } from "@nestjs/common";
import {
	APP_GUARD,
	DiscoveryModule,
	DiscoveryService,
	HttpAdapterHost,
	MetadataScanner,
} from "@nestjs/core";
import type { GenericEndpointContext } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { createAuthMiddleware } from "better-auth/plugins";
import type { Request, Response } from "express";
import { AuthGuard } from "./auth-guard.ts";
import {
	type ASYNC_OPTIONS_TYPE,
	type AuthModuleOptions,
	ConfigurableModuleClass,
	MODULE_OPTIONS_TOKEN,
	type OPTIONS_TYPE,
} from "./auth-module-definition.ts";
import { AuthService } from "./auth-service.ts";
import type {
	DatabaseHookMetadata,
	DatabaseHookModel,
	DatabaseHookOperation,
} from "./decorators.ts";
import { SkipBodyParsingMiddleware } from "./middlewares.ts";
import {
	AFTER_HOOK_KEY,
	BEFORE_HOOK_KEY,
	DATABASE_HOOK_KEY,
	DATABASE_HOOK_METADATA_KEY,
	HOOK_KEY,
} from "./symbols.ts";

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
	implements NestModule, OnApplicationBootstrap
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
		private readonly options: AuthModuleOptions,
	) {
		super();
	}

	onApplicationBootstrap(): void {
		const providers = this.discoveryService
			.getProviders()
			.filter(
				({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype),
			);

		const databaseHookProviders = this.discoveryService
			.getProviders()
			.filter(
				({ metatype }) =>
					metatype && Reflect.getMetadata(DATABASE_HOOK_KEY, metatype),
			);

		const hasHookProviders = providers.length > 0;
		const hasDatabaseHookProviders = databaseHookProviders.length > 0;
		const hooksConfigured =
			typeof this.options.auth?.options?.hooks === "object";
		const databaseHooksConfigured =
			typeof this.options.auth?.options?.databaseHooks === "object";

		if (hasHookProviders && !hooksConfigured)
			throw new Error(
				"Detected @Hook providers but Better Auth 'hooks' are not configured. Add 'hooks: {}' to your betterAuth(...) options.",
			);

		if (hasDatabaseHookProviders && !databaseHooksConfigured)
			throw new Error(
				"Detected @DatabaseHook providers but Better Auth 'databaseHooks' are not configured. Add 'databaseHooks: {}' to your betterAuth(...) options.",
			);

		if (hooksConfigured) {
			for (const provider of providers) {
				if (!provider.instance) continue;
				const providerPrototype = Object.getPrototypeOf(provider.instance);
				const methods =
					this.metadataScanner.getAllMethodNames(providerPrototype);

				for (const method of methods) {
					const providerMethod = providerPrototype[method];
					this.setupHooks(providerMethod, provider.instance);
				}
			}
		}

		if (!databaseHooksConfigured) return;

		for (const provider of databaseHookProviders) {
			if (!provider.instance) continue;
			const providerPrototype = Object.getPrototypeOf(provider.instance);
			const methods = this.metadataScanner.getAllMethodNames(providerPrototype);

			for (const method of methods) {
				const providerMethod = providerPrototype[method];
				this.setupDatabaseHooks(providerMethod, provider.instance, method);
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

		// Get basePath from options or use default
		let basePath = this.options.auth.options.basePath ?? "/api/auth";

		// Ensure basePath starts with /
		if (!basePath.startsWith("/")) {
			basePath = `/${basePath}`;
		}

		// Ensure basePath doesn't end with /
		if (basePath.endsWith("/")) {
			basePath = basePath.slice(0, -1);
		}

		if (!this.options.disableBodyParser) {
			consumer.apply(SkipBodyParsingMiddleware(basePath)).forRoutes("*path");
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
		providerInstance: Record<string, unknown>,
		methodName?: string,
	) {
		const databaseHooks = this.options.auth.options.databaseHooks as
			| DatabaseHooksMap
			| undefined;
		if (!databaseHooks) return;

		const metadata = this.getDatabaseHookMetadata(
			providerMethod,
			providerInstance,
			methodName,
		);
		if (!metadata) return;

		const { model, operation, stage } = metadata;

		if (!databaseHooks[model]) {
			databaseHooks[model] = {} as DatabaseModelHooks;
		}
		const modelHooks = databaseHooks[model] as DatabaseModelHooks;

		if (!modelHooks[operation]) {
			modelHooks[operation] = {};
		}
		const operationHooks = modelHooks[operation] as DatabaseHookStageHandlers;

		if (stage === "before") {
			const originalHook = operationHooks.before;
			const boundProviderMethod = providerMethod.bind(
				providerInstance,
			) as DatabaseBeforeHookFn;

			operationHooks.before = this.composeBeforeDatabaseHook(
				originalHook,
				boundProviderMethod,
			);
			return;
		}

		const originalHook = operationHooks.after;
		const boundProviderMethod = providerMethod.bind(
			providerInstance,
		) as DatabaseAfterHookFn;

		operationHooks.after = this.composeAfterDatabaseHook(
			originalHook,
			boundProviderMethod,
		);
	}

	private composeBeforeDatabaseHook(
		originalHook: DatabaseBeforeHookFn | undefined,
		providerMethod: DatabaseBeforeHookFn,
	): DatabaseBeforeHookFn {
		return async (data, ctx) => {
			let payload = data;
			let previousResult: DatabaseBeforeHookResult | undefined;

			if (originalHook) {
				const originalResult = await originalHook(data, ctx);
				if (originalResult === false) return false;

				if (this.isDatabaseHookDataResult(originalResult)) {
					payload = originalResult.data;
					previousResult = originalResult;
				} else if (originalResult !== undefined) {
					return originalResult;
				}
			}

			const providerResult = await providerMethod(payload, ctx);

			if (providerResult === false) return false;
			if (this.isDatabaseHookDataResult(providerResult)) {
				return providerResult;
			}

			if (providerResult !== undefined) {
				return providerResult;
			}

			return previousResult;
		};
	}

	private composeAfterDatabaseHook(
		originalHook: DatabaseAfterHookFn | undefined,
		providerMethod: DatabaseAfterHookFn,
	): DatabaseAfterHookFn {
		return async (data, ctx) => {
			if (originalHook) {
				await originalHook(data, ctx);
			}
			await providerMethod(data, ctx);
		};
	}

	private getDatabaseHookMetadata(
		providerMethod: (...args: unknown[]) => unknown,
		providerInstance: Record<string, unknown>,
		methodName?: string,
	): DatabaseHookMetadata | undefined {
		const direct = Reflect.getMetadata(
			DATABASE_HOOK_METADATA_KEY,
			providerMethod,
		) as DatabaseHookMetadata | undefined;
		if (direct) return direct;

		if (!methodName) return undefined;

		const prototype = Object.getPrototypeOf(providerInstance);
		return Reflect.getMetadata(
			DATABASE_HOOK_METADATA_KEY,
			prototype,
			methodName,
		) as DatabaseHookMetadata | undefined;
	}

	private isDatabaseHookDataResult(
		result: unknown,
	): result is { data: Record<string, unknown> } {
		return typeof result === "object" && result !== null && "data" in result;
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

type DatabaseHookStageHandlers = {
	before?: DatabaseBeforeHookFn;
	after?: DatabaseAfterHookFn;
};

type DatabaseModelHooks = Partial<
	Record<DatabaseHookOperation, DatabaseHookStageHandlers>
>;

type DatabaseHooksMap = Partial<Record<DatabaseHookModel, DatabaseModelHooks>>;

type DatabaseBeforeHookResult =
	| false
	| undefined
	| { data: Record<string, unknown> };

type DatabaseBeforeHookFn = (
	data: Record<string, unknown>,
	ctx?: GenericEndpointContext,
) => Promise<DatabaseBeforeHookResult>;

type DatabaseAfterHookFn = (
	data: Record<string, unknown>,
	ctx?: GenericEndpointContext,
) => Promise<void>;
