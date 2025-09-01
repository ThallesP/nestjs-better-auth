import { ConfigurableModuleBuilder } from "@nestjs/common";
import type { Auth } from "./auth-module.ts";

export type AuthModuleOptions<A = Auth> = {
	auth: A;
	disableExceptionFilter?: boolean;
	disableTrustedOriginsCors?: boolean;
	disableBodyParser?: boolean;
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
				disableExceptionFilter: false,
				disableTrustedOriginsCors: false,
				disableBodyParser: false,
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
