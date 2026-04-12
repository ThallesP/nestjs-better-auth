export const POKEAPI_BASE = "https://pokeapi.co/api/v2";

export interface Pokemon {
	id: number;
	name: string;
	types: string[];
	sprite: string;
}

export interface PokemonListItem {
	name: string;
	url: string;
}
