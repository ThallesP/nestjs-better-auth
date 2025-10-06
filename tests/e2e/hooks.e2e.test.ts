import "reflect-metadata";
import request from "supertest";
import { Module, Injectable, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ExpressAdapter } from "@nestjs/platform-express";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { generateTestUser } from "../shared/test-utils.ts";
import {
	AuthModule,
	Hook,
	BeforeHook,
	AfterHook,
	type AuthHookContext,
} from "../../src/index.ts";

@Injectable()
class HookTrackerService {
	beforeCalls = 0;
	afterCalls = 0;

	reset() {
		this.beforeCalls = 0;
		this.afterCalls = 0;
	}

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
	let tracker: HookTrackerService;

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

		app = moduleRef.createNestApplication(new ExpressAdapter(), {
			bodyParser: false,
		});

		await app.init();
		tracker = app.get(HookTrackerService);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		tracker.reset();
	});

	describe("@BeforeHook", () => {
		it("should execute before matching route", async () => {
			const userData = generateTestUser();
			expect(tracker.beforeCalls).toBe(0);

			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData)
				.expect(200);

			expect(tracker.beforeCalls).toBe(1);
		});

		it("should not execute for non-matching routes", async () => {
			const userData = generateTestUser();
			// Sign up first
			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData);

			// Reset tracker after signup
			tracker.reset();

			// Call different endpoint
			await request(app.getHttpServer())
				.post("/api/auth/sign-in/email")
				.set("Content-Type", "application/json")
				.send({ email: userData.email, password: userData.password });

			// Should not have triggered the sign-up hook
			expect(tracker.beforeCalls).toBe(0);
		});
	});

	describe("@AfterHook", () => {
		it("should execute after matching route", async () => {
			const userData = generateTestUser();
			expect(tracker.afterCalls).toBe(0);

			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData)
				.expect(200);

			expect(tracker.afterCalls).toBe(1);
		});

		it("should execute after @BeforeHook", async () => {
			const userData = generateTestUser();

			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData)
				.expect(200);

			// Both hooks should have executed
			expect(tracker.beforeCalls).toBe(1);
			expect(tracker.afterCalls).toBe(1);
		});
	});
});

describe("hooks configuration validation", () => {
	describe("with hook providers", () => {
		it("should throw error when hooks is undefined", async () => {
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

			const app = moduleRef.createNestApplication(new ExpressAdapter(), {
				bodyParser: false,
			});

			await expect(app.init()).rejects.toThrow(
				/@Hook providers.*hooks.*not configured/i,
			);
		});

		it("should throw error when hooks is null", async () => {
			const auth = betterAuth({
				basePath: "/api/auth",
				emailAndPassword: { enabled: true },
				plugins: [bearer()],
				// @ts-expect-error - testing null case
				hooks: null,
			});

			@Module({
				imports: [AuthModule.forRoot({ auth })],
				providers: [HookTrackerService, SignUpBeforeHook],
			})
			class AppModule {}

			const moduleRef = await Test.createTestingModule({
				imports: [AppModule],
			}).compile();

			const app = moduleRef.createNestApplication(new ExpressAdapter(), {
				bodyParser: false,
			});

			await expect(app.init()).rejects.toThrow(
				/@Hook providers.*hooks.*not configured/i,
			);
		});

		it("should work when hooks is empty object", async () => {
			const auth = betterAuth({
				basePath: "/api/auth",
				emailAndPassword: { enabled: true },
				plugins: [bearer()],
				hooks: {}, // proper configuration
			});

			@Module({
				imports: [AuthModule.forRoot({ auth })],
				providers: [HookTrackerService, SignUpBeforeHook],
			})
			class AppModule {}

			const moduleRef = await Test.createTestingModule({
				imports: [AppModule],
			}).compile();

			const app = moduleRef.createNestApplication(new ExpressAdapter(), {
				bodyParser: false,
			});

			// Should initialize successfully
			await expect(app.init()).resolves.not.toThrow();

			// Hooks should be functional
			const userData = generateTestUser();
			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData)
				.expect(200);

			await app.close();
		});
	});

	describe("without hook providers", () => {
		it("should work when hooks is undefined", async () => {
			const auth = betterAuth({
				basePath: "/api/auth",
				emailAndPassword: { enabled: true },
				plugins: [bearer()],
				// hooks is undefined
			});

			@Module({
				imports: [AuthModule.forRoot({ auth })],
				// No hook providers
				providers: [HookTrackerService],
			})
			class AppModule {}

			const moduleRef = await Test.createTestingModule({
				imports: [AppModule],
			}).compile();

			const app = moduleRef.createNestApplication(new ExpressAdapter(), {
				bodyParser: false,
			});

			await expect(app.init()).resolves.not.toThrow();

			const userData = generateTestUser();
			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData)
				.expect(200);

			await app.close();
		});

		it("should work when hooks is null", async () => {
			const auth = betterAuth({
				basePath: "/api/auth",
				emailAndPassword: { enabled: true },
				plugins: [bearer()],
				// @ts-expect-error - testing null case
				hooks: null,
			});

			@Module({
				imports: [AuthModule.forRoot({ auth })],
				providers: [HookTrackerService],
			})
			class AppModule {}

			const moduleRef = await Test.createTestingModule({
				imports: [AppModule],
			}).compile();

			const app = moduleRef.createNestApplication(new ExpressAdapter(), {
				bodyParser: false,
			});

			await expect(app.init()).resolves.not.toThrow();

			const userData = generateTestUser();
			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData)
				.expect(200);

			await app.close();
		});

		it("should work when hooks is empty object", async () => {
			const auth = betterAuth({
				basePath: "/api/auth",
				emailAndPassword: { enabled: true },
				plugins: [bearer()],
				hooks: {}, // empty hooks object
			});

			@Module({
				imports: [AuthModule.forRoot({ auth })],
				// No hook providers - just a regular service
				providers: [HookTrackerService],
			})
			class AppModule {}

			const moduleRef = await Test.createTestingModule({
				imports: [AppModule],
			}).compile();

			const app = moduleRef.createNestApplication(new ExpressAdapter(), {
				bodyParser: false,
			});

			await expect(app.init()).resolves.not.toThrow();

			const userData = generateTestUser();
			await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.set("Content-Type", "application/json")
				.send(userData)
				.expect(200);

			await app.close();
		});
	});
});
