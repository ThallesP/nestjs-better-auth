import "reflect-metadata";
import request from "supertest";
import { faker } from "@faker-js/faker";
import { Module, Injectable, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ExpressAdapter } from "@nestjs/platform-express";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
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

		app = moduleRef.createNestApplication(new ExpressAdapter(), {
			bodyParser: false,
		});

		await app.init();
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

		const app = moduleRef.createNestApplication(new ExpressAdapter(), {
			bodyParser: false,
		});

		await expect(app.init()).rejects.toThrow(
			/@Hook providers.*hooks.*not configured/i,
		);
	});
});
