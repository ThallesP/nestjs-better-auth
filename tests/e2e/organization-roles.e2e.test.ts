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

	it("should allow access when user has admin role on user object (backward compatibility)", async () => {
		// Create user with admin role on user object (not organization)
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

		// Should have access because user.role = 'admin'
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

	it("should allow access when user is org owner via organization plugin", async () => {
		// Create a regular user (no role on user object)
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		// Create an organization with this user as owner
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

		// Set this organization as active
		await authApi.setActiveOrganization({
			body: {
				organizationId: org.id,
			},
			headers: {
				Authorization: `Bearer ${signUp.token}`,
			},
		});

		// Use the same token (session has activeOrganizationId after setActiveOrganization)
		// The organization creator gets "owner" role
		// Access should be granted via organization member role for @Roles(['owner'])
		const response = await request(testSetup.app.getHttpServer())
			.get("/test/owner-protected")
			.set("Authorization", `Bearer ${signUp.token}`)
			.expect(200);

		expect(response.body).toMatchObject({
			user: expect.objectContaining({
				id: signUp.user.id,
			}),
		});
	});

	it("should allow access to owner-admin-protected when user is org owner", async () => {
		// Create a regular user (no role on user object)
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		// Create an organization with this user as owner
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

		// Set this organization as active
		await authApi.setActiveOrganization({
			body: {
				organizationId: org.id,
			},
			headers: {
				Authorization: `Bearer ${signUp.token}`,
			},
		});

		// Use the same token (session has activeOrganizationId after setActiveOrganization)
		// Owner should have access to @Roles(['owner', 'admin'])
		const response = await request(testSetup.app.getHttpServer())
			.get("/test/owner-admin-protected")
			.set("Authorization", `Bearer ${signUp.token}`)
			.expect(200);

		expect(response.body).toMatchObject({
			user: expect.objectContaining({
				id: signUp.user.id,
			}),
		});
	});

	it("should allow access with user.role even when org role is different (OR logic)", async () => {
		// Create user with admin role on user object
		const password = faker.internet.password({ length: 10 });
		const adminUser = await testSetup.auth.api.createUser({
			body: {
				name: "Admin in Org",
				email: faker.internet.email(),
				password: password,
				role: "admin", // User-level admin
			},
		});

		const { token } = await testSetup.auth.api.signInEmail({
			body: {
				email: adminUser.user.email,
				password: password,
			},
		});

		// biome-ignore lint/suspicious/noExplicitAny: API types vary by plugin
		const authApi = testSetup.auth.api as any;

		// Create org and add user as regular member
		const org = await authApi.createOrganization({
			body: {
				name: "Another Org",
				slug: `another-org-${Date.now()}`,
			},
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		// Set active org
		await authApi.setActiveOrganization({
			body: {
				organizationId: org.id,
			},
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		// Re-authenticate to get fresh session with active org
		const { token: newToken } = await testSetup.auth.api.signInEmail({
			body: {
				email: adminUser.user.email,
				password: password,
			},
		});

		// Should still have access because user.role = 'admin' (OR logic)
		const response = await request(testSetup.app.getHttpServer())
			.get("/test/admin-protected")
			.set("Authorization", `Bearer ${newToken}`)
			.expect(200);

		expect(response.body).toMatchObject({
			user: expect.objectContaining({
				id: adminUser.user.id,
			}),
		});
	});

	it("should deny access when user has no role in user object and no org context", async () => {
		// Create user with no role
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		// Should be forbidden - no user.role and no active org
		await request(testSetup.app.getHttpServer())
			.get("/test/admin-protected")
			.set("Authorization", `Bearer ${signUp.token}`)
			.expect(403)
			.expect((res) => {
				expect(res.body?.message).toContain("Insufficient permissions");
			});
	});
});
