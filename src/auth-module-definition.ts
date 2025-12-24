import { ConfigurableModuleBuilder } from "@nestjs/common";
import type { Auth } from "./auth-module.ts";
import type { Request, Response, NextFunction } from "express";

export type AuthModuleOptions<A = Auth> = {
	auth: A;
	disableTrustedOriginsCors?: boolean;
	disableBodyParser?: boolean;
	middleware?: (req: Request, res: Response, next: NextFunction) => void;
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
