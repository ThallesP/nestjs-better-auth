import { Controller, Get } from "@nestjs/common";
import { OptionalAuth, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { GetPokemonByIdService } from "../services";

@Controller("pokemon")
export class GetFeaturedController {
	constructor(private readonly getPokemonByIdService: GetPokemonByIdService) {}

	@OptionalAuth()
	@Get("featured/random")
	async handle(@Session() session: UserSession | null) {
		const randomId = Math.floor(Math.random() * 151) + 1;
		const pokemon = await this.getPokemonByIdService.execute(randomId);

		if (session) {
			return {
				message: `Hey ${session.user.email}, check out ${pokemon.name}!`,
				pokemon,
			};
		}
		return {
			message: "Sign in to save Pokemon to your team!",
			pokemon,
		};
	}
}
