import FastifyCors from "@fastify/cors";
import { NestFactory } from "@nestjs/core";
import {
	FastifyAdapter,
	type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
	const adapter = new FastifyAdapter();

	// Register CORS on adapter BEFORE NestFactory.create
	await adapter.register(FastifyCors, {
		origin: ["http://localhost:5173"],
		credentials: true,
		methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
		exposedHeaders: ["Set-Cookie"],
	});

	const app = await NestFactory.create<NestFastifyApplication>(
		AppModule,
		adapter,
		{ bodyParser: false },
	);

	const port = process.env.PORT ?? 5555;
	await app.listen(port, "0.0.0.0");
	console.log(`Server running on http://localhost:${port}`);
}

bootstrap();
