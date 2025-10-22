import request from "supertest";
import {
	createTestApp,
	signUpTestUser,
	type TestAppSetup,
} from "../shared/test-utils.ts";

describe("rest auth e2e", () => {
	let testSetup: TestAppSetup;

	beforeAll(async () => {
		testSetup = await createTestApp();
	});

	afterAll(async () => {
		await testSetup.app.close();
	});

	describe("protected routes", () => {
		it("should reject access without authentication", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/protected")
				.expect(401);

			expect(response.body).toMatchObject({
				code: "UNAUTHORIZED",
				message: "Unauthorized",
			});
		});

		it("should allow access with valid bearer token", async () => {
			const { user, token } = await signUpTestUser(testSetup.auth);

			const response = await request(testSetup.app.getHttpServer())
				.get("/test/protected")
				.set("Authorization", `Bearer ${token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				user: expect.objectContaining({
					id: user.id,
					name: user.name,
					email: user.email,
				}),
			});
		});

		it("should reject access with invalid token", async () => {
			await request(testSetup.app.getHttpServer())
				.get("/test/protected")
				.set("Authorization", "Bearer invalid-token")
				.expect(401);
		});
	});

	describe("public routes", () => {
		it("should allow access without authentication", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/public")
				.expect(200);

			expect(response.body).toMatchObject({
				ok: true,
			});
		});

		it("should allow access even with invalid token", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/public")
				.set("Authorization", "Bearer invalid-token")
				.expect(200);

			expect(response.body).toMatchObject({
				ok: true,
			});
		});
	});

	describe("optional auth routes", () => {
		it("should work without authentication", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/optional")
				.expect(200);

			expect(response.body).toMatchObject({
				authenticated: false,
				session: null,
			});
		});

		it("should work with authentication", async () => {
			const { user, token } = await signUpTestUser(testSetup.auth);

			const response = await request(testSetup.app.getHttpServer())
				.get("/test/optional")
				.set("Authorization", `Bearer ${token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				authenticated: true,
				session: expect.objectContaining({
					user: expect.objectContaining({
						id: user.id,
						name: user.name,
						email: user.email,
					}),
				}),
			});
		});

		it("should handle invalid token gracefully", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.get("/test/optional")
				.set("Authorization", "Bearer invalid-token")
				.expect(200);

			expect(response.body).toMatchObject({
				authenticated: false,
			});
		});
	});

	it("should forbid access to admin-protected route without admin role", async () => {
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		const token = signUp.token;

		await request(testSetup.app.getHttpServer())
			.get("/test/admin-protected")
			.set("Authorization", `Bearer ${token}`)
			.expect(403)
			.expect((res) => {
				expect(res.body?.message).toContain("Insufficient permissions");
			});

		await request(testSetup.app.getHttpServer())
			.get("/test/admin-moderator-protected")
			.set("Authorization", `Bearer ${token}`)
			.expect(403)
			.expect((res) => {
				expect(res.body?.message).toContain("Insufficient permissions");
			});
	});

	it("should allow access to admin-protected route with admin role", async () => {
		const password = faker.internet.password({ length: 10 });
		const adminUser = await testSetup.auth.api.createUser({
			body: {
				name: "Admin",
				email: faker.internet.email(),
				password: password,
				role: "admin",
			},
		});

		const { token, user } = await testSetup.auth.api.signInEmail({
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
				id: user.id,
			}),
		});
	});

	it("should allow access to admin-moderator-protected route with moderator role", async () => {
		const password = faker.internet.password({ length: 10 });
		const moderatorUser = await testSetup.auth.api.createUser({
			body: {
				name: "Admin",
				email: faker.internet.email(),
				password: password,
				role: "moderator",
			},
		});

		const { token, user } = await testSetup.auth.api.signInEmail({
			body: {
				email: moderatorUser.user.email,
				password: password,
			},
		});

		const response = await request(testSetup.app.getHttpServer())
			.get("/test/admin-moderator-protected")
			.set("Authorization", `Bearer ${token}`)
			.expect(200);

		expect(response.body).toMatchObject({
			user: expect.objectContaining({
				id: user.id,
			}),
		});
	});
});
