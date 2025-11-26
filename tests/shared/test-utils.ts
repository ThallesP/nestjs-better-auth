import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { Module, type INestApplication } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import type { Request, Response } from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import { bearer } from "better-auth/plugins/bearer";
import { AuthModule } from "../../src/index.ts";
import { betterAuth } from "better-auth";
import { TestController } from "./test-controller.ts";
import { TestResolver } from "./test-resolver.ts";
import { TestGateway } from "./test-gateway.ts";
import { admin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import {
	type OPTIONS_TYPE,
} from "../../src/auth-module-definition.ts";

// Create Better Auth instance factory
export function createTestAuth() {
	return betterAuth({
		basePath: "/api/auth",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			bearer(),
			admin({
				roles: {
					admin: adminAc,
					moderator: userAc, // moderator has same permissions as user but is a different custom role
					user: userAc,
				},
			}),
		],
	});
}

// Test app module factory
export function createTestAppModule(
	async: boolean,
	auth: ReturnType<typeof createTestAuth>,
	options?: Omit<typeof OPTIONS_TYPE, "auth">,
) {
	const authModule = async ? AuthModule.forRootAsync({
		useFactory: async () => ({ auth, ...options }),
	}) : AuthModule.forRoot({ auth, ...options });

	@Module({
		imports: [
			authModule,
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
		providers: [TestResolver, TestGateway],
	})
	class AppModule {}

	return AppModule;
}

// Factory function to create and configure a test NestJS application
export async function createTestApp(options?: Omit<typeof OPTIONS_TYPE, "auth">, async = false) {
	const auth = createTestAuth();
	const AppModule = createTestAppModule(async, auth, options);

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
