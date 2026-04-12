import { Controller, Get } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { GetTeamService } from "../services";

@Controller("pokemon")
export class GetMyTeamController {
	constructor(private readonly getTeamService: GetTeamService) {}

	@Get("team/my")
	handle(@Session() session: UserSession) {
		return {
			user: session.user.email,
			team: this.getTeamService.execute(session.user.id),
		};
	}
}
