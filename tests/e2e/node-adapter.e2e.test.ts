import { faker } from "@faker-js/faker";
import { type INestApplication, Module as NestModule } from "@nestjs/common";
import { NodeAdapter } from "@nestjs/platform-node";
import { Test } from "@nestjs/testing";
import { betterAuth } from "better-auth";
import Module from "node:module";
import request from "supertest";
import { TestController } from "../shared/test-controller.ts";

type ModuleLoad = (request: string, ...rest: unknown[]) => unknown;

const moduleInternals = Module as unknown as { _load: ModuleLoad };
const originalLoad = moduleInternals._load;

// Runs with the Node adapter only: the other passes already cover the shared
// behaviour, and this file exists to prove that `express` is not needed.
describe.skipIf(process.env.TEST_HTTP_ADAPTER !== "node")(
	"node adapter e2e",
	() => {
		const expressRequests: string[] = [];
		let app: INestApplication;

		beforeAll(async () => {
			// Every `require("express")` made while the app boots is recorded and
			// refused, as if the package was not installed.
			moduleInternals._load = function (this: unknown, id, ...rest) {
				if (id === "express") {
					expressRequests.push(id);
					throw new Error("express must not be loaded with the Node adapter");
				}

				return originalLoad.call(this, id, ...rest);
			};

			// Loaded only now, so that anything the library requires while it
			// evaluates is seen by the hook above.
			const { AuthModule } = await import("../../src/index.ts");

			const auth = betterAuth({
				basePath: "/api/auth",
				emailAndPassword: { enabled: true },
			});

			@NestModule({
				imports: [AuthModule.forRoot({ auth, bodyParser: { rawBody: true } })],
				controllers: [TestController],
			})
			class AppModule {}

			const moduleRef = await Test.createTestingModule({
				imports: [AppModule],
			}).compile();

			app = moduleRef.createNestApplication(new NodeAdapter(), {
				bodyParser: false,
			});
			await app.init();
		});

		afterAll(async () => {
			moduleInternals._load = originalLoad;
			await app.close();
		});

		it("should not load express", () => {
			expect(expressRequests).toEqual([]);
		});

		it("should parse JSON bodies outside the auth base path and keep rawBody", async () => {
			const response = await request(app.getHttpServer())
				.post("/test/echo-body")
				.send({ hello: "world" })
				.expect(201);

			expect(response.body).toEqual({
				body: { hello: "world" },
				rawBody: JSON.stringify({ hello: "world" }),
			});
		});

		it("should parse nested URL-encoded bodies outside the auth base path", async () => {
			const response = await request(app.getHttpServer())
				.post("/test/form-body")
				.type("form")
				.send("a=1&b[c]=2")
				.expect(201);

			expect(response.body.body).toEqual({ a: "1", b: { c: "2" } });
		});

		it("should leave the body of Better Auth routes unread", async () => {
			const email = faker.internet.email();

			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-up/email")
				.send({
					name: faker.person.fullName(),
					email,
					password: faker.internet.password({ length: 10 }),
				})
				.expect(200);

			expect(response.body.user.email).toBe(email.toLowerCase());
		});
	},
);
