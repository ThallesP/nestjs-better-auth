import "reflect-metadata";
import request from "supertest";
import { faker } from "@faker-js/faker";
import { Module, Injectable, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer } from "better-auth/plugins/bearer";
import {
	AuthModule,
	Hook,
	BeforeHook,
	AfterHook,
	type AuthHookContext,
} from "../../src/index.ts";
import { createTestNestApplication } from "../shared/test-utils.ts";

@Injectable()
class HookTrackerService {
	beforeCalls = 0;
	afterCalls = 0;

	markBefore() {
		this.beforeCalls += 1;
	}

	markAfter() {
		this.afterCalls += 1;
	}
}

@Hook()
@Injectable()
class SignUpBeforeHook {
	constructor(private readonly tracker: HookTrackerService) {}

	@BeforeHook("/sign-up/email")
	async handle(_ctx: AuthHookContext) {
		this.tracker.markBefore();
	}
}

@Hook()
@Injectable()
class SignUpAfterHook {
	constructor(private readonly tracker: HookTrackerService) {}

	@AfterHook("/sign-up/email")
	async handle(_ctx: AuthHookContext) {
		this.tracker.markAfter();
	}
}

describe("hooks e2e", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			// ensure hooks object exists so module can extend it
			hooks: {},
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [HookTrackerService, SignUpBeforeHook, SignUpAfterHook],
		})
		class AppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = await createTestNestApplication(moduleRef);
	});

	afterAll(async () => {
		await app.close();
	});

	it("should call @BeforeHook on matching route", async () => {
		const email = faker.internet.email();
		const password = faker.internet.password({ length: 10 });
		const name = faker.person.fullName();

		const tracker = app.get(HookTrackerService);
		expect(tracker.beforeCalls).toBe(0);

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({ name, email, password })
			.expect(200);

		expect(tracker.beforeCalls).toBe(1);
	});

	it("should call @AfterHook on matching route", async () => {
		const email = faker.internet.email();
		const password = faker.internet.password({ length: 10 });
		const name = faker.person.fullName();

		const tracker = app.get(HookTrackerService);
		const before = tracker.afterCalls;

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({ name, email, password })
			.expect(200);

		expect(tracker.afterCalls).toBe(before + 1);
	});
});

@Hook()
@Injectable()
class SignUpAfterHookOne {
	@AfterHook("/sign-up/email")
	async handle(ctx: AuthHookContext) {
		ctx.setHeader("x-after-provider-one", "1");
		return { ...(ctx.context.returned as object), fromProviderOne: true };
	}
}

@Hook()
@Injectable()
class SignUpAfterHookTwo {
	@AfterHook("/sign-up/email")
	async handle(ctx: AuthHookContext) {
		ctx.setHeader("x-after-provider-two", "1");
	}
}

@Hook()
@Injectable()
class SignUpBeforeContextHook {
	@BeforeHook("/sign-up/email")
	async handle() {
		return { context: { body: { image: "https://example.com/avatar.png" } } };
	}
}

describe("hooks return values", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					if (ctx.path !== "/sign-up/email") return;
					return {
						context: { body: { ...ctx.body, name: "from-before-hook" } },
					};
				}),
				after: createAuthMiddleware(async (ctx) => {
					ctx.setHeader("x-after-hook", "1");
				}),
			},
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [
				HookTrackerService,
				SignUpBeforeHook,
				SignUpAfterHookOne,
				SignUpAfterHookTwo,
				SignUpBeforeContextHook,
			],
		})
		class AppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = await createTestNestApplication(moduleRef);
	});

	afterAll(async () => {
		await app.close();
	});

	it("should merge the context returned by the original before hook and by a @BeforeHook provider", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			})
			.expect(200);

		expect(response.body.user).toMatchObject({
			name: "from-before-hook",
			image: "https://example.com/avatar.png",
		});
	});

	it("should keep headers set by the original after hook and by every @AfterHook provider", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			})
			.expect(200);

		expect(response.headers["x-after-hook"]).toBe("1");
		expect(response.headers["x-after-provider-one"]).toBe("1");
		expect(response.headers["x-after-provider-two"]).toBe("1");
	});

	it("should use the response returned by an @AfterHook provider", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			})
			.expect(200);

		expect(response.body).toMatchObject({
			token: expect.any(String),
			fromProviderOne: true,
		});
	});
});

@Injectable()
class BeforeProviderTracker {
	calls = 0;
}

@Hook()
@Injectable()
class SignUpBeforeTrackedHook {
	constructor(private readonly tracker: BeforeProviderTracker) {}

	@BeforeHook("/sign-up/email")
	async handle() {
		this.tracker.calls += 1;
		return { context: { body: { name: "from-provider" } } };
	}
}

@Hook()
@Injectable()
class SignUpAfterCookieHookOne {
	@AfterHook("/sign-up/email")
	async handle(ctx: AuthHookContext) {
		ctx.setCookie("after-provider-one", "1");
	}
}

@Hook()
@Injectable()
class SignUpAfterCookieHookTwo {
	@AfterHook("/sign-up/email")
	async handle(ctx: AuthHookContext) {
		ctx.setCookie("after-provider-two", "1");
	}
}

describe("hooks short-circuit", () => {
	let app: INestApplication;
	let auth: ReturnType<typeof betterAuth>;

	const signUpBody = (email: string) => ({
		name: faker.person.fullName(),
		email,
		password: faker.internet.password({ length: 10 }),
	});

	beforeAll(async () => {
		auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					if (ctx.path !== "/sign-up/email") return;
					if (ctx.body?.email?.startsWith("blocked-")) {
						return { blocked: true };
					}
				}),
				after: createAuthMiddleware(async (ctx) => {
					ctx.setCookie("after-hook", "1");
				}),
			},
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [
				BeforeProviderTracker,
				SignUpBeforeTrackedHook,
				SignUpAfterCookieHookOne,
				SignUpAfterCookieHookTwo,
			],
		})
		class AppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = await createTestNestApplication(moduleRef);
	});

	afterAll(async () => {
		await app.close();
	});

	// The short-circuit is asserted through `auth.api` rather than over HTTP:
	// better-auth 1.5.4 builds a before hook's short-circuit response with the
	// request's own headers, content-length included, so the body that reaches
	// a Node HTTP client is truncated or the response never completes.
	it("should not run a @BeforeHook provider once the original before hook short-circuited", async () => {
		const tracker = app.get(BeforeProviderTracker);
		tracker.calls = 0;
		const email = `blocked-${faker.internet.email()}`;

		const result = await auth.api.signUpEmail({ body: signUpBody(email) });

		expect(result).toEqual({ blocked: true });
		expect(tracker.calls).toBe(0);
		const { internalAdapter } = await auth.$context;
		expect(await internalAdapter.findUserByEmail(email)).toBeNull();
	});

	it("should still run the @BeforeHook provider when the original before hook does not short-circuit", async () => {
		const tracker = app.get(BeforeProviderTracker);
		tracker.calls = 0;

		const response = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send(signUpBody(faker.internet.email()))
			.expect(200);

		expect(tracker.calls).toBe(1);
		expect(response.body.user.name).toBe("from-provider");
	});

	it("should send every cookie set by the original after hook and by each @AfterHook provider", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send(signUpBody(faker.internet.email()))
			.expect(200);

		const cookies = response.headers["set-cookie"] as unknown as string[];
		expect(cookies.filter((c) => c.startsWith("after-hook=1"))).toHaveLength(1);
		expect(
			cookies.filter((c) => c.startsWith("after-provider-one=1")),
		).toHaveLength(1);
		expect(
			cookies.filter((c) => c.startsWith("after-provider-two=1")),
		).toHaveLength(1);
	});
});

describe("hooks with a plain function as the original hook", () => {
	let app: INestApplication;
	let auth: ReturnType<typeof betterAuth>;

	beforeAll(async () => {
		auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			hooks: {
				// Not wrapped in createAuthMiddleware, so it ignores `returnHeaders`
				// and its own payload comes back as is.
				before: (async (ctx: { path: string }) => {
					if (ctx.path !== "/sign-up/email") return;
					return { headers: { "x-not-an-envelope": "1" }, response: "denied" };
				}) as never,
			},
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [BeforeProviderTracker, SignUpBeforeTrackedHook],
		})
		class AppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = await createTestNestApplication(moduleRef);
	});

	afterAll(async () => {
		await app.close();
	});

	it("should leave a payload that merely has headers/response keys untouched", async () => {
		const tracker = app.get(BeforeProviderTracker);
		tracker.calls = 0;

		const result = await auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		expect(result).toEqual({
			headers: { "x-not-an-envelope": "1" },
			response: "denied",
		});
		expect(tracker.calls).toBe(0);
	});
});

describe("hooks configuration validation", () => {
	it("should throw if hook providers exist without hooks configured", async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			// intentionally DO NOT set hooks: {}
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [HookTrackerService, SignUpBeforeHook],
		})
		class AppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		const app = await createTestNestApplication(moduleRef, {
			initialize: false,
		});

		await expect(app.init()).rejects.toThrow(
			/@Hook providers.*hooks.*not configured/i,
		);
	});
});
