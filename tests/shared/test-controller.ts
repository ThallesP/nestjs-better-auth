import { Controller, Get, Post, Request } from "@nestjs/common";
import {
	OptionalAuth,
	AllowAnonymous,
	Roles,
	OrgRoles,
} from "../../src/decorators.ts";
import type { UserSession } from "../../src/auth-guard.ts";
import type { Request as ExpressRequest } from "express";

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

	// Organization-level role checks (OrgRoles)
	@OrgRoles(["owner"])
	@Get("org-owner-protected")
	orgOwnerProtected(@Request() req: UserSession) {
		return { user: req.user };
	}

	@OrgRoles(["owner", "admin"])
	@Get("org-owner-admin-protected")
	orgOwnerAdminProtected(@Request() req: UserSession) {
		return { user: req.user };
	}

	@OrgRoles(["admin"])
	@Get("org-admin-protected")
	orgAdminProtected(@Request() req: UserSession) {
		return { user: req.user };
	}

	@OrgRoles(["member"])
	@Get("org-member-protected")
	orgMemberProtected(@Request() req: UserSession) {
		return { user: req.user };
	}

	@AllowAnonymous()
	@Post("raw-body")
	rawBody(@Request() req: ExpressRequest & { rawBody?: Buffer }) {
		return {
			hasRawBody: !!req.rawBody,
			rawBodyType: req.rawBody ? typeof req.rawBody : null,
			isBuffer: req.rawBody instanceof Buffer,
		};
	}
}
