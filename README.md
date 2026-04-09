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
> Requires `better-auth` >= 1.5.0. Older versions are deprecated and unsupported.

Before you start, make sure you have:

- A working NestJS application
- Better Auth (>= 1.5.0) installed and configured ([installation guide](https://www.better-auth.com/docs/installation))

## Basic Setup

**1. Disable Body Parser**

Disable NestJS's built-in body parser to allow Better Auth to handle the raw request body:

```ts title="main.ts"
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // The library will re-add the default body parsers for non-auth routes.
    bodyParser: false,
  });
  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
```

> [!IMPORTANT]
> **Side Effect:** Since we disable NestJS's built-in body parser, the `rawBody: true` option in `NestFactory.create()` has no effect.
> If you need access to `req.rawBody` (e.g., for webhook signature verification), use `bodyParser.rawBody` in `AuthModule.forRoot()` instead.
> See [Module Options](#module-options) for details.

**2. Import AuthModule**

Import the `AuthModule` in your root module:

```ts title="app.module.ts"
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth";

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      bodyParser: {
        json: { limit: "2mb" },
        urlencoded: { limit: "2mb", extended: true },
        rawBody: true,
      },
    }),
  ],
})
export class AppModule {}
```

Both `bodyParser.json` and `bodyParser.urlencoded` accept parser options plus an `enabled` flag if you want to disable either parser individually. Set `bodyParser.rawBody` to `true` if you also want Nest-style `req.rawBody` support.

On Fastify, `bodyParser.urlencoded` with `extended: true` uses the optional peer dependency `qs`. Install `qs` in your application if you want nested URL-encoded parsing there.

If you configure `trustedOrigins`, this module also applies Better Auth CORS headers for auth routes. On Fastify, Better Auth routes are mounted through middleware, so app-level `@fastify/cors` does not fully cover them by itself.

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

### AllowAnonymous and OptionalAuth Decorators

Control authentication requirements for specific routes:

```ts title="app.controller.ts"
import { Controller, Get } from "@nestjs/common";
import { AllowAnonymous, OptionalAuth } from "@thallesp/nestjs-better-auth";

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
}
```

Alternatively, use as a class decorator for an entire controller:

```ts title="app.controller.ts"
@AllowAnonymous() // All routes inside this controller are public
@Controller("public")
export class PublicController {
  /* */
}

@OptionalAuth() // Authentication is optional for all routes
@Controller("optional")
export class OptionalController {
  /* */
}
```

### Role-Based Access Control

This library provides two role decorators for different use cases:

| Decorator | Checks | Use Case |
|-----------|--------|----------|
| `@Roles()` | `user.role` only | System-level roles ([admin plugin](https://www.better-auth.com/docs/plugins/admin)) |
| `@OrgRoles()` | Organization member role only | Organization-level roles ([organization plugin](https://www.better-auth.com/docs/plugins/organization)) |

> [!IMPORTANT]
> These decorators are intentionally **separate** to prevent privilege escalation. The `@Roles()` decorator only checks `user.role` and does **not** check organization member roles. This ensures an organization admin cannot bypass system-level admin protection.

#### @Roles() - System-Level Roles

Use `@Roles()` for system-wide admin protection. This checks only the `user.role` field from Better Auth's [admin plugin](https://www.better-auth.com/docs/plugins/admin).

```ts title="admin.controller.ts"
import { Controller, Get } from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

@Controller("admin")
export class AdminController {
  @Roles(["admin"])
  @Get("dashboard")
  async adminDashboard() {
    // Only users with user.role = 'admin' can access
    // Organization admins CANNOT access this route
    return { message: "System admin dashboard" };
  }
}

// Or as a class decorator
@Roles(["admin"])
@Controller("admin")
export class AdminController {
  /* All routes require user.role = 'admin' */
}
```

#### @OrgRoles() - Organization-Level Roles

Use `@OrgRoles()` for organization-scoped protection. This checks only the organization member role and requires an active organization (`activeOrganizationId` in session).

```ts title="org.controller.ts"
import { Controller, Get } from "@nestjs/common";
import { OrgRoles, Session, UserSession } from "@thallesp/nestjs-better-auth";

@Controller("org")
export class OrgController {
  @OrgRoles(["owner", "admin"])
  @Get("settings")
  async getOrgSettings(@Session() session: UserSession) {
    // Only org owners/admins can access (requires activeOrganizationId)
    // System admins (user.role = 'admin') CANNOT access without org context
    return { orgId: session.session.activeOrganizationId };
  }

  @OrgRoles(["owner"])
  @Get("billing")
  async getOrgBilling() {
    // Only org owners can access
    return { message: "Billing settings" };
  }
}
```

> [!NOTE]
> Both role decorators accept any role strings you define. Better Auth's organization plugin provides default roles (`owner`, `admin`, `member`), but you can configure custom roles. The organization creator automatically gets the `owner` role.

### Permission-Based Access Control

This library provides two permission decorators for fine-grained access control:

| Decorator | Checks | Use Case |
|-----------|--------|----------|
| `@UserHasPermission()` | User-level permissions | System-level permissions ([admin plugin access control](https://www.better-auth.com/docs/plugins/admin/access-control)) |
| `@MemberHasPermission()` | Organization member permissions | Organization-level permissions ([organization plugin access control](https://www.better-auth.com/docs/plugins/organization#access-control)) |

#### @UserHasPermission() - System-Level Permissions

Use `@UserHasPermission()` for system-wide permission-based access control. This checks user permissions using Better Auth's [admin plugin access control](https://www.better-auth.com/docs/plugins/admin/access-control).

**Prerequisites:**
- Configure access control in your Better Auth admin plugin

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  project: ["create", "share", "update", "delete"],
  sale: ["create", "read", "update", "delete"],
} as const;

const ac = createAccessControl(statement);

const editor = ac.newRole({
  project: ["create", "update"],
});

const admin = ac.newRole({
  project: ["create", "update", "delete"],
  sale: ["create", "read", "update", "delete"],
});

export const auth = betterAuth({
  plugins: [
    admin({
      ac,
      roles: {
        editor,
        admin,
      },
    }),
  ],
});
```

**Usage:**

```ts title="project.controller.ts"
import { Controller, Get, Post } from "@nestjs/common";
import { UserHasPermission } from "@thallesp/nestjs-better-auth";

@Controller("projects")
export class ProjectController {
  @UserHasPermission({ permission: { project: ["create", "update"] } })
  @Post()
  async createProject() {
    // Only users with project: ["create", "update"] permissions can access
    return { message: "Project created" };
  }

  @UserHasPermission({ permission: { project: ["delete"] } })
  @Post(":id/delete")
  async deleteProject() {
    // Only users with project: ["delete"] permission can access
    return { message: "Project deleted" };
  }

  @UserHasPermission({
    permissions: { project: ["create"], sale: ["create"] },
  })
}
```

**Options:**

- `permission`: A single permission check (e.g., `{ project: ["create", "update"] }`)
- `permissions`: Multiple permission checks across resources (e.g., `{ project: ["create"], sale: ["create"] }`)
- `role` (server-only): Check permissions for a specific role
- `userId` (optional): Check permissions for a specific user (defaults to current user)

#### @MemberHasPermission() - Organization-Level Permissions

Use `@MemberHasPermission()` for organization-scoped permission-based access control. This checks organization member permissions using Better Auth's [organization plugin access control](https://www.better-auth.com/docs/plugins/organization#access-control). Requires an active organization (`activeOrganizationId` in session).

**Prerequisites:**
- Configure access control in your Better Auth organization plugin
- Define custom organization roles with permissions

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  project: ["create", "share", "update", "delete"],
  sale: ["create", "read", "update", "delete"],
  organization: ["update", "delete"],
} as const;

const ac = createAccessControl(statement);

const editor = ac.newRole({
  project: ["create", "update"],
});

const admin = ac.newRole({
  project: ["create", "update", "delete"],
  organization: ["update"],
});

export const auth = betterAuth({
  plugins: [
    organization({
      ac,
      roles: {
        editor,
        admin,
      },
    }),
  ],
});
```

**Usage:**

```ts title="org-project.controller.ts"
import { Controller, Get, Post } from "@nestjs/common";
import { MemberHasPermission, Session, UserSession } from "@thallesp/nestjs-better-auth";

@Controller("org/projects")
export class OrgProjectController {
  @MemberHasPermission({ permissions: { project: ["create", "update"] } })
  @Post()
  async createProject(@Session() session: UserSession) {
    // Only org members with project: ["create", "update"] permissions can access
    // Requires activeOrganizationId in session
    return {
      message: "Project created",
      orgId: session.session.activeOrganizationId,
    };
  }

  @MemberHasPermission({ permissions: { project: ["delete"] } })
  @Post(":id/delete")
  async deleteProject() {
    // Only org members with project: ["delete"] permission can access
    return { message: "Project deleted" };
  }
}
```

**Options:**

- `permissions`: The permissions to check (required). Must match the structure in your organization access control.


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

### Database Hook Decorators

> [!IMPORTANT]
> To use `@DatabaseHook`, `@BeforeCreate`, `@AfterCreate`, `@BeforeUpdate`, `@AfterUpdate`, `@BeforeDelete`, `@AfterDelete`, set `databaseHooks: {}` (empty object) in your `betterAuth(...)` config.

Database hooks let you hook into the lifecycle of core database operations (create, update, delete) for Better Auth models (`user`, `session`, `account`, `verification`).

Minimal Better Auth setup with database hooks enabled:

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // other better-auth options...
  databaseHooks: {}, // empty object is the minimum required
});
```

Create database hooks that integrate with NestJS's dependency injection:

```ts title="hooks/user-create.hook.ts"
import { Injectable } from "@nestjs/common";
import {
  DatabaseHook,
  BeforeCreate,
  AfterCreate,
} from "@thallesp/nestjs-better-auth";
import { EmailService } from "./email.service";

@DatabaseHook()
@Injectable()
export class UserCreateHook {
  constructor(private readonly emailService: EmailService) {}

  @BeforeCreate("user")
  async beforeUserCreate(user) {
    return {
      data: {
        ...user,
        firstName: user.name.split(" ")[0],
        lastName: user.name.split(" ")[1],
      },
    };
  }

  @AfterCreate("user")
  async afterUserCreate(user) {
    await this.emailService.sendWelcomeEmail(user.email);
  }
}
```

Register your database hooks in a module:

```ts title="app.module.ts"
import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { UserCreateHook } from "./hooks/user-create.hook";
import { EmailService } from "./email.service";
import { auth } from "./auth";

@Module({
  imports: [AuthModule.forRoot({ auth })],
  providers: [UserCreateHook, EmailService],
})
export class AppModule {}
```

Available method decorators:

| Decorator | Description |
|-----------|-------------|
| `@BeforeCreate(model)` | Runs before a record is created |
| `@AfterCreate(model)` | Runs after a record is created |
| `@BeforeUpdate(model)` | Runs before a record is updated |
| `@AfterUpdate(model)` | Runs after a record is updated |
| `@BeforeDelete(model)` | Runs before a record is deleted |
| `@AfterDelete(model)` | Runs after a record is deleted |

Where `model` is one of: `"user"`, `"session"`, `"account"`, `"verification"`.

`before` hooks can return `false` to abort the operation, or `{ data: ... }` to modify the data before it's written. `after` hooks are for side effects only.

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
  bodyParser: {
    json: { enabled: true },
    urlencoded: { enabled: true, extended: true },
    rawBody: false,
  },
  disableBodyParser: false,
  enableRawBodyParser: false,
  disableGlobalAuthGuard: false,
  disableControllers: false,
});
```

The available options are:

| Option                      | Default | Description                                                                                                                                                              |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `disableTrustedOriginsCors` | `false` | When set to `true`, disables the automatic CORS configuration for the origins specified in `trustedOrigins`. On Fastify, use this only if you want to fully manage Better Auth route CORS yourself. |
| `bodyParser`                | Re-adds JSON and URL-encoded body parsers | Configure the body parsers re-added by the module after Nest body parsing is disabled. `json` and `urlencoded` accept the parser options object plus `enabled?: boolean`, and `rawBody?: boolean` enables `req.rawBody`. |
| `disableBodyParser`         | `false` | Deprecated. Use `bodyParser.json.enabled` and `bodyParser.urlencoded.enabled` instead. When set to `true`, disables both parsers unless you explicitly re-enable one in `bodyParser`. |
| `enableRawBodyParser`       | `false` | Deprecated. Use `bodyParser.rawBody` instead. When set to `true`, enables raw body parsing and attaches the raw buffer to `req.rawBody`. |
| `disableGlobalAuthGuard`    | `false` | When set to `true`, does not register `AuthGuard` as a global guard. Use this if you prefer to apply `AuthGuard` manually or register it yourself via `APP_GUARD`.       |
| `disableControllers`        | `false` | When set to `true`, does not register any controllers. Use this if you want to handle routes manually.                                                                   |
| `middleware`                | `undefined` | Optional middleware function that wraps the Better Auth handler. Receives `(req, res, next)` parameters. Useful for integrating with request-scoped libraries like MikroORM's RequestContext. |

### Body Parser Configuration

Use `bodyParser` to customize the parsers that this library re-adds after you disable Nest's built-in body parser:

```ts
AuthModule.forRoot({
  auth,
  bodyParser: {
    json: {
      limit: "2mb",
    },
    urlencoded: {
      enabled: true,
      extended: true,
      limit: "2mb",
    },
    rawBody: true,
  },
});
```

`bodyParser.rawBody` enables `req.rawBody` support, while `bodyParser.json` and `bodyParser.urlencoded` configure the corresponding parser behavior for the active adapter.

If you use Fastify with `bodyParser.urlencoded({ extended: true })`, install the optional peer dependency `qs` to enable nested form parsing.

### CORS on Fastify

If your Better Auth config sets `trustedOrigins`, this module applies CORS to Better Auth routes automatically.

On Fastify, Better Auth routes are served through middleware internally. Because of that:

- app-level `@fastify/cors` does not fully apply to Better Auth routes on its own
- this module applies Better Auth route CORS from `trustedOrigins`
- if `@fastify/cors` is already registered, this module skips duplicate Fastify CORS registration and logs a warning once

This Fastify fallback only supports array-based `trustedOrigins`. Function-based `trustedOrigins` remain unsupported unless you set `disableTrustedOriginsCors: true` and manage Better Auth route CORS manually.

Set `disableTrustedOriginsCors: true` only if you want to fully manage Better Auth route CORS yourself.

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
