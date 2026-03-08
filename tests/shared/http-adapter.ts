import type {
	INestApplication,
	INestApplicationContext,
	NestApplicationOptions,
} from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { TestingModule } from "@nestjs/testing";

const testHttpAdapter = process.env.TEST_HTTP_ADAPTER ?? "express";

export function createTestHttpAdapter() {
	if (testHttpAdapter === "fastify") {
		return new FastifyAdapter();
	}

	return new ExpressAdapter();
}

export async function initTestApplication<T extends INestApplicationContext>(
	app: T,
): Promise<T> {
	await app.init();

	if (testHttpAdapter === "fastify") {
		const httpAdapter = (app as INestApplication).getHttpAdapter();
		await httpAdapter.getInstance().ready();
	}

	return app;
}

export async function createTestApplication(
	moduleRef: TestingModule,
	options?: NestApplicationOptions,
) {
	const app = moduleRef.createNestApplication(createTestHttpAdapter(), options);
	return initTestApplication(app);
}
