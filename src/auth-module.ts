import { Inject, Logger, Module } from "@nestjs/common";
import type {
	DynamicModule,
	MiddlewareConsumer,
	ModuleMetadata,
	NestModule,
	OnModuleInit,
	Provider,
	Type,
} from "@nestjs/common";
import {
	APP_FILTER,
	DiscoveryModule,
	DiscoveryService,
	HttpAdapterHost,
	MetadataScanner,
} from "@nestjs/core";
import type { Auth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { createAuthMiddleware } from "better-auth/plugins";
import type { Request, Response } from "express";
import { APIErrorExceptionFilter } from "./api-error-exception-filter.ts";
import { AuthService } from "./auth-service.ts";
import { SkipBodyParsingMiddleware } from "./middlewares.ts";
import {
	AFTER_HOOK_KEY,
	AUTH_INSTANCE_KEY,
	AUTH_MODULE_OPTIONS_KEY,
	BEFORE_HOOK_KEY,
	HOOK_KEY,
} from "./symbols.ts";

/**
 * Configuration options for the AuthModule
 */
type AuthModuleOptions = {
	disableExceptionFilter?: boolean;
	disableTrustedOriginsCors?: boolean;
	disableBodyParser?: boolean;
};

/**
 * Factory for creating Auth instance and module options asynchronously
 */
export interface AuthModuleAsyncOptions
	extends Pick<ModuleMetadata, "imports"> {
	/**
	 * Factory function that returns an object with auth instance and optional module options
	 */
	useFactory: (...args: unknown[]) =>
		| Promise<{
				// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
				auth: any;
				options?: AuthModuleOptions;
		  }>
		| {
				// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
				auth: any;
				options?: AuthModuleOptions;
		  };
	/**
	 * Providers to inject into the factory function
	 */
	inject?: (string | symbol | Type<unknown>)[];
	/**
	 * Use an existing provider class
	 */
	useClass?: Type<{
		createAuthOptions():
			| Promise<{
					// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
					auth: any;
					options?: AuthModuleOptions;
			  }>
			| {
					// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
					auth: any;
					options?: AuthModuleOptions;
			  };
	}>;
	/**
	 * Use an existing provider
	 */
	useExisting?: Type<{
		createAuthOptions():
			| Promise<{
					// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
					auth: any;
					options?: AuthModuleOptions;
			  }>
			| {
					// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
					auth: any;
					options?: AuthModuleOptions;
			  };
	}>;
}

const HOOKS = [
	{ metadataKey: BEFORE_HOOK_KEY, hookType: "before" as const },
	{ metadataKey: AFTER_HOOK_KEY, hookType: "after" as const },
];

/**
 * NestJS module that integrates the Auth library with NestJS applications.
 * Provides authentication middleware, hooks, and exception handling.
 */
@Module({
	imports: [DiscoveryModule],
})
export class AuthModule implements NestModule, OnModuleInit {
	private readonly logger = new Logger(AuthModule.name);
	constructor(
		@Inject(AUTH_INSTANCE_KEY) private readonly auth: Auth,
		@Inject(DiscoveryService)
		private readonly discoveryService: DiscoveryService,
		@Inject(MetadataScanner)
		private readonly metadataScanner: MetadataScanner,
		@Inject(HttpAdapterHost)
		private readonly adapter: HttpAdapterHost,
		@Inject(AUTH_MODULE_OPTIONS_KEY)
		private readonly options: AuthModuleOptions,
	) {}

	onModuleInit(): void {
		// Setup hooks
		if (!this.auth.options.hooks) return;

		const providers = this.discoveryService
			.getProviders()
			.filter(
				({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype),
			);

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
		const trustedOrigins = this.auth.options.trustedOrigins;
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

		if (!this.options.disableBodyParser)
			consumer.apply(SkipBodyParsingMiddleware).forRoutes("*path");

		// Get basePath from options or use default
		let basePath = this.auth.options.basePath ?? "/api/auth";

		// Ensure basePath starts with /
		if (!basePath.startsWith("/")) {
			basePath = `/${basePath}`;
		}

		// Ensure basePath doesn't end with /
		if (basePath.endsWith("/")) {
			basePath = basePath.slice(0, -1);
		}

		const handler = toNodeHandler(this.auth);
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
		if (!this.auth.options.hooks) return;

		for (const { metadataKey, hookType } of HOOKS) {
			const hookPath = Reflect.getMetadata(metadataKey, providerMethod);
			if (!hookPath) continue;

			const originalHook = this.auth.options.hooks[hookType];
			this.auth.options.hooks[hookType] = createAuthMiddleware(async (ctx) => {
				if (originalHook) {
					await originalHook(ctx);
				}

				if (hookPath === ctx.path) {
					await providerMethod.apply(providerClass, [ctx]);
				}
			});
		}
	}

	/**
	 * Static factory method to create and configure the AuthModule.
	 * @param auth - The Auth instance to use
	 * @param options - Configuration options for the module
	 */
	static forRoot(
		// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
		auth: any,
		options: AuthModuleOptions = {},
	): DynamicModule {
		// Initialize hooks with an empty object if undefined
		// Without this initialization, the setupHook method won't be able to properly override hooks
		// It won't throw an error, but any hook functions we try to add won't be called
		auth.options.hooks = {
			...auth.options.hooks,
		};

		const providers: Provider[] = [
			{
				provide: AUTH_INSTANCE_KEY,
				useValue: auth,
			},
			{
				provide: AUTH_MODULE_OPTIONS_KEY,
				useValue: options,
			},
			AuthService,
		];

		if (!options.disableExceptionFilter) {
			providers.push({
				provide: APP_FILTER,
				useClass: APIErrorExceptionFilter,
			});
		}

		return {
			global: true,
			module: AuthModule,
			providers: providers,
			exports: [
				{
					provide: AUTH_INSTANCE_KEY,
					useValue: auth,
				},
				{
					provide: AUTH_MODULE_OPTIONS_KEY,
					useValue: options,
				},
				AuthService,
			],
		};
	}

	/**
	 * Static factory method to create and configure the AuthModule asynchronously.
	 * @param options - Async configuration options for the module
	 */
	static forRootAsync(options: AuthModuleAsyncOptions): {
		global: boolean;
		module: typeof AuthModule;
		imports?: ModuleMetadata["imports"];
		providers: Provider[];
		exports: (Provider | typeof AuthService)[];
	} {
		const asyncProviders = AuthModule.createAsyncProviders(options);

		return {
			global: true,
			module: AuthModule,
			imports: options.imports || [],
			providers: [...asyncProviders, AuthService],
			exports: [
				{
					provide: AUTH_INSTANCE_KEY,
					useExisting: AUTH_INSTANCE_KEY,
				},
				{
					provide: AUTH_MODULE_OPTIONS_KEY,
					useExisting: AUTH_MODULE_OPTIONS_KEY,
				},
				AuthService,
			],
		};
	}

	private static createAsyncProviders(
		options: AuthModuleAsyncOptions,
	): Provider[] {
		if (options.useFactory) {
			return [
				{
					provide: AUTH_INSTANCE_KEY,
					useFactory: async (...args: unknown[]) => {
						const result = await options.useFactory?.(...args);
						const auth = result.auth;

						// Initialize hooks with an empty object if undefined
						auth.options.hooks = {
							...auth.options.hooks,
						};

						return auth;
					},
					inject: options.inject || [],
				},
				{
					provide: AUTH_MODULE_OPTIONS_KEY,
					useFactory: async (...args: unknown[]) => {
						const result = await options.useFactory?.(...args);
						return result.options || {};
					},
					inject: options.inject || [],
				},
				AuthModule.createExceptionFilterProvider(),
			];
		}

		if (options.useClass) {
			return [
				{
					provide: options.useClass,
					useClass: options.useClass,
				},
				{
					provide: AUTH_INSTANCE_KEY,
					useFactory: async (configService: {
						createAuthOptions():
							| Promise<{
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  }>
							| {
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  };
					}) => {
						const result = await configService.createAuthOptions();
						const auth = result.auth;

						// Initialize hooks with an empty object if undefined
						auth.options.hooks = {
							...auth.options.hooks,
						};

						return auth;
					},
					inject: [options.useClass],
				},
				{
					provide: AUTH_MODULE_OPTIONS_KEY,
					useFactory: async (configService: {
						createAuthOptions():
							| Promise<{
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  }>
							| {
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  };
					}) => {
						const result = await configService.createAuthOptions();
						return result.options || {};
					},
					inject: [options.useClass],
				},
				AuthModule.createExceptionFilterProvider(),
			];
		}

		if (options.useExisting) {
			return [
				{
					provide: AUTH_INSTANCE_KEY,
					useFactory: async (configService: {
						createAuthOptions():
							| Promise<{
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  }>
							| {
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  };
					}) => {
						const result = await configService.createAuthOptions();
						const auth = result.auth;

						// Initialize hooks with an empty object if undefined
						auth.options.hooks = {
							...auth.options.hooks,
						};

						return auth;
					},
					inject: [options.useExisting],
				},
				{
					provide: AUTH_MODULE_OPTIONS_KEY,
					useFactory: async (configService: {
						createAuthOptions():
							| Promise<{
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  }>
							| {
									// biome-ignore lint/suspicious/noExplicitAny: TODO replace with auth type
									auth: any;
									options?: AuthModuleOptions;
							  };
					}) => {
						const result = await configService.createAuthOptions();
						return result.options || {};
					},
					inject: [options.useExisting],
				},
				AuthModule.createExceptionFilterProvider(),
			];
		}

		throw new Error(
			"Invalid async configuration. Must provide useFactory, useClass, or useExisting.",
		);
	}

	private static createExceptionFilterProvider(): Provider {
		return {
			provide: APP_FILTER,
			useFactory: (options: AuthModuleOptions) => {
				return options.disableExceptionFilter
					? null
					: new APIErrorExceptionFilter();
			},
			inject: [AUTH_MODULE_OPTIONS_KEY],
		};
	}
}
