import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";
import { faker } from "@faker-js/faker";
import { InternalServerErrorException } from "@nestjs/common";
import { MESSAGES } from "@nestjs/core/constants.js";
import request from "supertest";

const testHttpAdapter = process.env.TEST_HTTP_ADAPTER ?? "express";

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

	it("should attach rawBody to request when bodyParser.json.rawBody is true", async () => {
		testSetup = await createTestApp({
			bodyParser: {
				json: {
					rawBody: true,
				},
			},
		});

		const httpServer = testSetup.app.getHttpServer();

		const response = await request(httpServer)
			.post("/test/raw-body")
			.send({ test: "data" });

		expect(response.status).toBe(201);
		expect(response.body).toEqual({
			hasRawBody: true,
			rawBodyType: "object", // Buffer is typeof "object"
			isBuffer: true,
		});
	});

	it("should still attach rawBody when using deprecated enableRawBodyParser", async () => {
		testSetup = await createTestApp({
			enableRawBodyParser: true,
		});

		const httpServer = testSetup.app.getHttpServer();

		const response = await request(httpServer)
			.post("/test/raw-body")
			.send({ test: "data" });

		expect(response.status).toBe(201);
		expect(response.body).toEqual({
			hasRawBody: true,
			rawBodyType: "object",
			isBuffer: true,
		});
	});

	it("should not attach rawBody to request when enableRawBodyParser is false", async () => {
		testSetup = await createTestApp({
			enableRawBodyParser: false,
		});

		const httpServer = testSetup.app.getHttpServer();

		const response = await request(httpServer)
			.post("/test/raw-body")
			.send({ test: "data" });

		expect(response.status).toBe(201);
		expect(response.body).toEqual({
			hasRawBody: false,
			rawBodyType: null,
			isBuffer: false,
		});
	});

	it("should allow disabling only the json parser", async () => {
		if (testHttpAdapter !== "express") {
			return;
		}

		testSetup = await createTestApp({
			bodyParser: {
				json: {
					enabled: false,
				},
			},
		});

		const httpServer = testSetup.app.getHttpServer();

		const response = await request(httpServer)
			.post("/test/json-body")
			.send({ test: "data" });

		expect(response.status).toBe(201);
		expect(response.body).toEqual({
			hasBody: false,
			body: null,
		});
	});

	it("should allow disabling only the urlencoded parser", async () => {
		if (testHttpAdapter !== "express") {
			return;
		}

		testSetup = await createTestApp({
			bodyParser: {
				urlencoded: {
					enabled: false,
				},
			},
		});

		const httpServer = testSetup.app.getHttpServer();

		const response = await request(httpServer)
			.post("/test/form-body")
			.type("form")
			.send({ test: "data" });

		expect(response.status).toBe(201);
		expect(response.body).toEqual({
			hasBody: false,
			body: null,
		});
	});

	it("should allow customizing the json parser limit", async () => {
		if (testHttpAdapter !== "express") {
			return;
		}

		const largePayload = "x".repeat(150_000);

		testSetup = await createTestApp({
			bodyParser: {
				json: {
					limit: "300kb",
				},
			},
		});

		const httpServer = testSetup.app.getHttpServer();

		const response = await request(httpServer)
			.post("/test/json-body")
			.send({ payload: largePayload });

		expect(response.status).toBe(201);
		expect(response.body).toEqual({
			hasBody: true,
			body: {
				payload: largePayload,
			},
		});
	});

	it("should reject unsupported bodyParser options on fastify", async () => {
		if (testHttpAdapter !== "fastify") {
			return;
		}

		await expect(
			createTestApp({
				bodyParser: {
					json: {
						enabled: false,
					},
				},
			}),
		).rejects.toThrow(
			"Custom body parser options are only supported when using the Express adapter.",
		);
	});
});
