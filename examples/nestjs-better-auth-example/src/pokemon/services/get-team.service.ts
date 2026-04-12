import { Injectable } from "@nestjs/common";
import type { Pokemon } from "../pokemon.types";
import { TeamStateService } from "./team-state.service";

@Injectable()
export class GetTeamService {
	constructor(private readonly teamState: TeamStateService) {}

	execute(userId: string): Pokemon[] {
		return this.teamState.getTeam(userId);
	}
}
