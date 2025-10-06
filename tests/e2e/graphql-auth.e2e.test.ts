import request from "supertest";
import {
	createTestApp,
	signUpTestUser,
	type TestAppSetup,
} from "../shared/test-utils.ts";

describe("graphql auth e2e", () => {
	let testSetup: TestAppSetup;

	beforeAll(async () => {
		testSetup = await createTestApp();
	});

	afterAll(async () => {
		await testSetup.app.close();
	});

	describe("public queries", () => {
		it("should resolve without authentication", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.send({ query: "{ publicHello }" })
				.expect(200);

			expect(response.body?.data?.publicHello).toBe("ok");
			expect(response.body?.errors).toBeUndefined();
		});

		it("should resolve even with invalid token", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.set("Authorization", "Bearer invalid-token")
				.send({ query: "{ publicHello }" })
				.expect(200);

			expect(response.body?.data?.publicHello).toBe("ok");
		});
	});

	describe("optional auth queries", () => {
		it("should resolve without authentication", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.send({ query: "{ optionalAuthenticated { authenticated userId } }" })
				.expect(200);

			expect(response.body?.data?.optionalAuthenticated).toMatchObject({
				authenticated: false,
				userId: null,
			});
		});

		it("should resolve with authentication", async () => {
			const { user, token } = await signUpTestUser(testSetup.auth);

			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.send({ query: "{ optionalAuthenticated { authenticated userId } }" })
				.expect(200);

			expect(response.body?.data?.optionalAuthenticated).toMatchObject({
				authenticated: true,
				userId: user.id,
			});
		});

		it("should handle invalid token gracefully", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.set("Authorization", "Bearer invalid-token")
				.send({ query: "{ optionalAuthenticated { authenticated userId } }" })
				.expect(200);

			expect(response.body?.data?.optionalAuthenticated).toMatchObject({
				authenticated: false,
				userId: null,
			});
		});
	});

	describe("protected queries", () => {
		it("should reject access without authentication", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.send({ query: "{ protectedUserId { userId } }" })
				.expect(200);

			expect(response.body?.errors).toBeDefined();
			expect(Array.isArray(response.body?.errors)).toBe(true);
			expect(response.body?.errors?.[0]?.message).toBe("Unauthorized");
		});

		it("should allow access with valid bearer token", async () => {
			const { user, token } = await signUpTestUser(testSetup.auth);

			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.send({ query: "{ protectedUserId { userId } }" })
				.expect(200);

			expect(response.body?.data?.protectedUserId).toMatchObject({
				userId: user.id,
			});
			expect(response.body?.errors).toBeUndefined();
		});

		it("should reject access with invalid token", async () => {
			const response = await request(testSetup.app.getHttpServer())
				.post("/graphql")
				.set("Content-Type", "application/json")
				.set("Authorization", "Bearer invalid-token")
				.send({ query: "{ protectedUserId { userId } }" })
				.expect(200);

			expect(response.body?.errors).toBeDefined();
			expect(Array.isArray(response.body?.errors)).toBe(true);
		});
	});
});
