# NestJS Better Auth Example

A simple Pokemon team builder app demonstrating [nestjs-better-auth](https://github.com/ThallesP/nestjs-better-auth) with Fastify.

## Features Demonstrated

- **AuthModule** setup with Better Auth
- **@AllowAnonymous()** - public routes (list Pokemon, view Pokemon)
- **@OptionalAuth()** - personalized response when logged in
- **@Session()** - access user session in protected routes
- **Fastify** adapter with body parser disabled
- **In-memory database** - no setup required, data resets on restart

## Setup

```bash
pnpm install
pnpm start:dev
```

## API Endpoints

### Public (no auth required)
- `GET /pokemon` - List Pokemon (uses PokeAPI)
- `GET /pokemon/:id` - Get Pokemon by ID or name

### Optional Auth
- `GET /pokemon/featured/random` - Get a random Pokemon (personalized if logged in)

### Protected (requires auth)
- `GET /pokemon/team/my` - Get your team
- `POST /pokemon/team/:pokemonId` - Add Pokemon to team
- `DELETE /pokemon/team/:pokemonId` - Remove Pokemon from team

### Auth (handled by Better Auth)
- `POST /api/auth/sign-up/email` - Sign up
- `POST /api/auth/sign-in/email` - Sign in
- `GET /api/auth/get-session` - Get current session

## Testing Auth

```bash
# Sign up
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123", "name": "Test User"}'

# Sign in and save cookie
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}' \
  -c cookies.txt

# Access protected route
curl http://localhost:3000/pokemon/team/my -b cookies.txt

# Add Pokemon to team
curl -X POST http://localhost:3000/pokemon/team/25 -b cookies.txt
```
