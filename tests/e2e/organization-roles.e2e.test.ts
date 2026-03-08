import request from "supertest";
import { faker } from "@faker-js/faker";
import { Test } from "@nestjs/testing";
import { Module, type INestApplication } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { AuthModule } from "../../src/index.ts";
import { TestController } from "../shared/test-controller.ts";

/**
 * Creates a Better Auth instance with organization plugin enabled
 */
function createTestAuthWithOrganization() {
	return betterAuth({
		basePath: "/api/auth",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			bearer(),
			admin(),
			organization({
				// Enable organization plugin with default settings
			}),
		],
	});
}

/**
 * Creates a test app with organization plugin support
 */
async function createTestAppWithOrganization() {
	const auth = createTestAuthWithOrganization();

	@Module({
		imports: [AuthModule.forRoot({ auth })],
		controllers: [TestController],
	})
	class AppModule {}

	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleRef.createNestApplication(new ExpressAdapter(), {
		bodyParser: false,
	});

	await app.init();

	return { app, auth };
}

interface TestAppSetup {
	app: INestApplication;
	auth: ReturnType<typeof createTestAuthWithOrganization>;
}

describe("organization roles e2e", () => {
	let testSetup: TestAppSetup;

	beforeAll(async () => {
		testSetup = await createTestAppWithOrganization();
	});

	afterAll(async () => {
		await testSetup.app.close();
	});

	describe("@Roles() - user.role only (admin plugin)", () => {
		it("should allow access when user has admin role on user object", async () => {
			const password = faker.internet.password({ length: 10 });
			const adminUser = await testSetup.auth.api.createUser({
				body: {
					name: "Admin User",
					email: faker.internet.email(),
					password: password,
					role: "admin",
				},
			});

			const { token } = await testSetup.auth.api.signInEmail({
				body: {
					email: adminUser.user.email,
					password: password,
				},
			});

			const response = await request(testSetup.app.getHttpServer())
				.get("/test/admin-protected")
				.set("Authorization", `Bearer ${token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				user: expect.objectContaining({
					id: adminUser.user.id,
				}),
			});
		});

		it("should DENY access to org admin when using @Roles (security fix)", async () => {
			// Create a regular user with NO user.role
			const signUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
			const authApi = testSetup.auth.api as any;

			// Create org - user becomes owner
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

			// Even though user is org owner, @Roles(['admin']) should NOT grant access
			// because @Roles only checks user.role, not org member role
			await request(testSetup.app.getHttpServer())
				.get("/test/admin-protected")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(403);
		});

		it("should deny access when user has no role", async () => {
			const signUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			await request(testSetup.app.getHttpServer())
				.get("/test/admin-protected")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(403)
				.expect((res) => {
					expect(res.body?.message).toContain("Insufficient permissions");
				});
		});
	});

	describe("@OrgRoles() - organization member role only", () => {
		it("should allow access when user is org owner", async () => {
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

			await authApi.setActiveOrganization({
				body: {
					organizationId: org.id,
				},
				headers: {
					Authorization: `Bearer ${signUp.token}`,
				},
			});

			// User is org owner, @OrgRoles(['owner']) should grant access
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/org-owner-protected")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				user: expect.objectContaining({
					id: signUp.user.id,
				}),
			});
		});

		it("should allow access when user is org owner or admin", async () => {
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
					name: "Test Org 2",
					slug: `test-org-2-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${signUp.token}`,
				},
			});

			await authApi.setActiveOrganization({
				body: {
					organizationId: org.id,
				},
				headers: {
					Authorization: `Bearer ${signUp.token}`,
				},
			});

			// Owner should have access to @OrgRoles(['owner', 'admin'])
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/org-owner-admin-protected")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				user: expect.objectContaining({
					id: signUp.user.id,
				}),
			});
		});

		it("should deny access when user.role=admin but no active org", async () => {
			// Create user with admin role on user object
			const password = faker.internet.password({ length: 10 });
			const adminUser = await testSetup.auth.api.createUser({
				body: {
					name: "System Admin",
					email: faker.internet.email(),
					password: password,
					role: "admin",
				},
			});

			const { token } = await testSetup.auth.api.signInEmail({
				body: {
					email: adminUser.user.email,
					password: password,
				},
			});

			// @OrgRoles only checks org member role, not user.role
			// So even system admin should be denied without active org
			await request(testSetup.app.getHttpServer())
				.get("/test/org-owner-protected")
				.set("Authorization", `Bearer ${token}`)
				.expect(403);
		});

		it("should deny access when user has no active organization", async () => {
			const signUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// No active org set - should be denied
			await request(testSetup.app.getHttpServer())
				.get("/test/org-owner-protected")
				.set("Authorization", `Bearer ${signUp.token}`)
				.expect(403);
		});

		it("should allow access when user has admin role in organization", async () => {
			// Create org owner
			const ownerSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// Create admin user
			const adminPassword = faker.internet.password({ length: 10 });
			const adminSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: adminPassword,
				},
			});

			// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
			const authApi = testSetup.auth.api as any;

			// Owner creates org
			const org = await authApi.createOrganization({
				body: {
					name: "Test Org Admin",
					slug: `test-org-admin-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			// Add admin user directly with "admin" role (server-side API)
			await authApi.addMember({
				body: {
					userId: adminSignUp.user.id,
					organizationId: org.id,
					role: "admin",
				},
			});

			// Admin sets active org
			await authApi.setActiveOrganization({
				body: {
					organizationId: org.id,
				},
				headers: {
					Authorization: `Bearer ${adminSignUp.token}`,
				},
			});

			// Admin should be able to access @OrgRoles(['admin']) route
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/org-admin-protected")
				.set("Authorization", `Bearer ${adminSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				user: expect.objectContaining({
					id: adminSignUp.user.id,
				}),
			});
		});

		it("should deny access when member role tries to access owner-only route", async () => {
			// Create org owner
			const ownerSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				},
			});

			// Create member user
			const memberPassword = faker.internet.password({ length: 10 });
			const memberSignUp = await testSetup.auth.api.signUpEmail({
				body: {
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: memberPassword,
				},
			});

			// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
			const authApi = testSetup.auth.api as any;

			// Owner creates org
			const org = await authApi.createOrganization({
				body: {
					name: "Test Org Member",
					slug: `test-org-member-${Date.now()}`,
				},
				headers: {
					Authorization: `Bearer ${ownerSignUp.token}`,
				},
			});

			// Add user directly with "member" role (server-side API)
			await authApi.addMember({
				body: {
					userId: memberSignUp.user.id,
					organizationId: org.id,
					role: "member",
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

			// Member should be denied from @OrgRoles(['owner']) route
			await request(testSetup.app.getHttpServer())
				.get("/test/org-owner-protected")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(403);

			// But member should be able to access @OrgRoles(['member']) route
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/org-member-protected")
				.set("Authorization", `Bearer ${memberSignUp.token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				user: expect.objectContaining({
					id: memberSignUp.user.id,
				}),
			});
		});
	});
});
