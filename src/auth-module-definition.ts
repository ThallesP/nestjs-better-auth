import { ConfigurableModuleBuilder } from "@nestjs/common";
import type { Auth } from "./auth-module.ts";

export type AuthModuleOptions<A = Auth> = {
	auth: A;
	disableTrustedOriginsCors?: boolean;
	disableBodyParser?: boolean;
	disableGlobalAuthGuard?: boolean;
	disableControllers?: boolean;
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
				disableTrustedOriginsCors: false,
				disableBodyParser: false,
				disableGlobalAuthGuard: false,
				disableControllers: false,
			},
			(def, extras) => {
				// Merge extras into the options provider
				const optionsProvider = def.providers?.find(
					(p) =>
						typeof p === "object" &&
						"provide" in p &&
						p.provide === MODULE_OPTIONS_TOKEN,
				);

				if (
					optionsProvider &&
					typeof optionsProvider !== "function" &&
					"useValue" in optionsProvider
				) {
					optionsProvider.useValue = {
						...optionsProvider.useValue,
						...extras,
					};
				} else if (
					optionsProvider &&
					typeof optionsProvider !== "function" &&
					"useFactory" in optionsProvider
				) {
					const originalFactory = optionsProvider.useFactory;
					optionsProvider.useFactory = (...args: unknown[]) => {
						const result =
							typeof originalFactory === "function"
								? originalFactory(...args)
								: originalFactory;
						return {
							...result,
							...extras,
						};
					};
				}

				return {
					...def,
					exports: [MODULE_OPTIONS_TOKEN],
					global: extras.isGlobal,
				};
			},
		)
		.build();
