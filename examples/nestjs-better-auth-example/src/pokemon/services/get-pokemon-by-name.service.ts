import { Injectable } from "@nestjs/common";
import { POKEAPI_BASE, type Pokemon } from "../pokemon.types";

@Injectable()
export class GetPokemonByNameService {
	async execute(name: string): Promise<Pokemon> {
		const res = await fetch(`${POKEAPI_BASE}/pokemon/${name.toLowerCase()}`);
		const data = await res.json();
		return {
			id: data.id,
			name: data.name,
			types: data.types.map((t: { type: { name: string } }) => t.type.name),
			sprite: data.sprites.front_default,
		};
	}
}
