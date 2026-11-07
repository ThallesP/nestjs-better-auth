import "reflect-metadata";
import request from "supertest";
import { faker } from "@faker-js/faker";
import { Module, Injectable, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import {
	AuthModule,
	DatabaseHook,
	BeforeCreate,
	AfterCreate,
} from "../../src/index.ts";
import { createTestNestApplication } from "../shared/test-utils.ts";

@Injectable()
class DatabaseHookTrackerService {
	calls: { hook: string; model: string; operation: string }[] = [];

	track(hook: string, model: string, operation: string) {
		this.calls.push({ hook, model, operation });
	}

	getCalls(hook: string, model: string, operation: string) {
		return this.calls.filter(
			(c) => c.hook === hook && c.model === model && c.operation === operation,
		);
	}
}

@DatabaseHook()
@Injectable()
class UserDatabaseHook {
	constructor(private readonly tracker: DatabaseHookTrackerService) {}

	@BeforeCreate("user")
	async beforeCreate() {
		this.tracker.track("before", "user", "create");
	}

	@AfterCreate("user")
	async afterCreate() {
		this.tracker.track("after", "user", "create");
	}
}

@DatabaseHook()
@Injectable()
class SessionDatabaseHook {
	constructor(private readonly tracker: DatabaseHookTrackerService) {}

	@AfterCreate("session")
	async afterCreate() {
		this.tracker.track("after", "session", "create");
	}
}

describe("database hooks e2e", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			databaseHooks: {},
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [
				DatabaseHookTrackerService,
				UserDatabaseHook,
				SessionDatabaseHook,
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

	it("should call @BeforeCreate('user') on sign-up", async () => {
		const tracker = app.get(DatabaseHookTrackerService);
		const before = tracker.getCalls("before", "user", "create").length;

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			})
			.expect(200);

		expect(tracker.getCalls("before", "user", "create").length).toBe(
			before + 1,
		);
	});

	it("should call @AfterCreate('user') on sign-up", async () => {
		const tracker = app.get(DatabaseHookTrackerService);
		const before = tracker.getCalls("after", "user", "create").length;

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			})
			.expect(200);

		expect(tracker.getCalls("after", "user", "create").length).toBe(before + 1);
	});

	it("should call @AfterCreate('session') on sign-up", async () => {
		const tracker = app.get(DatabaseHookTrackerService);
		const before = tracker.getCalls("after", "session", "create").length;

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			})
			.expect(200);

		expect(tracker.getCalls("after", "session", "create").length).toBe(
			before + 1,
		);
	});

	it("should support dependency injection in database hook providers", async () => {
		const tracker = app.get(DatabaseHookTrackerService);
		expect(tracker).toBeInstanceOf(DatabaseHookTrackerService);

		const beforeCount = tracker.calls.length;

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			})
			.expect(200);

		// DI works: tracker was injected and received calls
		expect(tracker.calls.length).toBeGreaterThan(beforeCount);
	});
});

@Injectable()
class BeforeCreateTracker {
	originalCalls = 0;
	received: { name?: string; image?: string }[] = [];
}

@DatabaseHook()
@Injectable()
class UserBeforeCreateHookOne {
	@BeforeCreate("user")
	async beforeCreate() {
		return { data: { image: "https://example.com/avatar.png" } };
	}
}

@DatabaseHook()
@Injectable()
class UserBeforeCreateBlockingHook {
	@BeforeCreate("user")
	async beforeCreate(user: { email: string }) {
		if (user.email.startsWith("provider-blocked-")) return false;
	}
}

@DatabaseHook()
@Injectable()
class UserBeforeCreateHookTwo {
	constructor(private readonly tracker: BeforeCreateTracker) {}

	@BeforeCreate("user")
	async beforeCreate(user: { name?: string; image?: string }) {
		this.tracker.received.push({ name: user.name, image: user.image });
	}
}

describe("database hooks return values", () => {
	let app: INestApplication;
	let auth: ReturnType<typeof betterAuth>;
	const tracker = new BeforeCreateTracker();

	const signUp = (email = faker.internet.email()) =>
		request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({
				name: faker.person.fullName(),
				email,
				password: faker.internet.password({ length: 10 }),
			});

	beforeAll(async () => {
		auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => {
							tracker.originalCalls += 1;
							if (user.email.startsWith("blocked-")) return false;
							return { data: { name: "from-database-hook" } };
						},
					},
				},
			},
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [
				{ provide: BeforeCreateTracker, useValue: tracker },
				UserBeforeCreateHookOne,
				UserBeforeCreateBlockingHook,
				UserBeforeCreateHookTwo,
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

	it("should keep the data returned by the original databaseHooks before hook", async () => {
		const response = await signUp().expect(200);

		expect(response.body.user.name).toBe("from-database-hook");
	});

	it("should keep the data returned by an earlier @BeforeCreate provider", async () => {
		const response = await signUp().expect(200);

		expect(response.body.user.image).toBe("https://example.com/avatar.png");
	});

	it("should pass the merged data to the next @BeforeCreate provider", async () => {
		const tracker = app.get(BeforeCreateTracker);
		tracker.received = [];

		await signUp().expect(200);

		expect(tracker.received).toEqual([
			{ name: "from-database-hook", image: "https://example.com/avatar.png" },
		]);
	});

	// Better Auth's createWithHooks returns null on false, which sign-up
	// answers with FAILED_TO_CREATE_USER (400).
	const expectAborted = async (email: string, response: request.Response) => {
		expect(response.status).toBe(400);
		expect(response.body.code).toBe("FAILED_TO_CREATE_USER");
		const { internalAdapter } = await auth.$context;
		expect(await internalAdapter.findUserByEmail(email)).toBeNull();
	};

	it("should abort the operation when the original before hook returns false", async () => {
		tracker.originalCalls = 0;
		tracker.received = [];
		const email = `blocked-${faker.internet.email()}`;

		const response = await signUp(email);

		expect(tracker.originalCalls).toBe(1);
		expect(tracker.received).toEqual([]);
		await expectAborted(email, response);
	});

	it("should abort the operation when a @BeforeCreate provider returns false", async () => {
		tracker.originalCalls = 0;
		tracker.received = [];
		const email = `provider-blocked-${faker.internet.email()}`;

		const response = await signUp(email);

		expect(tracker.originalCalls).toBe(1);
		expect(tracker.received).toEqual([]);
		await expectAborted(email, response);
	});
});

describe("database hooks configuration validation", () => {
	it("should throw if database hook providers exist without databaseHooks configured", async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			// intentionally DO NOT set databaseHooks: {}
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [DatabaseHookTrackerService, UserDatabaseHook],
		})
		class AppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		const app = await createTestNestApplication(moduleRef, {
			initialize: false,
		});

		await expect(app.init()).rejects.toThrow(
			/@DatabaseHook providers.*databaseHooks.*not configured/i,
		);
	});
});
