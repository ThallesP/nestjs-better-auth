import { Injectable } from "@nestjs/common";
import type { Pokemon } from "../pokemon.types";

@Injectable()
export class TeamStateService {
	private userTeams = new Map<string, Pokemon[]>();

	getTeam(userId: string): Pokemon[] {
		return this.userTeams.get(userId) ?? [];
	}

	setTeam(userId: string, team: Pokemon[]): void {
		this.userTeams.set(userId, team);
	}
}
