import { Injectable } from "@nestjs/common";
import type { Pokemon } from "../pokemon.types";
import { TeamStateService } from "./team-state.service";

@Injectable()
export class RemoveFromTeamService {
	constructor(private readonly teamState: TeamStateService) {}

	execute(userId: string, pokemonId: number): Pokemon[] {
		const team = this.teamState.getTeam(userId);
		const index = team.findIndex((p) => p.id === pokemonId);
		if (index === -1) {
			throw new Error("Pokemon not in team");
		}
		team.splice(index, 1);
		this.teamState.setTeam(userId, team);
		return team;
	}
}
