import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { faker } from "@faker-js/faker";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { type Socket as ServerSocket } from "socket.io";
import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";
import { TestGateway } from "../shared/test-gateway.ts";
import { WsException } from "@nestjs/websockets";

function waitFor(socket: ServerSocket | ClientSocket, event: string) {
	return new Promise((resolve) => {
		socket.once(event, resolve);
	});
}

function collectStreamData(
	socket: ClientSocket,
	event: string,
	expectedLength: number,
) {
	return new Promise<string>((resolve) => {
		const receivedData: string[] = [];

		socket.on(event, (data: string) => {
			receivedData.push(data);
			if (receivedData.length === expectedLength) {
				resolve(receivedData.join(""));
			}
		});
	});
}

describe("websocket auth e2e", () => {
	let testSetup: TestAppSetup;
	let clientSocket: ClientSocket;
	let port: number;

	beforeAll(async () => {
		testSetup = await createTestApp();
		await testSetup.app.listen(0);
		port = testSetup.app.getHttpServer().address()?.port;
	});

	afterAll(async () => {
		await testSetup.app.close();
	});

	afterEach(() => {
		if (clientSocket?.connected) {
			clientSocket.disconnect();
		}
	});

	it("should allow anonymous access to public websocket event", async () => {
		clientSocket = ioc(`http://localhost:${port}/test`, {
			path: "/ws",
		});

		await waitFor(clientSocket, "connect");

		// Emit the event and collect the streamed response
		const responsePromise = collectStreamData(
			clientSocket,
			TestGateway.ANONYMOUS,
			TestGateway.RESPONSE.length,
		);

		clientSocket.emit(TestGateway.ANONYMOUS);

		const result = await responsePromise;
		expect(result).toBe(TestGateway.RESPONSE);
	});

	it("should reject unauthenticated access to protected websocket event", async () => {
		clientSocket = ioc(`http://localhost:${port}/test`, {
			path: "/ws",
		});

		await waitFor(clientSocket, "connect");

		clientSocket.emit(TestGateway.PROTECTED);

		const error = (await waitFor(clientSocket, "exception")) as WsException;
		expect(error.message).toBe("UNAUTHORIZED");
	});

	it("should allow authenticated access to protected websocket event", async () => {
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		clientSocket = ioc(`http://localhost:${port}/test`, {
			path: "/ws",
			extraHeaders: {
				Authorization: `Bearer ${signUp.token}`,
			},
		});

		await waitFor(clientSocket, "connect");

		const responsePromise = collectStreamData(
			clientSocket,
			TestGateway.PROTECTED,
			signUp.user.name.length,
		);

		clientSocket.emit(TestGateway.PROTECTED);

		const result = await responsePromise;
		expect(result).toBe(signUp.user.name);
	});

	it("should allow anonymous access to optional auth websocket event", async () => {
		clientSocket = ioc(`http://localhost:${port}/test`, {
			path: "/ws",
		});

		await waitFor(clientSocket, "connect");

		const expectedMessage = "Hello anonymous user";
		const responsePromise = collectStreamData(
			clientSocket,
			TestGateway.OPTIONAL,
			expectedMessage.length,
		);

		clientSocket.emit(TestGateway.OPTIONAL);

		const result = await responsePromise;
		expect(result).toBe(expectedMessage);
	});

	it("should allow authenticated access to optional auth websocket event", async () => {
		const signUp = await testSetup.auth.api.signUpEmail({
			body: {
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password({ length: 10 }),
			},
		});

		clientSocket = ioc(`http://localhost:${port}/test`, {
			path: "/ws",
			extraHeaders: {
				Authorization: `Bearer ${signUp.token}`,
			},
		});

		await waitFor(clientSocket, "connect");

		const expectedMessage = `Hello authenticated user: ${signUp.user.name}`;
		const responsePromise = collectStreamData(
			clientSocket,
			TestGateway.OPTIONAL,
			expectedMessage.length,
		);

		clientSocket.emit(TestGateway.OPTIONAL);

		const result = await responsePromise;
		expect(result).toBe(expectedMessage);
	});

	it("should handle websocket connection with invalid token", async () => {
		clientSocket = ioc(`http://localhost:${port}/test`, {
			path: "/ws",
			extraHeaders: {
				Authorization: "Bearer invalid-token",
			},
		});

		await waitFor(clientSocket, "connect");

		clientSocket.emit(TestGateway.PROTECTED);

		const error = (await waitFor(clientSocket, "exception")) as WsException;
		expect(error.message).toBe("UNAUTHORIZED");
	});
});
