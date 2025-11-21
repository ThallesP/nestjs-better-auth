import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";
import { faker } from "@faker-js/faker";
import request from "supertest";

describe("options e2e", () => {
	let testSetup: TestAppSetup;

	afterAll(async () => {
		await testSetup.app.close();
	});

	it("should not find any auth routes if disableControllers is set", async () => {
		testSetup = await createTestApp({ disableControllers: true });

		const httpServer = testSetup.app.getHttpServer();

		// Make actual HTTP requests to verify endpoints are not registered
		const signUpResponse = await request(httpServer)
			.post("/api/auth/sign-up/email")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			});

		const signInResponse = await request(httpServer)
			.post("/api/auth/sign-in/email")
			.send({
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			});

		// All requests should return 404 since routes are disabled
		expect(signUpResponse.status).toBe(404);
		expect(signInResponse.status).toBe(404);
	});
});
