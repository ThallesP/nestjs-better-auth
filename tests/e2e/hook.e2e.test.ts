import request from "supertest";
import { faker } from "@faker-js/faker";
import { INestApplication, Injectable, Module } from "@nestjs/common";
import {
  AfterHook,
  AuthHookContext,
  BeforeHook,
  Hook,
} from "../../src/decorators.ts";
import { Test } from "@nestjs/testing";
import { AuthModule } from "../../src/index.ts";
import { ExpressAdapter } from "@nestjs/platform-express";
import { betterAuth } from "better-auth";

@Hook()
@Injectable()
class SignUpHook {
  public beforeHookCalled = false;
  public afterHookCalled = false;

  @BeforeHook("/sign-up/email")
  async beforeHookHandler(ctx: AuthHookContext) {
    console.log("beforeHookCalled");
    this.beforeHookCalled = true;
    return ctx;
  }

  @AfterHook("/sign-up/email")
  async afterHookHandler(ctx: AuthHookContext) {
    this.afterHookCalled = true;
    return ctx;
  }
}

describe("hook e2e", () => {
  let app: INestApplication;
  let signUpHook: SignUpHook;

  beforeAll(async () => {
    const auth = betterAuth({
      emailAndPassword: { enabled: true },
      hooks: {},
    });

    @Module({
      imports: [AuthModule.forRoot({ auth })],
      providers: [SignUpHook],
    })
    class AppModule { }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication(new ExpressAdapter(), {
      bodyParser: false,
    });

    // Get the hook instance to check if it was called
    signUpHook = moduleRef.get<SignUpHook>(SignUpHook);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should call @BeforeHook", async () => {
    // Reset hook call flags
    signUpHook.beforeHookCalled = false;
    signUpHook.afterHookCalled = false;

    await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .set("Content-Type", "application/json")
      .send({
        name: faker.person.fullName,
        email: faker.internet.email(),
        password: faker.internet.password(),
      })
      .expect(200);

    // Verify that the before hook was called
    expect(signUpHook.beforeHookCalled).toBe(true);
  });

  it("should call @AfterHook", async () => {
    // Reset hook call flags
    signUpHook.beforeHookCalled = false;
    signUpHook.afterHookCalled = false;

    await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .set("Content-Type", "application/json")
      .send({
        name: faker.person.fullName,
        email: faker.internet.email(),
        password: faker.internet.password(),
      })
      .expect(200);

    // Verify that the after hook was called
    expect(signUpHook.afterHookCalled).toBe(true);
  });
});
