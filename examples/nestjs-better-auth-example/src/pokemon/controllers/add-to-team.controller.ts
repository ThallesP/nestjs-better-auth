import { Controller, Param, ParseIntPipe, Post } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { AddToTeamService, GetPokemonByIdService } from "../services";

@Controller("pokemon")
export class AddToTeamController {
	constructor(
		private readonly addToTeamService: AddToTeamService,
		private readonly getPokemonByIdService: GetPokemonByIdService,
	) {}

	@Post("team/:pokemonId")
	async handle(
		@Session() session: UserSession,
		@Param("pokemonId", ParseIntPipe) pokemonId: number,
	) {
		const pokemon = await this.getPokemonByIdService.execute(pokemonId);
		const team = this.addToTeamService.execute(session.user.id, pokemon);
		return { message: `Added ${pokemon.name} to your team!`, team };
	}
}
