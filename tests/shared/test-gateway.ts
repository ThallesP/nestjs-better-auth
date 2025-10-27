import {
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	WsResponse,
} from "@nestjs/websockets";
import { from, map, Observable } from "rxjs";
import { Namespace } from "socket.io";
import {
	AllowAnonymous,
	OptionalAuth,
	Session,
	type UserSession,
} from "../../src/index.ts";
import { UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../src/auth-guard.ts";

@WebSocketGateway({
	path: "/ws",
	namespace: "test",
	cors: {
		origin: "*",
	},
})
@UseGuards(AuthGuard)
export class TestGateway {
	@WebSocketServer()
	namespace: Namespace;

	public static readonly RESPONSE = "Hello World!";
	public static readonly ANONYMOUS = "anonymous";
	public static readonly PROTECTED = "protected";
	public static readonly OPTIONAL = "optional";

	@SubscribeMessage(TestGateway.ANONYMOUS)
	@AllowAnonymous()
	handleHello(): Observable<WsResponse<string>> {
		return from(TestGateway.RESPONSE.split("")).pipe(
			map((char) => ({ event: TestGateway.ANONYMOUS, data: char })),
		);
	}

	@SubscribeMessage(TestGateway.PROTECTED)
	handleProtected(
		@Session() session: UserSession,
	): Observable<WsResponse<string>> {
		return from(session.user.name.split("")).pipe(
			map((char) => ({ event: TestGateway.PROTECTED, data: char })),
		);
	}

	@OptionalAuth()
	@SubscribeMessage(TestGateway.OPTIONAL)
	handleOptionalAuth(
		@Session() session: UserSession,
	): Observable<WsResponse<string>> {
		const message = session
			? `Hello authenticated user: ${session.user.name}`
			: "Hello anonymous user";

		return from(message.split("")).pipe(
			map((char) => ({ event: TestGateway.OPTIONAL, data: char })),
		);
	}
}
