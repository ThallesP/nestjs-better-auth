import request from "supertest";
import { faker } from "@faker-js/faker";
import { Test } from "@nestjs/testing";
import { Module, Controller, Get } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { bearer } from "better-auth/plugins/bearer";
import { admin } from "better-auth/plugins/admin";
import { createAccessControl } from "better-auth/plugins/access";
import { betterAuth } from "better-auth";
import { AuthModule } from "../../src/index.ts";
import { UserHasPermission } from "../../src/decorators.ts";
import { type OPTIONS_TYPE } from "../../src/auth-module-definition.ts";
import { Request } from "@nestjs/common";


// Create custom access control with project and sale resources
const statement = {
    project: ["create", "share", "update", "delete"],
    sale: ["create", "read", "update", "delete"],
    user: ["ban", "unban"],
} as const;

const ac = createAccessControl(statement);

// Create custom roles with different permission levels
const projectEditor = ac.newRole({
    project: ["create", "update"],
});

const projectAdmin = ac.newRole({
    project: ["create", "update", "delete"],
});

const projectViewer = ac.newRole({
    project: ["share"], // Note: "read" is not in the statement, so this role has no project permissions
});

const multiResourceUser = ac.newRole({
    project: ["create", "update"],
    sale: ["create"],
});

const fullAccess = ac.newRole({
    project: ["create", "share", "update", "delete"],
    sale: ["create", "read", "update", "delete"],
    user: ["ban", "unban"],
});

// Create test auth with custom access control
function createTestAuthWithAccessControl() {
    return betterAuth({
        basePath: "/api/auth",
        emailAndPassword: {
            enabled: true,
        },
        plugins: [
            bearer(),
            admin({
                ac,
                roles: {
                    projectEditor,
                    projectAdmin,
                    projectViewer,
                    multiResourceUser,
                    fullAccess,
                },
            }),
        ],
    });
}

// Test controller with various permission checks
@Controller("permission-test")
class PermissionTestController {
    @UserHasPermission({ permission: { project: ["create", "update"] } })
    @Get("project-create-update")
    projectCreateUpdate(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }

    @UserHasPermission({ permission: { project: ["create"] } })
    @Get("project-create-only")
    projectCreateOnly(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }

    @UserHasPermission({ permission: { project: ["delete"] } })
    @Get("project-delete")
    projectDelete(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }

    @UserHasPermission({
        permissions: { project: ["create"], sale: ["create"] },
    })
    @Get("multi-resource")
    multiResource(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }

    @UserHasPermission({ role: "projectAdmin", permission: { project: ["delete"] } })
    @Get("role-permission-check")
    rolePermissionCheck(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }

    @UserHasPermission({ permission: { project: ["share"] } })
    @Get("project-share")
    projectShare(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }

    @UserHasPermission({ permission: { user: ["ban"] } })
    @Get("user-ban")
    userBan(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }

    @UserHasPermission({ permission: { project: ["read"] } })
    @Get("project-read")
    projectRead(@Request() req: { user?: unknown }) {
        return { user: req.user, message: "success" };
    }
}

// Create test app module
function createPermissionTestAppModule(
    async: boolean,
    auth: ReturnType<typeof createTestAuthWithAccessControl>,
    options?: Omit<typeof OPTIONS_TYPE, "auth">,
) {
    const authModule = async
        ? AuthModule.forRootAsync({
            useFactory: async () => ({ auth, ...options }),
        })
        : AuthModule.forRoot({ auth, ...options });

    @Module({
        imports: [authModule],
        controllers: [PermissionTestController],
    })
    class AppModule { }

    return AppModule;
}

// Factory function to create test app
async function createPermissionTestApp(
    options?: Omit<typeof OPTIONS_TYPE, "auth">,
    async = false,
) {
    const auth = createTestAuthWithAccessControl();
    const AppModule = createPermissionTestAppModule(async, auth, options);

    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication(new ExpressAdapter(), {
        bodyParser: false,
    });

    await app.init();

    return { app, auth };
}

describe("UserHasPermission e2e", () => {
    let testSetup: Awaited<ReturnType<typeof createPermissionTestApp>>;

    beforeAll(async () => {
        testSetup = await createPermissionTestApp();
    });

    afterAll(async () => {
        await testSetup.app.close();
    });

    describe("Basic permission checks", () => {
        it("should forbid access without authentication", async () => {
            await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-create-update")
                .expect(401);
        });

        it("should forbid access when user has no permissions (normal user)", async () => {
            // Create a user with no role (default user role)
            const signUp = await testSetup.auth.api.signUpEmail({
                body: {
                    name: faker.person.fullName(),
                    email: faker.internet.email(),
                    password: faker.internet.password({ length: 10 }),
                },
            });

            await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-create-update")
                .set("Authorization", `Bearer ${signUp.token}`)
                .expect(403)
                .expect((res) => {
                    expect(res.body?.message).toContain("Insufficient permissions");
                });
        });

        it("should allow access when user has required permissions", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Editor",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectEditor",
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-create-update")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);
            expect(response.body).toMatchObject({
                message: "success",
                user: expect.objectContaining({
                    id: user.user.id,
                }),
            });
        });

        it("should allow access when user has partial required permissions (create only)", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Editor",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectEditor",
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            // projectEditor has ["create", "update"], so should have access to create-only route
            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-create-only")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toMatchObject({
                message: "success",
            });
        });
    });

    describe("Permission edge cases", () => {
        it("should forbid access when user lacks required permission", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Editor",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectEditor", // Has create, update but NOT delete
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-delete")
                .set("Authorization", `Bearer ${token}`)
                .expect(403);
        });

        it("should allow access when user has delete permission", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Admin",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectAdmin", // Has create, update, delete
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-delete")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toMatchObject({
                message: "success",
            });
        });

        it("should forbid access when permission is not in role definition", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Viewer",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectViewer", // Has "read" which is not in statement
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            // Should fail because "read" is not a valid permission in the statement
            await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-read")
                .set("Authorization", `Bearer ${token}`)
                .expect(403);
        });
    });

    describe("Multiple permissions (permissions)", () => {
        it("should allow access when user has all required permissions across resources", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Multi Resource User",
                    email: faker.internet.email(),
                    password: password,
                    role: "multiResourceUser", // Has project: ["create", "update"], sale: ["create"]
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/multi-resource")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toMatchObject({
                message: "success",
            });
        });

        it("should forbid access when user lacks one of the required permissions", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Editor",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectEditor", // Has project: ["create", "update"] but NOT sale: ["create"]
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            await request(testSetup.app.getHttpServer())
                .get("/permission-test/multi-resource")
                .set("Authorization", `Bearer ${token}`)
                .expect(403);
        });
    });

    describe("Role-based permission checks", () => {
        it("should allow access when role has required permission", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Admin",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectAdmin", // Has delete permission
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/role-permission-check")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toMatchObject({
                message: "success",
            });
        });

        it("should forbid access when role lacks required permission", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Editor",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectEditor", // Does NOT have delete permission
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            await request(testSetup.app.getHttpServer())
                .get("/permission-test/role-permission-check")
                .set("Authorization", `Bearer ${token}`)
                .expect(403);
        });
    });

    describe("Different resource types", () => {
        it("should allow access to share permission when user has it", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Full Access User",
                    email: faker.internet.email(),
                    password: password,
                    role: "fullAccess", // Has all permissions including share
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-share")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toMatchObject({
                message: "success",
            });
        });

        it("should forbid access to share permission when user lacks it", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Admin",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectAdmin", // Has create, update, delete but NOT share
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-share")
                .set("Authorization", `Bearer ${token}`)
                .expect(403);
        });

        it("should allow access to user ban permission when user has it", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Full Access User",
                    email: faker.internet.email(),
                    password: password,
                    role: "fullAccess", // Has user: ["ban", "unban"]
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/user-ban")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toMatchObject({
                message: "success",
            });
        });

        it("should forbid access to user ban permission when user lacks it", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Admin",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectAdmin", // Does NOT have user permissions
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            await request(testSetup.app.getHttpServer())
                .get("/permission-test/user-ban")
                .set("Authorization", `Bearer ${token}`)
                .expect(403);
        });
    });

    describe("Edge cases", () => {
        it("should handle multiple actions in single permission check", async () => {
            const password = faker.internet.password({ length: 10 });
            const user = await testSetup.auth.api.createUser({
                body: {
                    name: "Project Editor",
                    email: faker.internet.email(),
                    password: password,
                    role: "projectEditor", // Has create and update
                },
            });

            const { token } = await testSetup.auth.api.signInEmail({
                body: {
                    email: user.user.email,
                    password: password,
                },
            });

            // Route requires both create AND update
            const response = await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-create-update")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toMatchObject({
                message: "success",
            });
        });

        it("should handle user with no role gracefully", async () => {
            const signUp = await testSetup.auth.api.signUpEmail({
                body: {
                    name: faker.person.fullName(),
                    email: faker.internet.email(),
                    password: faker.internet.password({ length: 10 }),
                },
            });

            await request(testSetup.app.getHttpServer())
                .get("/permission-test/project-create-only")
                .set("Authorization", `Bearer ${signUp.token}`)
                .expect(403);
        });

    });
});

