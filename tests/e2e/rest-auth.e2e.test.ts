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
});
