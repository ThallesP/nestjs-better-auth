import { faker } from "@faker-js/faker";
import {
	Inject,
	Injectable,
	Module,
	type INestApplication,
	type OnModuleInit,
} from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Session } from "better-auth";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import "reflect-metadata";
import request from "supertest";
import {
	AfterDatabaseHook,
	AfterHook,
	AuthModule,
	AuthService,
	BeforeDatabaseHook,
	BeforeHook,
	DatabaseHook,
	Hook,
	type AuthHookContext,
} from "../../src/index.ts";

@Injectable()
class HookTrackerService {
	beforeCalls = 0;
	afterCalls = 0;
	beforeDatabaseCalls = 0;
	afterDatabaseCalls = 0;

	markBefore() {
		this.beforeCalls += 1;
	}

	markAfter() {
		this.afterCalls += 1;
	}

	markBeforeDatabase() {
		this.beforeDatabaseCalls += 1;
	}

	markAfterDatabase() {
		this.afterDatabaseCalls += 1;
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

@DatabaseHook()
@Injectable()
class SessionDatabaseHook {
	constructor(private readonly tracker: HookTrackerService) {}

	@BeforeDatabaseHook("session", "create")
	async beforeSessionCreate(session: Session) {
		this.tracker.markBeforeDatabase();
		return {
			data: {
				...session,
				customField: "value",
			},
		};
	}

	@AfterDatabaseHook("session", "create")
	async afterSessionCreate(_session: Session) {
		this.tracker.markAfterDatabase();
	}
}

const EMAIL_TOKEN = Symbol("EMAIL_TOKEN");
const DATABASE_TOKEN = Symbol("DATABASE_TOKEN");

@Injectable()
class FakeEmailClient {
	async send(): Promise<void> {
		// no-op
	}
}

@Injectable()
class FakeAdminDatabase {}

@Module({
	providers: [
		{ provide: EMAIL_TOKEN, useClass: FakeEmailClient },
		{ provide: DATABASE_TOKEN, useClass: FakeAdminDatabase },
	],
	exports: [EMAIL_TOKEN, DATABASE_TOKEN],
})
class AsyncHookDepsModule {}

@DatabaseHook()
@Injectable()
class SessionDatabaseHookWithDeps implements OnModuleInit {
	constructor(
		@Inject(DATABASE_TOKEN) private readonly db: FakeAdminDatabase,
		private readonly authService: AuthService,
		private readonly tracker: HookTrackerService,
	) {}

	onModuleInit() {
		void this.db;
		const hooks = this.authService.instance?.options.databaseHooks;
		// Access the hook map similar to the user's reproduction to ensure it exists
		if (!hooks) throw new Error("Database hooks map not configured");
	}

	@BeforeDatabaseHook("session", "create")
	async before(session: Session) {
		this.tracker.markBeforeDatabase();
		return {
			data: {
				...session,
				meta: "hooked",
			},
		};
	}

	@AfterDatabaseHook("session", "create")
	async after(_session: Session) {
		this.tracker.markAfterDatabase();
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
			databaseHooks: {},
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

describe("database hooks e2e", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			hooks: {},
			databaseHooks: {},
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [HookTrackerService, SessionDatabaseHook],
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

	it("should call @BeforeDatabaseHook on matching model operation", async () => {
		const email = faker.internet.email();
		const password = faker.internet.password({ length: 10 });
		const name = faker.person.fullName();

		const tracker = app.get(HookTrackerService);
		const before = tracker.beforeDatabaseCalls;

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({ name, email, password })
			.expect(200);

		expect(tracker.beforeDatabaseCalls).toBe(before + 1);
	});

	it("should call @AfterDatabaseHook on matching model operation", async () => {
		const email = faker.internet.email();
		const password = faker.internet.password({ length: 10 });
		const name = faker.person.fullName();

		const tracker = app.get(HookTrackerService);
		const before = tracker.afterDatabaseCalls;

		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({ name, email, password })
			.expect(200);

		expect(tracker.afterDatabaseCalls).toBe(before + 1);
	});
});

describe("database hooks with async module", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
			hooks: {},
			databaseHooks: {},
		});

		@Module({
			imports: [
				AsyncHookDepsModule,
				AuthModule.forRootAsync({
					imports: [AsyncHookDepsModule],
					inject: [EMAIL_TOKEN, DATABASE_TOKEN],
					useFactory: (
						_emailClient: FakeEmailClient,
						_db: FakeAdminDatabase,
					) => ({
						auth,
					}),
				}),
			],
			providers: [HookTrackerService, SessionDatabaseHookWithDeps],
		})
		class AsyncHooksModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AsyncHooksModule],
		}).compile();

		app = moduleRef.createNestApplication(new ExpressAdapter(), {
			bodyParser: false,
		});

		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("should trigger before database hook when using forRootAsync", async () => {
		const tracker = app.get(HookTrackerService);
		const email = faker.internet.email();
		const password = faker.internet.password({ length: 10 });
		const name = faker.person.fullName();

		const before = tracker.beforeDatabaseCalls;
		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({ name, email, password })
			.expect(200);

		expect(tracker.beforeDatabaseCalls).toBe(before + 1);
	});

	it("should trigger after database hook when using forRootAsync", async () => {
		const tracker = app.get(HookTrackerService);
		const email = faker.internet.email();
		const password = faker.internet.password({ length: 10 });
		const name = faker.person.fullName();

		const before = tracker.afterDatabaseCalls;
		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.set("Content-Type", "application/json")
			.send({ name, email, password })
			.expect(200);

		expect(tracker.afterDatabaseCalls).toBe(before + 1);
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

describe("database hooks configuration validation", () => {
	it("should throw if database hook providers exist without databaseHooks configured", async () => {
		const auth = betterAuth({
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [bearer()],
		});

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			providers: [HookTrackerService, SessionDatabaseHook],
		})
		class AppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		const app = moduleRef.createNestApplication(new ExpressAdapter(), {
			bodyParser: false,
		});

		await expect(app.init()).rejects.toThrow(
			/@DatabaseHook providers.*databaseHooks.*not configured/i,
		);
	});
});
