import { Controller, Delete, Param, ParseIntPipe } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { RemoveFromTeamService } from "../services";

@Controller("pokemon")
export class RemoveFromTeamController {
	constructor(private readonly removeFromTeamService: RemoveFromTeamService) {}

	@Delete("team/:pokemonId")
	handle(
		@Session() session: UserSession,
		@Param("pokemonId", ParseIntPipe) pokemonId: number,
	) {
		const team = this.removeFromTeamService.execute(session.user.id, pokemonId);
		return { message: "Pokemon removed from team", team };
	}
}
