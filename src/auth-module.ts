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
import { parse as parseQs } from "qs";
import {
	type ASYNC_OPTIONS_TYPE,
	type AuthModuleOptions,
	ConfigurableModuleClass,
	MODULE_OPTIONS_TOKEN,
	type OPTIONS_TYPE,
} from "./auth-module-definition.ts";
import { AuthService } from "./auth-service.ts";
import type {
	BodyParserLimit,
	BodyParserTypeMatcher,
} from "./body-parser-options.ts";
import {
	type ResolvedJsonBodyParserOptions,
	type ResolvedUrlencodedBodyParserOptions,
	SkipBodyParsingMiddleware,
	getNodeRequest,
	getNodeResponse,
	matchesBasePath,
	resolveBodyParserOptions,
} from "./middlewares.ts";
import { AFTER_HOOK_KEY, BEFORE_HOOK_KEY, HOOK_KEY } from "./symbols.ts";
import { AuthGuard } from "./auth-guard.ts";
import { APP_GUARD } from "@nestjs/core";
import { normalizePath } from "@nestjs/common/utils/shared.utils.js";
import { mapToExcludeRoute } from "@nestjs/core/middleware/utils.js";

const HOOKS = [
	{ metadataKey: BEFORE_HOOK_KEY, hookType: "before" as const },
	{ metadataKey: AFTER_HOOK_KEY, hookType: "after" as const },
];

type FastifyUseBodyParser = NonNullable<
	HttpAdapterHost["httpAdapter"]["useBodyParser"]
>;
type FastifyBodyParserDone = (err: Error | null, body?: unknown) => void;
type FastifyBodyParserHandler = (
	body: Buffer,
	done: FastifyBodyParserDone,
) => void;

function resolveFastifyParserType(
	type: BodyParserTypeMatcher | undefined,
	fallback: string | string[],
) {
	if (type === undefined) {
		return fallback;
	}

	if (typeof type === "function") {
		throw new Error(
			"Function-based bodyParser type matchers are not supported with the Fastify adapter.",
		);
	}

	return type;
}

function resolveFastifyBodyLimit(limit: BodyParserLimit | undefined) {
	if (limit === undefined) {
		return undefined;
	}

	if (typeof limit === "number") {
		return limit;
	}

	const normalizedLimit = limit.trim().toLowerCase();
	const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/.exec(normalizedLimit);

	if (!match) {
		throw new Error(
			`Unsupported Fastify body parser limit '${limit}'. Use a number of bytes or a string like '2mb'.`,
		);
	}

	const units = {
		b: 1,
		kb: 1024,
		mb: 1024 * 1024,
		gb: 1024 * 1024 * 1024,
	};
	const value = Number.parseFloat(match[1]);
	const unit = (match[2] ?? "b") as keyof typeof units;

	return Math.floor(value * units[unit]);
}

function parseFastifyJsonBody(
	body: Buffer,
	options: Pick<ResolvedJsonBodyParserOptions, "reviver" | "strict">,
) {
	const rawBody = body.toString("utf8");
	const trimmedBody = rawBody.trim();

	if (trimmedBody.length === 0) {
		return {};
	}

	if (options.strict !== false) {
		const firstCharacter = trimmedBody[0];

		if (firstCharacter !== "{" && firstCharacter !== "[") {
			throw new SyntaxError("Invalid JSON payload");
		}
	}

	return JSON.parse(rawBody, options.reviver);
}

function parseSimpleFormBody(body: string, parameterLimit?: number) {
	const params = new URLSearchParams(body);
	const result: Record<string, string | string[]> = {};
	let count = 0;

	for (const [key, value] of params.entries()) {
		count += 1;

		if (parameterLimit !== undefined && count > parameterLimit) {
			break;
		}

		const currentValue = result[key];

		if (currentValue === undefined) {
			result[key] = value;
			continue;
		}

		result[key] = Array.isArray(currentValue)
			? [...currentValue, value]
			: [currentValue, value];
	}

	return result;
}

function parseFastifyUrlencodedBody(
	body: Buffer,
	options: Pick<
		ResolvedUrlencodedBodyParserOptions,
		| "extended"
		| "parameterLimit"
		| "charsetSentinel"
		| "defaultCharset"
		| "interpretNumericEntities"
		| "depth"
	>,
) {
	const encoding = options.defaultCharset === "iso-8859-1" ? "latin1" : "utf8";
	const rawBody = body.toString(encoding);

	if (options.extended === false) {
		return parseSimpleFormBody(rawBody, options.parameterLimit);
	}

	return parseQs(rawBody, {
		charset: options.defaultCharset === "iso-8859-1" ? "iso-8859-1" : "utf-8",
		charsetSentinel: options.charsetSentinel,
		depth: options.depth,
		interpretNumericEntities: options.interpretNumericEntities,
		parameterLimit: options.parameterLimit,
	});
}

function registerFastifyBodyParser(
	useBodyParser: FastifyUseBodyParser | undefined,
	{
		type,
		fallbackType,
		rawBody,
		limit,
		parse,
	}: {
		type: BodyParserTypeMatcher | undefined;
		fallbackType: string;
		rawBody: boolean;
		limit: BodyParserLimit | undefined;
		parse: FastifyBodyParserHandler;
	},
) {
	useBodyParser?.(
		resolveFastifyParserType(type, fallbackType),
		rawBody,
		{
			bodyLimit: resolveFastifyBodyLimit(limit),
		},
		(_req: unknown, body: Buffer, done: FastifyBodyParserDone) => {
			parse(body, done);
		},
	);
}

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
		const adapterType = this.adapter.httpAdapter.getType();
		const trustedOrigins = this.options.auth.options.trustedOrigins;
		const bodyParserOptions = resolveBodyParserOptions(this.options);
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
			this.configureFastifyBodyParser(bodyParserOptions);
		}

		const handler = toNodeHandler(this.options.auth);
		this.adapter.httpAdapter.use(
			(req: Request, res: Response, next: () => void) => {
				if (!matchesBasePath(req, this.basePath)) {
					next();
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
			},
		);
		this.logger.log(`AuthModule initialized BetterAuth on '${this.basePath}'`);
	}

	private configureFastifyBodyParser(
		bodyParserOptions: ReturnType<typeof resolveBodyParserOptions>,
	): void {
		const fastifyInstance = this.adapter.httpAdapter.getInstance() as {
			removeContentTypeParser?: (contentType: string | string[]) => void;
		};
		const useBodyParser = this.adapter.httpAdapter.useBodyParser?.bind(
			this.adapter.httpAdapter,
		);

		fastifyInstance.removeContentTypeParser?.([
			"application/json",
			"application/x-www-form-urlencoded",
		]);

		registerFastifyBodyParser(useBodyParser, {
			type: bodyParserOptions.json.type,
			fallbackType: "application/json",
			rawBody: bodyParserOptions.json.rawBody,
			limit: bodyParserOptions.json.limit,
			parse: (body, done) => {
				if (!bodyParserOptions.json.enabled) {
					done(null, undefined);
					return;
				}

				try {
					done(null, parseFastifyJsonBody(body, bodyParserOptions.json));
				} catch (error) {
					done(error as Error);
				}
			},
		});

		registerFastifyBodyParser(useBodyParser, {
			type: bodyParserOptions.urlencoded.type,
			fallbackType: "application/x-www-form-urlencoded",
			rawBody: bodyParserOptions.json.rawBody,
			limit: bodyParserOptions.urlencoded.limit,
			parse: (body, done) => {
				if (!bodyParserOptions.urlencoded.enabled) {
					done(null, undefined);
					return;
				}

				try {
					done(
						null,
						parseFastifyUrlencodedBody(body, bodyParserOptions.urlencoded),
					);
				} catch (error) {
					done(error as Error);
				}
			},
		});
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
