import { Controller, Get, Param } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { GetPokemonByIdService, GetPokemonByNameService } from "../services";

@Controller("pokemon")
export class GetPokemonController {
	constructor(
		private readonly getPokemonByIdService: GetPokemonByIdService,
		private readonly getPokemonByNameService: GetPokemonByNameService,
	) {}

	@AllowAnonymous()
	@Get(":id")
	async handle(@Param("id") id: string) {
		const numId = Number.parseInt(id);
		if (Number.isNaN(numId)) {
			return this.getPokemonByNameService.execute(id);
		}
		return this.getPokemonByIdService.execute(numId);
	}
}
