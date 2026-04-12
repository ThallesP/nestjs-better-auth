import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth";
import { PokemonModule } from "./pokemon/pokemon.module";

@Module({
	imports: [
		AuthModule.forRoot({
			auth,
			disableTrustedOriginsCors: true, // Disable CORS in Better Auth since we're handling it globally in Fastify
		}),
		PokemonModule,
	],
})
export class AppModule {}
