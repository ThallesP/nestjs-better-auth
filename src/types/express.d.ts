import type { Session as BetterAuthSession, User } from "better-auth/types";

declare global {
	namespace Express {
		interface Request {
			session: BetterAuthSession | null;
			user: User | null;
		}
	}
}
