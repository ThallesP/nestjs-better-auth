import request from "supertest";
import { faker } from "@faker-js/faker";
import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";

describe("rest auth e2e", () => {
	let testSetup: TestAppSetup;

	beforeAll(async () => {
		testSetup = await createTestApp();
	});

	afterAll(async () => {
		await testSetup.app.close();
	});

	it("should not be able to access protected route without auth", async () => {
		await request(testSetup.app.getHttpServer())
			.get("/test/protected")
			.expect(401)
			.expect((res) => {
				expect(res.body?.message).toBeDefined();
			});
	});

	it("should be able to access public route without auth", async () => {
		const response = await request(testSetup.app.getHttpServer())
			.get("/test/public")
			.expect(200);

		expect(response.body).toMatchObject({
			ok: true,
		});
	});

	it("should be able to access an optional protected route without auth", async () => {
		const response = await request(testSetup.app.getHttpServer())
			.get("/test/optional")
			.expect(200);

		expect(response.body).toMatchObject({
			authenticated: false,
		});
	});

	it("should be able to access an optional protected route with auth", async () => {
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		const response = await request(testSetup.app.getHttpServer())
			.get("/test/optional")
			.set("Authorization", `Bearer ${signUp.token}`)
			.expect(200);

		expect(response.body).toMatchObject({
			authenticated: true,
			session: expect.objectContaining({
				user: expect.objectContaining({
					id: signUp.user.id,
					name: signUp.user.name,
					email: signUp.user.email,
				}),
			}),
		});
	});

	it("should be able to sign up and authenticate", async () => {
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		const token = signUp.token;

		const response = await request(testSetup.app.getHttpServer())
			.get("/test/protected")
			.set("Authorization", `Bearer ${token}`)
			.expect(200);

		expect(response.body).toMatchObject({
			user: expect.objectContaining({
				id: signUp.user.id,
				name: signUp.user.name,
				email: signUp.user.email,
			}),
		});
	});

	it("should authenticate with a global prefix", async () => {
		const prefixedSetup = await createTestApp(undefined, false, {
			globalPrefix: "v1",
		});

		try {
			const signUpResponse = await request(prefixedSetup.app.getHttpServer())
				// better-auth path should still be /api/auth and not /v1/api/auth
				// if the user wants to change their path, they should do it via the auth instance.
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send({
					name: faker.person.fullName(),
					email: faker.internet.email(),
					password: faker.internet.password({ length: 10 }),
				})
				.expect(200);

			const { token, user } = signUpResponse.body ?? {};
			expect(token).toBeDefined();
			expect(user?.id).toBeDefined();

			const response = await request(prefixedSetup.app.getHttpServer())
				.get("/v1/test/protected")
				.set("Authorization", `Bearer ${token}`)
				.expect(200);

			expect(response.body).toMatchObject({
				user: expect.objectContaining({
					id: user.id,
				}),
			});
		} finally {
			await prefixedSetup.app.close();
		}
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
