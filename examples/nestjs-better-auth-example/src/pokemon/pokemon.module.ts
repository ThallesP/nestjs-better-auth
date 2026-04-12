import { Module } from "@nestjs/common";
import {
	AddToTeamController,
	GetFeaturedController,
	GetMyTeamController,
	GetPokemonController,
	ListPokemonsController,
	RemoveFromTeamController,
} from "./controllers";
import {
	AddToTeamService,
	GetPokemonByIdService,
	GetPokemonByNameService,
	GetTeamService,
	ListPokemonsService,
	RemoveFromTeamService,
	TeamStateService,
} from "./services";

@Module({
	controllers: [
		ListPokemonsController,
		GetFeaturedController,
		GetMyTeamController,
		AddToTeamController,
		RemoveFromTeamController,
		GetPokemonController,
	],
	providers: [
		TeamStateService,
		ListPokemonsService,
		GetPokemonByIdService,
		GetPokemonByNameService,
		GetTeamService,
		AddToTeamService,
		RemoveFromTeamService,
	],
})
export class PokemonModule {}
