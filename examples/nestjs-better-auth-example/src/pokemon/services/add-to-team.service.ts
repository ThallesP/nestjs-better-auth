import { Injectable } from "@nestjs/common";
import type { Pokemon } from "../pokemon.types";
import { TeamStateService } from "./team-state.service";

@Injectable()
export class AddToTeamService {
	constructor(private readonly teamState: TeamStateService) {}

	execute(userId: string, pokemon: Pokemon): Pokemon[] {
		const team = this.teamState.getTeam(userId);
		if (team.length >= 6) {
			throw new Error("Team is full (max 6)");
		}
		if (team.some((p) => p.id === pokemon.id)) {
			throw new Error("Pokemon already in team");
		}
		team.push(pokemon);
		this.teamState.setTeam(userId, team);
		return team;
	}
}
