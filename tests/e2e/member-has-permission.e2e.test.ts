import request from "supertest";
import { faker } from "@faker-js/faker";
import { Test } from "@nestjs/testing";
import { Module, Controller, Get } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { bearer } from "better-auth/plugins/bearer";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { createAccessControl } from "better-auth/plugins/access";
import { betterAuth } from "better-auth";
import { AuthModule } from "../../src/index.ts";
import { MemberHasPermission } from "../../src/decorators.ts";
import { type OPTIONS_TYPE } from "../../src/auth-module-definition.ts";
import { Request } from "@nestjs/common";

// Create custom access control with project and sale resources for organization
const statement = {
	project: ["create", "share", "update", "delete"],
	sale: ["create", "read", "update", "delete"],
	organization: ["update", "delete"],
} as const;

const ac = createAccessControl(statement);

// Create custom organization roles with different permission levels
const projectEditor = ac.newRole({
	project: ["create", "update"],
});

const projectAdmin = ac.newRole({
	project: ["create", "update", "delete"],
});

const projectViewer = ac.newRole({
	project: ["share"], // Has share permission
});

const multiResourceUser = ac.newRole({
	project: ["create", "update"],
	sale: ["create"],
});

const fullAccess = ac.newRole({
	project: ["create", "share", "update", "delete"],
	sale: ["create", "read", "update", "delete"],
	organization: ["update", "delete"],
});

const orgAdmin = ac.newRole({
	project: ["create", "update"],
	organization: ["update"],
});

// Create test auth with organization plugin and custom access control
function createTestAuthWithOrganizationAccessControl() {
	return betterAuth({
		basePath: "/api/auth",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			bearer(),
			admin(),
			organization({
				ac,
				roles: {
					projectEditor,
					projectAdmin,
					projectViewer,
					multiResourceUser,
					fullAccess,
					orgAdmin,
				},
			}),
		],
	});
}

// Test controller with various member permission checks
@Controller("member-permission-test")
class MemberPermissionTestController {
	@MemberHasPermission({ permissions: { project: ["create", "update"] } })
	@Get("project-create-update")
	projectCreateUpdate(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}

	@MemberHasPermission({ permissions: { project: ["create"] } })
	@Get("project-create-only")
	projectCreateOnly(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}

	@MemberHasPermission({ permissions: { project: ["delete"] } })
	@Get("project-delete")
	projectDelete(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}

	@MemberHasPermission({
		permissions: { project: ["create"], sale: ["create"] },
	})
	@Get("multi-resource")
	multiResource(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}

	@MemberHasPermission({ permissions: { project: ["share"] } })
	@Get("project-share")
	projectShare(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}

	@MemberHasPermission({ permissions: { organization: ["update"] } })
	@Get("org-update")
	orgUpdate(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}

	@MemberHasPermission({ permissions: { organization: ["delete"] } })
	@Get("org-delete")
	orgDelete(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}

	@MemberHasPermission({ permissions: { project: ["read"] } })
	@Get("project-read")
	projectRead(@Request() req: { user?: unknown }) {
		return { user: req.user, message: "success" };
	}
}

// Create test app module
function createMemberPermissionTestAppModule(
	async: boolean,
	auth: ReturnType<typeof createTestAuthWithOrganizationAccessControl>,
	options?: Omit<typeof OPTIONS_TYPE, "auth">,
) {
	const authModule = async
		? AuthModule.forRootAsync({
				useFactory: async () => ({ auth, ...options }),
			})
		: AuthModule.forRoot({ auth, ...options });

	@Module({
		imports: [authModule],
		controllers: [MemberPermissionTestController],
	})
	class AppModule {}

	return AppModule;
}

// Factory function to create test app
async function createMemberPermissionTestApp(
	options?: Omit<typeof OPTIONS_TYPE, "auth">,
	async = false,
) {
	const auth = createTestAuthWithOrganizationAccessControl();
	const AppModule = createMemberPermissionTestAppModule(async, auth, options);

	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleRef.createNestApplication(new ExpressAdapter(), {
		bodyParser: false,
	});

	await app.init();

	return { app, auth };
}

describe("MemberHasPermission e2e", () => {
	let testSetup: Awaited<ReturnType<typeof createMemberPermissionTestApp>>;

	beforeAll(async () => {
		testSetup = await createMemberPermissionTestApp();
	});

	afterAll(async () => {
		await testSetup.app.close();
	});

	// Helper function to create org with member having specific role
	async function createOrgWithMember(role: string) {
		const ownerSignUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		const memberSignUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
		const authApi = testSetup.auth.api as any;

		const org = await authApi.createOrganization({
			body: {
				name: "Test Org",
				slug: `test-org-${Date.now()}`,
			},
			headers: {
				Authorization: `Bearer ${ownerSignUp.token}`,
			},
		});

		await authApi.addMember({
			body: {
				organizationId: org.id,
				userId: memberSignUp.user.id,
				role: role,
			},
			headers: {
				Authorization: `Bearer ${ownerSignUp.token}`,
			},
		});

		await authApi.setActiveOrganization({
			body: {
				organizationId: org.id,
			},
			headers: {
				Authorization: `Bearer ${memberSignUp.token}`,
			},
		});

		return { org, ownerSignUp, memberSignUp, authApi };
	}

	describe("Basic permission checks", () => {
		it("should forbid access without authentication", async () => {
			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-update")
				.expect(401);
		});

		it("should forbid access when user has no active organization", async () => {
			// Create a user but don't set active organization
			const signUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-update")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(403)
				.expect((res) => {
					expect(res.body?.message).toContain("Insufficient permissions");
				});
		});

		it("should forbid access when member has no permissions", async () => {
			// Create a user and organization
			const signUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
			const authApi = testSetup.auth.api as any;

			// Create org - user becomes owner (but owner might not have project permissions by default)
			const org = await authApi.createOrganization({
				body: {
					name: "Test Org",
					slug: `test-org-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${signUp.token}`,
				},
			});

			// Set active org
			await authApi.setActiveOrganization({
				body: {
					organizationId: org.id,
				},
				headers: {
					Authorization: `Bearer ${signUp.token}`,
				},
			});

			// Owner role might not have project permissions, so this should fail
			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-update")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(403);
		});

		it("should allow access when member has required permissions", async () => {
			// Create owner user
			const ownerSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// Create member user with desired role
			const memberSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
			const authApi = testSetup.auth.api as any;

			// Owner creates org
			const org = await authApi.createOrganization({
				body: {
					name: "Test Org",
					slug: `test-org-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			// Owner adds member with projectEditor role
			await authApi.addMember({
				body: {
					organizationId: org.id,
					userId: memberSignUp.user.id,
					role: "projectEditor",
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			// Member sets active org
			await authApi.setActiveOrganization({
				body: {
					organizationId: org.id,
				},
				headers: {
					Authorization: `Bearer ${memberSignUp.token}`,
				},
			});

			const response = await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-update")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				message: "success",
				user: expect.objectContaining({
					id: memberSignUp.user.id,
				}),
			});
		});

		it("should allow access when member has partial required permissions (create only)", async () => {
			const { memberSignUp } = await createOrgWithMember("projectEditor");

			// projectEditor has ["create", "update"], so should have access to create-only route
			const response = await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-only")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				message: "success",
			});
		});
	});

	describe("Permission edge cases", () => {
		it("should forbid access when member lacks required permission", async () => {
			const { memberSignUp } = await createOrgWithMember("projectEditor"); // Has create, update but NOT delete

			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-delete")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(403);
		});

		it("should allow access when member has delete permission", async () => {
			const { memberSignUp } = await createOrgWithMember("projectAdmin"); // Has create, update, delete

			const response = await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-delete")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				message: "success",
			});
		});

		it("should forbid access when permission is not in role definition", async () => {
			const { memberSignUp } = await createOrgWithMember("projectViewer"); // Has "share" but not "read"

			// Should fail because "read" is not a valid permission in the statement
			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-read")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(403);
		});
	});

	describe("Multiple permissions", () => {
		it("should allow access when member has all required permissions across resources", async () => {
			const { memberSignUp } = await createOrgWithMember("multiResourceUser"); // Has project: ["create", "update"], sale: ["create"]

			const response = await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/multi-resource")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				message: "success",
			});
		});

		it("should forbid access when member lacks one of the required permissions", async () => {
			const { memberSignUp } = await createOrgWithMember("projectEditor"); // Has project: ["create", "update"] but NOT sale: ["create"]

			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/multi-resource")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(403);
		});
	});

	describe("Different resource types", () => {
		it("should allow access to share permission when member has it", async () => {
			const { memberSignUp } = await createOrgWithMember("fullAccess"); // Has all permissions including share

			const response = await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-share")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				message: "success",
			});
		});

		it("should forbid access to share permission when member lacks it", async () => {
			const { memberSignUp } = await createOrgWithMember("projectAdmin"); // Has create, update, delete but NOT share

			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-share")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(403);
		});

		it("should allow access to organization update permission when member has it", async () => {
			const { memberSignUp } = await createOrgWithMember("orgAdmin"); // Has organization: ["update"]

			const response = await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/org-update")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				message: "success",
			});
		});

		it("should forbid access to organization delete permission when member lacks it", async () => {
			const { memberSignUp } = await createOrgWithMember("orgAdmin"); // Has organization: ["update"] but NOT delete

			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/org-delete")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(403);
		});
	});

	describe("Edge cases", () => {
		it("should handle multiple actions in single permission check", async () => {
			const { memberSignUp } = await createOrgWithMember("projectEditor"); // Has create and update

			// Route requires both create AND update
			const response = await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-update")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				message: "success",
			});
		});

		it("should handle user with no active organization gracefully", async () => {
			const signUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// Don't create organization or set active org
			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-only")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(403);
		});

		it("should handle member with default owner role (may not have permissions)", async () => {
			const signUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
			const authApi = testSetup.auth.api as any;

			const org = await authApi.createOrganization({
				body: {
					name: "Test Org",
					slug: `test-org-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${signUp.token}`,
				},
			});

			// Don't update member role - keep default owner role
			await authApi.setActiveOrganization({
				body: {
					organizationId: org.id,
				},
				headers: {
					Authorization: `Bearer ${signUp.token}`,
				},
			});

			// Owner role might not have project permissions by default
			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-only")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(403);
		});

		it("should handle switching between organizations", async () => {
			// Create owner user
			const ownerSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// Create member user
			const memberSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
			const authApi = testSetup.auth.api as any;

			// Create first org
			const org1 = await authApi.createOrganization({
				body: {
					name: "Org 1",
					slug: `org-1-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			await authApi.addMember({
				body: {
					organizationId: org1.id,
					userId: memberSignUp.user.id,
					role: "projectEditor",
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			await authApi.setActiveOrganization({
				body: {
					organizationId: org1.id,
				},
				headers: {
					Authorization: `Bearer ${memberSignUp.token}`,
				},
			});

			// Should have access with org1
			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-only")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			// Create second org
			const org2 = await authApi.createOrganization({
				body: {
					name: "Org 2",
					slug: `org-2-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			// Add member to org2 with a role that doesn't have project permissions
			// Use projectViewer which only has "share" permission, not "create"
			await authApi.addMember({
				body: {
					organizationId: org2.id,
					userId: memberSignUp.user.id,
					role: "projectViewer", // Only has "share", not "create"
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			await authApi.setActiveOrganization({
				body: {
					organizationId: org2.id,
				},
				headers: {
					Authorization: `Bearer ${memberSignUp.token}`,
				},
			});

			// Should NOT have access with org2 (different permissions)
			await request(testSetup.app.getHttpServer())
				.get("/member-permission-test/project-create-only")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(403);
		});
	});
});
