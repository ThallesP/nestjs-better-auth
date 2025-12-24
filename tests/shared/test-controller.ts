import { Controller, Get, Request } from "@nestjs/common";
import { OptionalAuth, AllowAnonymous, Roles } from "../../src/decorators.ts";
import type { UserSession } from "../../src/auth-guard.ts";

// Simple controller with one protected route and one public route
@Controller("test")
export class TestController {
	@Get("protected")
	protected(@Request() req: { user?: unknown }) {
		return { user: req.user };
	}

	@AllowAnonymous()
	@Get("public")
	public() {
		return { ok: true };
	}

	@OptionalAuth()
	@Get("optional")
	optional(@Request() req: UserSession) {
		return { authenticated: !!req.user, session: req.session };
	}

	@Roles(["admin"])
	@Get("admin-protected")
	adminProtected(@Request() req: UserSession) {
		return { user: req.user };
	}

	@Roles(["admin", "moderator"])
	@Get("admin-moderator-protected")
	adminModeratorProtected(@Request() req: UserSession) {
		return { user: req.user };
	}

	@Roles(["owner"])
	@Get("owner-protected")
	ownerProtected(@Request() req: UserSession) {
		return { user: req.user };
	}

	@Roles(["owner", "admin"])
	@Get("owner-admin-protected")
	ownerAdminProtected(@Request() req: UserSession) {
		return { user: req.user };
	}
}
