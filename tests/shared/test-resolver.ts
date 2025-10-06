import { Resolver, Query, ObjectType, Field } from "@nestjs/graphql";
import { AllowAnonymous, OptionalAuth, Session } from "../../src/decorators.ts";
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

/**
 * Test resolver for GraphQL authentication flows
 */
@Resolver()
export class TestResolver {
	/**
	 * Public query - accessible without authentication
	 */
	@AllowAnonymous()
	@Query(() => String)
	publicHello(): string {
		return "ok";
	}

	/**
	 * Optional authentication query - works with or without auth
	 */
	@OptionalAuth()
	@Query(() => OptionalAuthenticatedResult)
	optionalAuthenticated(
		@Session() session: UserSession,
	): OptionalAuthenticatedResult {
		return {
			authenticated: !!session,
			userId: session?.user?.id,
		};
	}

	/**
	 * Protected query - requires authentication
	 */
	@Query(() => ProtectedUserIdResult)
	protectedUserId(@Session() session: UserSession): ProtectedUserIdResult {
		return {
			userId: session?.user?.id,
		};
	}
}
