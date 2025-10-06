import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { Module, type INestApplication } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import type { Request, Response } from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import { bearer } from "better-auth/plugins/bearer";
import { faker } from "@faker-js/faker";
import { AuthModule } from "../../src/index.ts";
import { betterAuth } from "better-auth";
import { TestController } from "./test-controller.ts";
import { TestResolver } from "./test-resolver.ts";

// Create Better Auth instance factory
export function createTestAuth() {
	return betterAuth({
		basePath: "/api/auth",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [bearer()],
	});
}

// Helper to generate test user data
export function generateTestUser() {
	return {
		name: faker.person.fullName(),
		email: faker.internet.email(),
		password: faker.internet.password({ length: 10 }),
	};
}

// Helper to sign up a test user
export async function signUpTestUser(auth: ReturnType<typeof createTestAuth>) {
	const userData = generateTestUser();
	const signUp = await auth.api.signUpEmail({
		body: userData,
	});
	return { ...signUp, credentials: userData };
}

// Test app module factory
export function createTestAppModule(auth: ReturnType<typeof createTestAuth>) {
	@Module({
		imports: [
			AuthModule.forRoot({ auth }),
			GraphQLModule.forRoot<ApolloDriverConfig>({
				driver: ApolloDriver,
				autoSchemaFile: true,
				path: "/graphql",
				context: ({ req, res }: { req: Request; res: Response }) => ({
					req,
					res,
				}),
			}),
		],
		controllers: [TestController],
		providers: [TestResolver],
	})
	class AppModule {}

	return AppModule;
}

// Factory function to create and configure a test NestJS application
export async function createTestApp() {
	const auth = createTestAuth();
	const AppModule = createTestAppModule(auth);

	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleRef.createNestApplication(new ExpressAdapter(), {
		bodyParser: false,
	});

	await app.init();

	return { app, auth };
}

export interface TestAppSetup {
	app: INestApplication;
	auth: ReturnType<typeof createTestAuth>;
}
