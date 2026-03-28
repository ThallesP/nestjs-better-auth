import request from "supertest";
import { faker } from "@faker-js/faker";
import { Test } from "@nestjs/testing";
import {
	Controller,
	Get,
	Inject,
	Module,
	Req,
	type INestApplication,
} from "@nestjs/common";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { username } from "better-auth/plugins/username";
import { admin } from "better-auth/plugins/admin";
import { Session } from "../../src/decorators.ts";
import { AuthModule, AuthService } from "../../src/index.ts";
import {
	createTestHttpAdapter,
	initTestApplication,
} from "../shared/http-adapter.ts";
import type { UserSession } from "../../src/auth-guard.ts";
import { fromNodeHeaders } from "better-auth/node";

function createAuthWithUsername() {
	return betterAuth({
		basePath: "/api/auth",
		emailAndPassword: { enabled: true },
		plugins: [bearer(), username(), admin()],
	});
}

type AuthWithUsername = ReturnType<typeof createAuthWithUsername>;

@Controller("session-test")
class SessionTestController {
	constructor(
		@Inject(AuthService)
		private readonly authService: AuthService<AuthWithUsername>,
	) {}

	@Get("session")
	getSession(@Session() session: UserSession<AuthWithUsername>) {
		return {
			user: session?.user,
			session: session?.session,
		};
	}

	@Get("compare")
	async compareSessionSources(
		@Session() session: UserSession<AuthWithUsername>,
		@Req() req: { headers: Record<string, string | string[] | undefined> },
	) {
		const apiSession = await this.authService.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		return {
			decorator: {
				username: session?.user?.username ?? null,
				displayUsername: session?.user?.displayUsername ?? null,
			},
			api: {
				username: apiSession?.user?.username ?? null,
				displayUsername: apiSession?.user?.displayUsername ?? null,
			},
		};
	}
}

describe("session custom fields e2e", () => {
	let app: INestApplication;
	let auth: AuthWithUsername;

	beforeAll(async () => {
		auth = createAuthWithUsername();

		@Module({
			imports: [AuthModule.forRoot({ auth })],
			controllers: [SessionTestController],
		})
		class TestAppModule {}

		const moduleRef = await Test.createTestingModule({
			imports: [TestAppModule],
		}).compile();

		const adapter = createTestHttpAdapter();
		app = moduleRef.createNestApplication(adapter, { bodyParser: false });
		await initTestApplication(app);
	});

	afterAll(async () => {
		await app.close();
	});

	it("should include username plugin fields in @Session() output", async () => {
		const testUsername = `user_${faker.string.alphanumeric(8)}`;

		const signUp = await auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
				username: testUsername,
			},
		});

		const response = await request(app.getHttpServer())
			.get("/session-test/session")
			.set("Authorization", `Bearer ${signUp.token}`)
			.expect(200);

		expect(response.body.user).toHaveProperty("username");
		expect(response.body.user.username).toBe(testUsername.toLowerCase());
		expect(response.body.user).toHaveProperty("id");
		expect(response.body.user).toHaveProperty("name");
		expect(response.body.user).toHaveProperty("email");
	});

	it("should include displayUsername plugin field in @Session() output", async () => {
		const testUsername = `user_${faker.string.alphanumeric(8)}`;
		const testDisplayUsername = `Display_${faker.string.alphanumeric(5)}`;

		const signUp = await auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
				username: testUsername,
				displayUsername: testDisplayUsername,
			},
		});

		const response = await request(app.getHttpServer())
			.get("/session-test/session")
			.set("Authorization", `Bearer ${signUp.token}`)
			.expect(200);

		expect(response.body.user).toHaveProperty("displayUsername");
		expect(response.body.user.displayUsername).toBe(testDisplayUsername);
	});

	it("should return identical plugin fields from @Session() and authService.api.getSession()", async () => {
		const testUsername = `user_${faker.string.alphanumeric(8)}`;
		const testDisplayUsername = `Display_${faker.string.alphanumeric(5)}`;

		const signUp = await auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
				username: testUsername,
				displayUsername: testDisplayUsername,
			},
		});

		const response = await request(app.getHttpServer())
			.get("/session-test/compare")
			.set("Authorization", `Bearer ${signUp.token}`)
			.expect(200);

		expect(response.body.decorator.username).toBe(response.body.api.username);
		expect(response.body.decorator.displayUsername).toBe(
			response.body.api.displayUsername,
		);
		expect(response.body.decorator.username).toBe(testUsername.toLowerCase());
		expect(response.body.decorator.displayUsername).toBe(testDisplayUsername);
	});
});
