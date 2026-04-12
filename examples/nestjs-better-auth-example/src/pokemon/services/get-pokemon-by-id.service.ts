import { Injectable } from "@nestjs/common";
import { POKEAPI_BASE, type Pokemon } from "../pokemon.types";

@Injectable()
export class GetPokemonByIdService {
	async execute(id: number): Promise<Pokemon> {
		const res = await fetch(`${POKEAPI_BASE}/pokemon/${id}`);
		const data = await res.json();
		return {
			id: data.id,
			name: data.name,
			types: data.types.map((t: { type: { name: string } }) => t.type.name),
			sprite: data.sprites.front_default,
		};
	}
}
