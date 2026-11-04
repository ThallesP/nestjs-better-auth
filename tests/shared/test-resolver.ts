import {
	Resolver,
	Query,
	ObjectType,
	Field,
	Mutation,
	ResolveField,
} from "@nestjs/graphql";
import { AllowAnonymous, OptionalAuth, Roles } from "../../src/decorators.ts";
import { Session } from "../../src/decorators.ts";
import type { UserSession } from "../../src/auth-guard.ts";

@ObjectType()
class ProtectedUserIdResult {
	@Field({ nullable: true })
	userId?: string;
}

@ObjectType()
class OptionalAuthenticatedResult {
	@Field()
	authenticated!: boolean;

	@Field(() => String, { nullable: true })
	userId?: string;
}

@ObjectType()
class SessionItem {
	@Field()
	id!: string;
}

@Resolver()
export class TestResolver {
	@AllowAnonymous()
	@Query(() => String)
	publicHello(): string {
		return "ok";
	}

	@OptionalAuth()
	@Query(() => OptionalAuthenticatedResult)
	optionalAuthenticated(@Session() session: UserSession) {
		return {
			authenticated: !!session,
			userId: session?.user?.id,
		};
	}

	@Roles(["admin"])
	@Query(() => String)
	adminProtected(): string {
		return "admin ok";
	}

	@Roles(["admin", "moderator"])
	@Query(() => String)
	adminModeratorProtected(): string {
		return "admin or moderator ok";
	}

	@Query(() => ProtectedUserIdResult)
	protectedUserId(@Session() session: UserSession) {
		return {
			userId: session?.user?.id,
		};
	}
}

@Resolver(() => SessionItem)
export class SessionItemResolver {
	@Query(() => [SessionItem])
	sessionItems(): SessionItem[] {
		return [{ id: "1" }, { id: "2" }, { id: "3" }];
	}

	@Mutation(() => String, { nullable: true })
	sessionUserId(@Session() session: UserSession) {
		return session?.user?.id;
	}

	@ResolveField(() => String, { nullable: true })
	userId(@Session() session: UserSession) {
		return session?.user?.id;
	}
}
