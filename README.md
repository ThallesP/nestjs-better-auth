# NestJS Better Auth Integration

A comprehensive NestJS integration library for [Better Auth](https://www.better-auth.com/), providing seamless authentication and authorization for your NestJS applications.

## Installation

Install the library in your NestJS project:

```bash
# Using npm
npm install @thallesp/nestjs-better-auth

# Using yarn
yarn add @thallesp/nestjs-better-auth

# Using pnpm
pnpm add @thallesp/nestjs-better-auth

# Using bun
bun add @thallesp/nestjs-better-auth
```

## Prerequisites

> [!IMPORTANT]  
> Requires `better-auth` >= 1.3.8. Older versions are deprecated and unsupported.

Before you start, make sure you have:

- A working NestJS application
- Better Auth (>= 1.3.8) installed and configured ([installation guide](https://www.better-auth.com/docs/installation))

## Basic Setup

**1. Disable Body Parser**

Disable NestJS's built-in body parser to allow Better Auth to handle the raw request body:

```ts title="main.ts"
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Don't worry, the library will automatically re-add the default body parsers.
    bodyParser: false,
  });
  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
```

> [!WARNING]  
> Currently the library has beta support for Fastify, if you experience any issues with it, please open an issue.

**2. Import AuthModule**

Import the `AuthModule` in your root module:

```ts title="app.module.ts"
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth";

@Module({
  imports: [AuthModule.forRoot({ auth })],
})
export class AppModule {}
```

## Route Protection

**Global by default**: An `AuthGuard` is registered globally by this module. All routes are protected unless you explicitly allow access with `@AllowAnonymous()` or mark them as optional with `@OptionalAuth()`.

GraphQL is supported and works the same way as REST: the global guard applies to resolvers too, and you can use `@AllowAnonymous()`/`@OptionalAuth()` on queries and mutations.

WebSocket is also supported and works in the same way as REST and GraphQL: you can use `@AllowAnonymous()`/`@OptionalAuth()` on any connections, but you must set the AuthGuard for all of them, either at the Gateway or Message level, like so:

```ts
import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import { UseGuards } from "@nestjs/common";
import { AuthGuard } from '@thallesp/nestjs-better-auth';

@WebSocketGateway({
	path: "/ws",
	namespace: "test",
	cors: {
		origin: "*",
	},
})
@UseGuards(AuthGuard)
export class TestGateway { /* ... */ }
```

Check the [test gateway](./tests/shared/test-gateway.ts) for a full example.

## Decorators

Better Auth provides several decorators to enhance your authentication setup:

### Session Decorator

Access the user session in your controllers:

```ts title="user.controller.ts"
import { Controller, Get } from "@nestjs/common";
import { Session, UserSession } from "@thallesp/nestjs-better-auth";

@Controller("users")
export class UserController {
  @Get("me")
  async getProfile(@Session() session: UserSession) {
    return session;
  }
}
```

### AllowAnonymous, OptionalAuth, and Roles Decorators

Control authentication/authorization requirements for specific routes:

```ts title="app.controller.ts"
import { Controller, Get } from "@nestjs/common";
import {
  AllowAnonymous,
  OptionalAuth,
  Roles,
} from "@thallesp/nestjs-better-auth";

@Controller("users")
export class UserController {
  @Get("public")
  @AllowAnonymous() // Allow anonymous access (no authentication required)
  async publicRoute() {
    return { message: "This route is public" };
  }

  @Get("optional")
  @OptionalAuth() // Authentication is optional for this route
  async optionalRoute(@Session() session: UserSession) {
    return { authenticated: !!session, session };
  }

  @Get("admin")
  @Roles(["admin"]) // Only authenticated users with the 'admin' role can access this route. Uses the access control plugin from better-auth.
  adminRoute() {
    return "Only admins can see this";
  }
}
```

Alternatively, use it as a class decorator to specify access for an entire controller:

```ts title="app.controller.ts"
import { Controller, Get } from "@nestjs/common";
import { AllowAnonymous, OptionalAuth } from "@thallesp/nestjs-better-auth";

@AllowAnonymous() // All routes inside this controller are public
@Controller("public")
export class PublicController {
  /* */
}

@OptionalAuth() // Authentication is optional for all routes inside this controller
@Controller("optional")
export class OptionalController {
  /* */
}

@Roles(["admin"]) // All routes inside this controller require 'admin' role. Uses the access control plugin from better-auth.
@Controller("admin")
export class AdminController {
  /* */
}
```

### Hook Decorators

> [!IMPORTANT]
> To use `@Hook`, `@BeforeHook`, `@AfterHook`, set `hooks: {}` (empty object) in your `betterAuth(...)` config. You can still add your own Better Auth hooks; `hooks: {}` (empty object) is just the minimum required.

Minimal Better Auth setup with hooks enabled:

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  basePath: "/api/auth",
  // other better-auth options...
  hooks: {}, // minimum required to use hooks. read above for more details.
});
```

Create custom hooks that integrate with NestJS's dependency injection:

```ts title="hooks/sign-up.hook.ts"
import { Injectable } from "@nestjs/common";
import {
  BeforeHook,
  Hook,
  AuthHookContext,
} from "@thallesp/nestjs-better-auth";
import { SignUpService } from "./sign-up.service";

@Hook()
@Injectable()
export class SignUpHook {
  constructor(private readonly signUpService: SignUpService) {}

  @BeforeHook("/sign-up/email")
  async handle(ctx: AuthHookContext) {
    // Custom logic like enforcing email domain registration
    // Can throw APIError if validation fails
    await this.signUpService.execute(ctx);
  }
}
```

Register your hooks in a module:

```ts title="app.module.ts"
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { SignUpHook } from "./hooks/sign-up.hook";
import { SignUpService } from "./sign-up.service";
import { auth } from "./auth";

@Module({
  imports: [AuthModule.forRoot({ auth })],
  providers: [SignUpHook, SignUpService],
})
export class AppModule {}
```

## AuthService

The `AuthService` is automatically provided by the `AuthModule` and can be injected into your controllers to access the Better Auth instance and its API endpoints.

```ts title="users.controller.ts"
import { Controller, Get, Post, Request, Body } from "@nestjs/common";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Request as ExpressRequest } from "express";
import { auth } from "../auth";

@Controller("users")
export class UsersController {
  constructor(private authService: AuthService<typeof auth>) {}

  @Get("accounts")
  async getAccounts(@Request() req: ExpressRequest) {
    // Pass the request headers to the auth API
    const accounts = await this.authService.api.listUserAccounts({
      headers: fromNodeHeaders(req.headers),
    });

    return { accounts };
  }

  @Post("api-keys")
  async createApiKey(@Request() req: ExpressRequest, @Body() body) {
    // Access plugin-specific functionality with request headers
    // createApiKey is a method added by a plugin, not part of the core API
    return this.authService.api.createApiKey({
      ...body,
      headers: fromNodeHeaders(req.headers),
    });
  }
}
```

When using plugins that extend the Auth type with additional functionality, use generics to access the extended features as shown above with `AuthService<typeof auth>`. This ensures type safety when using plugin-specific API methods like `createApiKey`.

## Request Object Access

You can access the session and user through the request object:

```ts
import { Controller, Get, Request } from "@nestjs/common";
import type { Request as ExpressRequest } from "express";

@Controller("users")
export class UserController {
  @Get("me")
  async getProfile(@Request() req: ExpressRequest) {
    return {
      session: req.session, // Session is attached to the request
      user: req.user, // User object is attached to the request
    };
  }
}
```

The request object provides:

- `req.session`: The full session object containing user data and authentication state
- `req.user`: A direct reference to the user object from the session (useful for observability tools like Sentry)

### Advanced: Disable the global AuthGuard

If you prefer to manage guards yourself, you can disable the global guard and then apply `@UseGuards(AuthGuard)` per controller/route or register it via `APP_GUARD`.

```ts title="app.module.ts"
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth";

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      disableGlobalAuthGuard: true,
    }),
  ],
})
export class AppModule {}
```

```ts title="app.controller.ts"
import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@thallesp/nestjs-better-auth";

@Controller("users")
@UseGuards(AuthGuard)
export class UserController {
  @Get("me")
  async getProfile() {
    return { message: "Protected route" };
  }
}
```

## Module Options

When configuring `AuthModule.forRoot()`, you can provide options to customize the behavior:

```typescript
AuthModule.forRoot({
  auth,
  disableTrustedOriginsCors: false,
  disableBodyParser: false,
  disableGlobalAuthGuard: false,
  disableControllers: false,
});
```

The available options are:

| Option                      | Default | Description                                                                                                                                                              |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `disableTrustedOriginsCors` | `false` | When set to `true`, disables the automatic CORS configuration for the origins specified in `trustedOrigins`. Use this if you want to handle CORS configuration manually. |
| `disableBodyParser`         | `false` | When set to `true`, disables the automatic body parser middleware. Use this if you want to handle request body parsing manually.                                         |
| `disableGlobalAuthGuard`    | `false` | When set to `true`, does not register `AuthGuard` as a global guard. Use this if you prefer to apply `AuthGuard` manually or register it yourself via `APP_GUARD`.       |
| `disableControllers`        | `false` | When set to `true`, does not register any controllers. Use this if you want to handle routes manually.                                                                   |
| `middleware`                | `undefined` | Optional middleware function that wraps the Better Auth handler. Receives `(req, res, next)` parameters. Useful for integrating with request-scoped libraries like MikroORM's RequestContext. |

### Using Custom Middleware

You can provide a custom middleware function that wraps the Better Auth handler. This is particularly useful when integrating with libraries like MikroORM that require request context:

```typescript
import { RequestContext } from '@mikro-orm/core';

AuthModule.forRoot({
  auth,
  middleware: (req, res, next) => {
    RequestContext.create(orm.em, next);
  },
});
```

The middleware receives standard Express middleware parameters `(req, res, next)` where `next` is a function that invokes the Better Auth handler.
