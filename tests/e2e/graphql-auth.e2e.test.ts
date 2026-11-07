import request from "supertest";
import { faker } from "@faker-js/faker";
import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";

// Apollo's driver does not support the Node adapter.
const describeGraphql =
	process.env.TEST_HTTP_ADAPTER === "node" ? describe.skip : describe;

describeGraphql("graphql auth e2e", () => {
	let testSetup: TestAppSetup;

	beforeAll(async () => {
		testSetup = await createTestApp();
	});

	afterAll(async () => {
		await testSetup.app.close();
	});

	it("should resolve public query without auth", async () => {
		const response = await request(testSetup.app.getHttpServer())
			.post("/graphql")
			.set("Content-Type", "application/json")
			.send({ query: "{ publicHello }" })
			.expect(200);

		expect(response.body?.data?.publicHello).toBe("ok");
	});

	it("should resolve optional query without auth as object with authenticated=false", async () => {
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

	it("should require auth for protected query", async () => {
		const response = await request(testSetup.app.getHttpServer())
			.post("/graphql")
			.set("Content-Type", "application/json")
			.send({ query: "{ protectedUserId { userId } }" })
			.expect(200);

		expect(Array.isArray(response.body?.errors)).toBe(true);
	});

	it("should resolve protected query with auth", async () => {
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		const response = await request(testSetup.app.getHttpServer())
			.post("/graphql")
			.set("Content-Type", "application/json")
			.set("Authorization", `Bearer ${signUp.token}`)
			.send({ query: "{ protectedUserId { userId } }" })
			.expect(200);

		expect(response.body?.data?.protectedUserId).toMatchObject({
			userId: signUp.user.id,
		});
	});
});
