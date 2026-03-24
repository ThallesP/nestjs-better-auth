import { ConfigurableModuleBuilder } from "@nestjs/common";
import type { Auth } from "./auth-module.ts";
import type {
	JsonBodyParserOptions,
	UrlencodedBodyParserOptions,
} from "./body-parser-options.ts";

export type AuthModuleJsonBodyParserOptions = JsonBodyParserOptions & {
	enabled?: boolean;
};

export type AuthModuleUrlencodedBodyParserOptions =
	UrlencodedBodyParserOptions & {
		enabled?: boolean;
	};

export type AuthModuleBodyParserOptions = {
	json?: AuthModuleJsonBodyParserOptions;
	urlencoded?: AuthModuleUrlencodedBodyParserOptions;
	/**
	 * When set to `true`, attaches the raw request buffer to `req.rawBody`.
	 *
	 * This is useful for webhook signature verification that requires the raw,
	 * unparsed request body.
	 *
	 * **Important:** Since this library disables NestJS's built-in body parser,
	 * NestJS's `rawBody: true` option in `NestFactory.create()` has no effect.
	 * Use this option instead.
	 *
	 * @default false
	 */
	rawBody?: boolean;
};

export type AuthModuleMiddleware = (
	// biome-ignore lint/suspicious/noExplicitAny: public middleware should not force an adapter-specific request type
	req: any,
	// biome-ignore lint/suspicious/noExplicitAny: public middleware should not force an adapter-specific response type
	res: any,
	next: (error?: unknown) => void,
) => void | Promise<void>;

export type AuthModuleOptions<A = Auth> = {
	auth: A;
	disableTrustedOriginsCors?: boolean;
	/**
	 * @deprecated Use `bodyParser.json.enabled` and `bodyParser.urlencoded.enabled` instead.
	 */
	disableBodyParser?: boolean;
	/**
	 * @deprecated Use `bodyParser.rawBody` instead.
	 */
	enableRawBodyParser?: boolean;
	bodyParser?: AuthModuleBodyParserOptions;
	middleware?: AuthModuleMiddleware;
};

export const MODULE_OPTIONS_TOKEN = Symbol("AUTH_MODULE_OPTIONS");

export const { ConfigurableModuleClass, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
	new ConfigurableModuleBuilder<AuthModuleOptions>({
		optionsInjectionToken: MODULE_OPTIONS_TOKEN,
	})
		.setClassMethodName("forRoot")
		.setExtras(
			{
				isGlobal: true,
				disableGlobalAuthGuard: false,
				disableControllers: false,
			},
			(def, extras) => {
				return {
					...def,
					exports: [MODULE_OPTIONS_TOKEN],
					global: extras.isGlobal,
				};
			},
		)
		.build();
