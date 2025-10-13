import { Inject, Injectable } from "@nestjs/common";
import type { Auth } from "better-auth";
import {
	type AuthModuleOptions,
	MODULE_OPTIONS_TOKEN,
} from "./auth-module-definition.ts";

/**
 * NestJS service that provides access to the Better Auth instance
 * Use generics to support auth instances extended by plugins
 */
@Injectable()
export class AuthService<T extends { api: T["api"] } = Auth> {
	constructor(
		@Inject(MODULE_OPTIONS_TOKEN)
		private readonly options: AuthModuleOptions<T>,
	) {}

	/**
	 * Returns the API endpoints provided by the auth instance
	 */
	get api(): T["api"] {
		return this.options.auth.api;
	}

	/**
	 * Returns the complete auth instance
	 * Access this for plugin-specific functionality
	 */
	get instance(): T {
		return this.options.auth;
	}
}
