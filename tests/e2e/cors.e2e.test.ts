import { Logger } from "@nestjs/common";
import cors from "@fastify/cors";
import request from "supertest";
import { vi } from "vitest";
import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";

const TRUSTED_ORIGIN = "http://localhost:3000";
const isFastify = process.env.TEST_HTTP_ADAPTER === "fastify";
const fastifyOnly = isFastify ? it : it.skip;

describe("cors e2e", () => {
	let testSetup: TestAppSetup | undefined;

	afterEach(async () => {
		vi.restoreAllMocks();

		if (!testSetup) return;

		await testSetup.app.close();
		testSetup = undefined;
	});

	it("should apply trustedOrigins CORS headers on Better Auth routes", async () => {
		testSetup = await createTestApp(undefined, false, {
			authOptions: {
				trustedOrigins: [TRUSTED_ORIGIN],
			},
		});

		const httpServer = testSetup.app.getHttpServer();

		const optionsResponse = await request(httpServer)
			.options("/api/auth/sign-in/email")
			.set("Origin", TRUSTED_ORIGIN)
			.set("Access-Control-Request-Method", "POST")
			.set("Access-Control-Request-Headers", "content-type, stripe-signature");

		expect(optionsResponse.status).toBe(204);
		expect(optionsResponse.headers["access-control-allow-origin"]).toBe(
			TRUSTED_ORIGIN,
		);
		expect(optionsResponse.headers["access-control-allow-credentials"]).toBe(
			"true",
		);

		if (isFastify) {
			expect(optionsResponse.headers["access-control-allow-headers"]).toBe(
				"content-type, stripe-signature",
			);
		}

		const okResponse = await request(httpServer)
			.get("/api/auth/ok")
			.set("Origin", TRUSTED_ORIGIN);

		expect(okResponse.status).toBe(200);
		expect(okResponse.headers["access-control-allow-origin"]).toBe(
			TRUSTED_ORIGIN,
		);
		expect(okResponse.headers["access-control-allow-credentials"]).toBe("true");
	});

	fastifyOnly(
		"should warn and skip duplicate Fastify CORS registration when @fastify/cors is already registered",
		async () => {
			const warnSpy = vi
				.spyOn(Logger.prototype, "warn")
				.mockImplementation(() => undefined);

			testSetup = await createTestApp(undefined, false, {
				authOptions: {
					trustedOrigins: [TRUSTED_ORIGIN],
				},
				configureAdapter: async (adapter) => {
					await adapter.register(cors, {
						origin: [TRUSTED_ORIGIN],
						credentials: true,
					});
				},
			});

			const warningCalls = warnSpy.mock.calls.filter(([message]) =>
				String(message).includes(
					"Detected an existing @fastify/cors registration.",
				),
			);

			expect(warningCalls).toHaveLength(1);

			const httpServer = testSetup.app.getHttpServer();
			const optionsResponse = await request(httpServer)
				.options("/api/auth/sign-in/email")
				.set("Origin", TRUSTED_ORIGIN)
				.set("Access-Control-Request-Method", "POST")
				.set("Access-Control-Request-Headers", "content-type");

			expect(optionsResponse.status).toBe(204);
			expect(optionsResponse.headers["access-control-allow-origin"]).toBe(
				TRUSTED_ORIGIN,
			);

			const okResponse = await request(httpServer)
				.get("/api/auth/ok")
				.set("Origin", TRUSTED_ORIGIN);

			expect(okResponse.status).toBe(200);
			expect(okResponse.headers["access-control-allow-origin"]).toBe(
				TRUSTED_ORIGIN,
			);
			expect(okResponse.headers["access-control-allow-credentials"]).toBe(
				"true",
			);
		},
	);

	fastifyOnly(
		"should not add Better Auth route CORS on Fastify when disableTrustedOriginsCors is true",
		async () => {
			testSetup = await createTestApp(
				{
					disableTrustedOriginsCors: true,
				},
				false,
				{
					authOptions: {
						trustedOrigins: [TRUSTED_ORIGIN],
					},
					configureAdapter: async (adapter) => {
						await adapter.register(cors, {
							origin: [TRUSTED_ORIGIN],
							credentials: true,
						});
					},
				},
			);

			const httpServer = testSetup.app.getHttpServer();
			const optionsResponse = await request(httpServer)
				.options("/api/auth/sign-in/email")
				.set("Origin", TRUSTED_ORIGIN)
				.set("Access-Control-Request-Method", "POST")
				.set("Access-Control-Request-Headers", "content-type");

			expect(optionsResponse.status).toBe(204);
			expect(optionsResponse.headers["access-control-allow-origin"]).toBe(
				TRUSTED_ORIGIN,
			);

			const okResponse = await request(httpServer)
				.get("/api/auth/ok")
				.set("Origin", TRUSTED_ORIGIN);

			expect(okResponse.status).toBe(200);
			expect(okResponse.headers["access-control-allow-origin"]).toBeUndefined();
			expect(
				okResponse.headers["access-control-allow-credentials"],
			).toBeUndefined();
		},
	);
});
