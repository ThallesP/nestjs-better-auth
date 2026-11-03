import "reflect-metadata";
import { Logger, type MiddlewareConsumer } from "@nestjs/common";
import {
	ApplicationConfig,
	type DiscoveryService,
	type HttpAdapterHost,
	type MetadataScanner,
} from "@nestjs/core";
import { createAuthEndpoint } from "better-auth/api";
import { Hono } from "hono";
import { vi } from "vitest";
import type { AuthModuleOptions } from "../../src/auth-module-definition.ts";
import { AuthModule } from "../../src/index.ts";
import { createTestAuth } from "../shared/test-utils.ts";

const TRUSTED_ORIGIN = "http://localhost:3000";

type BetterAuthOptions = Parameters<typeof createTestAuth>[0];

function configureHonoAuthModule(
	authOptions?: BetterAuthOptions,
	moduleOptions?: Omit<AuthModuleOptions, "auth">,
) {
	const hono = new Hono();
	hono.get("/health", (ctx) => ctx.text("ok"));

	const httpAdapter = {
		getType: () => "hono",
		getInstance: () => hono,
		enableCors: vi.fn(),
		use: vi.fn(),
	};
	const consumer = { apply: vi.fn() };
	const auth = createTestAuth(authOptions);

	const authModule = new AuthModule(
		new ApplicationConfig(),
		{} as DiscoveryService,
		{} as MetadataScanner,
		{ httpAdapter } as unknown as HttpAdapterHost,
		{ auth, ...moduleOptions },
	);
	authModule.configure(consumer as unknown as MiddlewareConsumer);

	return { hono, httpAdapter, consumer };
}

// The Hono adapter is exercised directly, so run it once rather than per HTTP adapter.
describe.skipIf(process.env.TEST_HTTP_ADAPTER === "fastify")(
	"hono adapter e2e",
	() => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should serve Better Auth routes from the Hono instance", async () => {
			const { hono } = configureHonoAuthModule();

			const response = await hono.request("/api/auth/ok");

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
		});

		it("should pass the untouched request body to Better Auth", async () => {
			const { hono } = configureHonoAuthModule();

			const signUpResponse = await hono.request("/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Hono User",
					email: "hono-user@example.com",
					password: "password123",
				}),
			});

			expect(signUpResponse.status).toBe(200);

			const sessionResponse = await hono.request("/api/auth/get-session", {
				headers: { cookie: signUpResponse.headers.get("set-cookie") ?? "" },
			});

			expect(sessionResponse.status).toBe(200);
			expect(await sessionResponse.json()).toMatchObject({
				user: { email: "hono-user@example.com" },
			});
		});

		it("should respect a custom basePath and leave other routes alone", async () => {
			const { hono } = configureHonoAuthModule({ basePath: "/auth" });

			const authResponse = await hono.request("/auth/ok");
			const defaultBasePathResponse = await hono.request("/api/auth/ok");
			const appResponse = await hono.request("/health");

			expect(authResponse.status).toBe(200);
			expect(defaultBasePathResponse.status).toBe(404);
			expect(await appResponse.text()).toBe("ok");
		});

		it("should not register Node middleware or body parsers", () => {
			const { httpAdapter, consumer } = configureHonoAuthModule();

			expect(httpAdapter.use).not.toHaveBeenCalled();
			expect(consumer.apply).not.toHaveBeenCalled();
		});

		it("should enable trustedOrigins CORS through the adapter", () => {
			const { httpAdapter } = configureHonoAuthModule({
				trustedOrigins: [TRUSTED_ORIGIN],
			});

			expect(httpAdapter.enableCors).toHaveBeenCalledWith(
				expect.objectContaining({
					origin: [TRUSTED_ORIGIN],
					credentials: true,
				}),
			);
		});

		it("should skip trustedOrigins CORS when disableTrustedOriginsCors is set", () => {
			const { httpAdapter } = configureHonoAuthModule(
				{ trustedOrigins: [TRUSTED_ORIGIN] },
				{ disableTrustedOriginsCors: true },
			);

			expect(httpAdapter.enableCors).not.toHaveBeenCalled();
		});

		it("should forward non-GET/POST methods to Better Auth", async () => {
			const { hono } = configureHonoAuthModule({
				plugins: [
					{
						id: "hono-method-test",
						endpoints: {
							deleteTestResource: createAuthEndpoint(
								"/test-resource",
								{ method: "DELETE" },
								async (ctx) => ctx.json({ deleted: true }),
							),
						},
					},
				],
			});

			const response = await hono.request("/api/auth/test-resource", {
				method: "DELETE",
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ deleted: true });
		});

		it("should warn that the middleware option is ignored", () => {
			const warnSpy = vi.spyOn(Logger.prototype, "warn");
			const middleware = vi.fn();

			configureHonoAuthModule(undefined, { middleware });

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("`middleware` is not supported"),
			);
			expect(middleware).not.toHaveBeenCalled();
		});
	},
);
