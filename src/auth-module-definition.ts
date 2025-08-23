import { ConfigurableModuleBuilder } from "@nestjs/common";

export type AuthModuleOptions = {
	auth: any;
	disableExceptionFilter?: boolean;
	disableTrustedOriginsCors?: boolean;
	disableBodyParser?: boolean;
};

export const {
	ConfigurableModuleClass,
	MODULE_OPTIONS_TOKEN,
	OPTIONS_TYPE,
	ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<AuthModuleOptions>()
	.setClassMethodName("forRoot")
	.build();
