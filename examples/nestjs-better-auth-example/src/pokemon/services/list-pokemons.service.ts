import { Injectable } from "@nestjs/common";
import { POKEAPI_BASE, type PokemonListItem } from "../pokemon.types";

@Injectable()
export class ListPokemonsService {
	async execute(limit = 20, offset = 0): Promise<PokemonListItem[]> {
		const res = await fetch(
			`${POKEAPI_BASE}/pokemon?limit=${limit}&offset=${offset}`,
		);
		const data = await res.json();
		return data.results;
	}
}
