import { Controller, Get, Query } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { ListPokemonsService } from "../services";

@Controller("pokemon")
export class ListPokemonsController {
	constructor(private readonly listPokemonsService: ListPokemonsService) {}

	@AllowAnonymous()
	@Get()
	async handle(@Query("limit") limit?: string, @Query("offset") offset?: string) {
		return this.listPokemonsService.execute(
			limit ? Number.parseInt(limit) : 20,
			offset ? Number.parseInt(offset) : 0,
		);
	}
}
