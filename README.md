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

Before you start, make sure you have:

- A working NestJS application
- Better Auth installed and configured ([installation guide](https://www.better-auth.com/docs/installation))

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
> Currently, Better Auth's NestJS integration **only supports Express** and does not work with Fastify.

**2. Import AuthModule**

Import the `AuthModule` in your root module:

```ts title="app.module.ts"
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth";

@Module({
  imports: [AuthModule.forRoot(auth)],
})
export class AppModule {}
```

## Route Protection

Better Auth provides an `AuthGuard` to protect your routes. You can choose one of two approaches to implement route protection:

**Option 1: Controller or Route Level Protection**

Apply the guard to specific controllers or routes:

```ts title="app.controller.ts"
import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@thallesp/nestjs-better-auth";

@Controller("users")
@UseGuards(AuthGuard) // Apply to all routes in this controller
export class UserController {
  @Get("me")
  async getProfile() {
    return { message: "Protected route" };
  }
}
```

**Option 2: Global Protection**

Alternatively, you can register the guard globally using `APP_GUARD` to protect all routes by default:

```ts title="app.module.ts"
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule, AuthGuard } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth";

@Module({
  imports: [AuthModule.forRoot(auth)],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
```

> [!NOTE]  
> Choose either the controller/route level approach or the global approach based on your needs. You don't need to implement both.

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

### Public and Optional Decorators

Control authentication requirements for specific routes:

```ts title="app.controller.ts"
import { Controller, Get } from "@nestjs/common";
import { Public, Optional } from "@thallesp/nestjs-better-auth";

@Controller("users")
export class UserController {
  @Get("public")
  @Public() // Mark this route as public (no authentication required)
  async publicRoute() {
    return { message: "This route is public" };
  }

  @Get("optional")
  @Optional() // Authentication is optional for this route
  async optionalRoute(@Session() session: UserSession) {
    return { authenticated: !!session, session };
  }
}
```

Alternatively, use it as a class decorator to specify access for an entire controller:

```ts title="app.controller.ts"
import { Controller, Get } from "@nestjs/common";
import { Public, Optional } from "@thallesp/nestjs-better-auth";

@Public() // All routes inside this controller are public
@Controller("public")
export class PublicController {
  /* */
}

@Optional() // Authentication is optional for all routes inside this controller
@Controller("optional")
export class OptionalController {
  /* */
}
```

### Hook Decorators

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
  imports: [AuthModule.forRoot(auth)],
  providers: [SignUpHook, SignUpService],
})
export class AppModule {}
```

## AuthService

The `AuthService` is automatically provided by the `AuthModule` and can be injected into your controllers to access the Better Auth instance and its API endpoints.

```ts title="users.controller.ts"
import {
  Controller,
  Get,
  Post,
  Request,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, AuthService } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Request as ExpressRequest } from "express";
import { auth } from "../auth";

@Controller("users")
@UseGuards(AuthGuard)
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

## Exception Filter

Better Auth's NestJS integration includes a built-in exception filter for handling `APIError` instances. You can disable this filter and implement your own:

```typescript
AuthModule.forRoot(auth, { disableExceptionFilter: true });
```

Then you can create your own exception filter:

```typescript
@Catch(APIError)
export class CustomAPIErrorFilter implements ExceptionFilter {
  catch(exception: APIError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    // Your custom error handling logic
    response.status(exception.statusCode).json({
      statusCode: exception.statusCode,
      message: exception.body?.message,
      // Add custom fields as needed
      timestamp: new Date().toISOString(),
    });
  }
}
```

This allows you to customize error responses while still leveraging Better Auth's error system.

## Module Options

When configuring `AuthModule.forRoot()`, you can provide options to customize the behavior:

```typescript
AuthModule.forRoot(auth, {
  disableExceptionFilter: false,
  disableTrustedOriginsCors: false,
  disableBodyParser: false,
});
```

The available options are:

| Option                      | Default | Description                                                                                                                                                              |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `disableExceptionFilter`    | `false` | When set to `true`, disables the built-in exception filter for handling `APIError` instances. Use this if you want to implement your own custom exception filter.        |
| `disableTrustedOriginsCors` | `false` | When set to `true`, disables the automatic CORS configuration for the origins specified in `trustedOrigins`. Use this if you want to handle CORS configuration manually. |
| `disableBodyParser`         | `false` | When set to `true`, disables the automatic body parser middleware. Use this if you want to handle request body parsing manually.                                         |
