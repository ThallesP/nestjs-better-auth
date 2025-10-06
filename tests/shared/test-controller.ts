import { Controller, Get } from "@nestjs/common";
import { OptionalAuth, AllowAnonymous, Session } from "../../src/decorators.ts";
import type { UserSession } from "../../src/auth-guard.ts";

/**
 * Test controller for REST API authentication flows
 */
@Controller("test")
export class TestController {
	/**
	 * Protected route - requires authentication
	 */
	@Get("protected")
	protected(@Session() session: UserSession) {
		return { user: session?.user };
	}

	/**
	 * Public route - accessible without authentication
	 */
	@AllowAnonymous()
	@Get("public")
	public() {
		return { ok: true };
	}

	/**
	 * Optional authentication route - works with or without auth
	 */
	@OptionalAuth()
	@Get("optional")
	optional(@Session() session: UserSession) {
		return { authenticated: !!session?.user, session };
	}
}
