import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";
import { faker } from "@faker-js/faker";
import { InternalServerErrorException } from "@nestjs/common";
import { MESSAGES } from "@nestjs/core/constants.js";
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

	it("should gracefully handling a middleware throwing an uncaught error", async () => {
		const error = new Error("uncaught");
		const internalError = new InternalServerErrorException(error);

		testSetup = await createTestApp({
			middleware: () => {
				throw error;
			},
		});

		const httpServer = testSetup.app.getHttpServer();

		const response = await request(httpServer).get("/api/auth/ok");

		expect(response.status).toBe(internalError.getStatus());
		expect(response.body).toEqual({
			statusCode: internalError.getStatus(),
			// Whoops, the default thrown one is "Internal server error", whereas the one in
			// `InternalServerErrorException` is "Internal Server Error", differing only in case.
			// Otherwise we could do `expect(response.body).toEqual(internalError.getResponse())`
			message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
		});
	});
});
