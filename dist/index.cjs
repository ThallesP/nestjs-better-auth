'use strict';

const common = require('@nestjs/common');
const graphql = require('@nestjs/graphql');
const core = require('@nestjs/core');
const node = require('better-auth/node');
const plugins = require('better-auth/plugins');
const fastifyMultipart = require('@fastify/multipart');

function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const fastifyMultipart__default = /*#__PURE__*/_interopDefaultCompat(fastifyMultipart);

const BEFORE_HOOK_KEY = Symbol("BEFORE_HOOK");
const AFTER_HOOK_KEY = Symbol("AFTER_HOOK");
const HOOK_KEY = Symbol("HOOK");
const AUTH_MODULE_OPTIONS_KEY = Symbol("AUTH_MODULE_OPTIONS");

function getRequestFromContext(context) {
  const contextType = context.getType();
  if (contextType === "graphql") {
    return graphql.GqlExecutionContext.create(context).getContext().req;
  }
  return context.switchToHttp().getRequest();
}
function isFastifyAdapter(adapter) {
  return adapter && typeof adapter === "object" && (adapter.constructor?.name === "FastifyAdapter" || adapter.instance?.constructor?.name === "FastifyInstance");
}
function getPlatform(adapter) {
  return isFastifyAdapter(adapter) ? "fastify" : "express";
}

const AllowAnonymous = () => common.SetMetadata("PUBLIC", true);
const OptionalAuth = () => common.SetMetadata("OPTIONAL", true);
const Roles = (roles) => common.SetMetadata("ROLES", roles);
const Public = AllowAnonymous;
const Optional = OptionalAuth;
const Session = common.createParamDecorator((_data, context) => {
  const request = getRequestFromContext(context);
  return request.session;
});
const BeforeHook = (path) => common.SetMetadata(BEFORE_HOOK_KEY, path);
const AfterHook = (path) => common.SetMetadata(AFTER_HOOK_KEY, path);
const Hook = () => common.SetMetadata(HOOK_KEY, true);

const MODULE_OPTIONS_TOKEN = Symbol("AUTH_MODULE_OPTIONS");
const { ConfigurableModuleClass, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } = new common.ConfigurableModuleBuilder({
  optionsInjectionToken: MODULE_OPTIONS_TOKEN
}).setClassMethodName("forRoot").setExtras(
  {
    isGlobal: true,
    disableTrustedOriginsCors: false,
    disableBodyParser: false,
    disableGlobalAuthGuard: false
  },
  (def, extras) => {
    return {
      ...def,
      exports: [MODULE_OPTIONS_TOKEN],
      global: extras.isGlobal
    };
  }
).build();

var __getOwnPropDesc$3 = Object.getOwnPropertyDescriptor;
var __decorateClass$3 = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc$3(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (decorator(result)) || result;
  return result;
};
var __decorateParam$2 = (index, decorator) => (target, key) => decorator(target, key, index);
exports.AuthService = class AuthService {
  constructor(options) {
    this.options = options;
  }
  /**
   * Returns the API endpoints provided by the auth instance
   */
  get api() {
    return this.options.auth.api;
  }
  /**
   * Returns the complete auth instance
   * Access this for plugin-specific functionality
   */
  get instance() {
    return this.options.auth;
  }
};
exports.AuthService = __decorateClass$3([
  __decorateParam$2(0, common.Inject(MODULE_OPTIONS_TOKEN))
], exports.AuthService);

var __getOwnPropDesc$2 = Object.getOwnPropertyDescriptor;
var __decorateClass$2 = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc$2(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (decorator(result)) || result;
  return result;
};
var __decorateParam$1 = (index, decorator) => (target, key) => decorator(target, key, index);
exports.AuthGuard = class AuthGuard {
  constructor(reflector, options) {
    this.reflector = reflector;
    this.options = options;
  }
  async canActivate(context) {
    const request = getRequestFromContext(context);
    const headers = this.getHeadersFromRequest(request);
    const session = await this.options.auth.api.getSession({
      headers: node.fromNodeHeaders(headers)
    });
    request.session = session;
    request.user = session?.user ?? null;
    const isPublic = this.reflector.getAllAndOverride("PUBLIC", [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;
    const isOptional = this.reflector.getAllAndOverride("OPTIONAL", [
      context.getHandler(),
      context.getClass()
    ]);
    if (isOptional && !session) return true;
    if (!session)
      throw new common.UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Unauthorized"
      });
    const requiredRoles = this.reflector.getAllAndOverride("ROLES", [
      context.getHandler(),
      context.getClass()
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const userRole = session.user.role;
      let hasRole = false;
      if (Array.isArray(userRole)) {
        hasRole = userRole.some((role) => requiredRoles.includes(role));
      } else if (typeof userRole === "string") {
        hasRole = requiredRoles.includes(userRole);
      }
      if (!hasRole) {
        throw new common.ForbiddenException({
          code: "FORBIDDEN",
          message: "Insufficient permissions"
        });
      }
    }
    return true;
  }
  getHeadersFromRequest(req) {
    if ("raw" in req && req.raw) {
      return req.raw.headers || {};
    }
    return req.headers || {};
  }
};
exports.AuthGuard = __decorateClass$2([
  common.Injectable(),
  __decorateParam$1(0, common.Inject(core.Reflector)),
  __decorateParam$1(1, common.Inject(MODULE_OPTIONS_TOKEN))
], exports.AuthGuard);

var __getOwnPropDesc$1 = Object.getOwnPropertyDescriptor;
var __decorateClass$1 = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc$1(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (decorator(result)) || result;
  return result;
};
let SkipBodyParsingMiddleware = class {
  use(req, res, next) {
    const baseUrl = this.getBaseUrl(req);
    if (baseUrl.startsWith("/api/auth")) {
      if (req.raw) {
        next();
        return;
      }
      next();
      return;
    }
    if (!req.raw) {
      const express = require("express");
      express.json()(req, res, (err) => {
        if (err) return next(err);
        express.urlencoded({ extended: true })(req, res, next);
      });
    } else {
      next();
    }
  }
  getBaseUrl(req) {
    if (req.raw) return req.raw.url || req.raw.originalUrl || "";
    return req.baseUrl || req.originalUrl || req.url || "";
  }
};
SkipBodyParsingMiddleware = __decorateClass$1([
  common.Injectable()
], SkipBodyParsingMiddleware);

var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (decorator(result)) || result;
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
const HOOKS = [
  { metadataKey: BEFORE_HOOK_KEY, hookType: "before" },
  { metadataKey: AFTER_HOOK_KEY, hookType: "after" }
];
exports.AuthModule = class AuthModule extends ConfigurableModuleClass {
  constructor(discoveryService, metadataScanner, adapter, options) {
    super();
    this.discoveryService = discoveryService;
    this.metadataScanner = metadataScanner;
    this.adapter = adapter;
    this.options = options;
    this.platform = getPlatform(this.adapter.httpAdapter);
  }
  logger = new common.Logger(exports.AuthModule.name);
  platform;
  onModuleInit() {
    const providers = this.discoveryService.getProviders().filter(
      ({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype)
    );
    const hasHookProviders = providers.length > 0;
    const hooksConfigured = typeof this.options.auth?.options?.hooks === "object";
    if (hasHookProviders && !hooksConfigured)
      throw new Error(
        "Detected @Hook providers but Better Auth 'hooks' are not configured. Add 'hooks: {}' to your betterAuth(...) options."
      );
    if (!hooksConfigured) return;
    for (const provider of providers) {
      const providerPrototype = Object.getPrototypeOf(provider.instance);
      const methods = this.metadataScanner.getAllMethodNames(providerPrototype);
      for (const method of methods) {
        const providerMethod = providerPrototype[method];
        this.setupHooks(providerMethod, provider.instance);
      }
    }
  }
  configure(consumer) {
    const trustedOrigins = this.options.auth.options.trustedOrigins;
    const isNotFunctionBased = trustedOrigins && Array.isArray(trustedOrigins);
    if (!this.options.disableTrustedOriginsCors && isNotFunctionBased) {
      if (this.platform === "express") {
        this.adapter.httpAdapter.enableCors({
          origin: trustedOrigins,
          methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          credentials: true
        });
      } else {
        this.logger.warn(
          "Fastify CORS is configured in main.ts. Ensure trustedOrigins match your CORS configuration."
        );
      }
    } else if (trustedOrigins && !this.options.disableTrustedOriginsCors && !isNotFunctionBased) {
      throw new Error(
        "Function-based trustedOrigins not supported in NestJS. Use string array or disable CORS."
      );
    }
    if (!this.options.disableBodyParser && this.platform === "express") {
      consumer.apply(SkipBodyParsingMiddleware).forRoutes("*path");
    }
    if (this.platform === "fastify") {
      const fastifyInstance = this.adapter.httpAdapter.getInstance();
      const hasMultipart = !!fastifyInstance.hasContentTypeParser && fastifyInstance.hasContentTypeParser("multipart/form-data");
      if (!hasMultipart && typeof fastifyInstance.register === "function") {
        try {
          fastifyInstance.register(fastifyMultipart__default, {
            limits: { fileSize: 1e7 }
          });
        } catch (err) {
          this.logger.warn(
            "Failed to register @fastify/multipart automatically. Please install it manually if you use form-data."
          );
        }
      }
    }
    let basePath = this.options.auth.options.basePath ?? "/api/auth";
    if (!basePath.startsWith("/")) basePath = `/${basePath}`;
    if (basePath.endsWith("/")) basePath = basePath.slice(0, -1);
    const handler = node.toNodeHandler(this.options.auth);
    this.createPlatformAwareHandler(basePath, handler);
    this.logger.log(
      `AuthModule initialized BetterAuth on '${basePath}/*' with ${this.platform}`
    );
  }
  createPlatformAwareHandler(basePath, handler) {
    if (this.platform === "express") {
      this.adapter.httpAdapter.getInstance().use(
        `${basePath}/*path`,
        (req, res) => handler(req, res)
      );
    } else {
      const fastifyInstance = this.adapter.httpAdapter.getInstance();
      fastifyInstance.route({
        method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        url: `${basePath}/*`,
        onRequest: async (request, reply) => {
          reply.hijack();
          const req = request.raw;
          const res = reply.raw;
          if (request.headers && req.headers) {
            Object.assign(req.headers, request.headers);
          }
          await handler(req, res);
          throw new Error("__HIJACKED__");
        },
        onError: async (request, reply, error) => {
          if (error.message === "__HIJACKED__") {
            return;
          }
          throw error;
        },
        handler: async () => {
          throw new Error("Should not reach handler");
        }
      });
    }
  }
  setupHooks(providerMethod, providerClass) {
    if (!this.options.auth.options.hooks) return;
    for (const { metadataKey, hookType } of HOOKS) {
      const hasHook = Reflect.hasMetadata(metadataKey, providerMethod);
      if (!hasHook) continue;
      const hookPath = Reflect.getMetadata(metadataKey, providerMethod);
      const originalHook = this.options.auth.options.hooks[hookType];
      this.options.auth.options.hooks[hookType] = plugins.createAuthMiddleware(
        async (ctx) => {
          if (originalHook) {
            await originalHook(ctx);
          }
          if (hookPath && hookPath !== ctx.path) return;
          await providerMethod.apply(providerClass, [ctx]);
        }
      );
    }
  }
  static forRootAsync(options) {
    const forRootAsyncResult = super.forRootAsync(options);
    return {
      ...super.forRootAsync(options),
      providers: [
        ...forRootAsyncResult.providers ?? [],
        ...!options.disableGlobalAuthGuard ? [
          {
            provide: core.APP_GUARD,
            useClass: exports.AuthGuard
          }
        ] : []
      ]
    };
  }
  static forRoot(arg1, arg2) {
    const normalizedOptions = typeof arg1 === "object" && arg1 !== null && "auth" in arg1 ? arg1 : { ...arg2 ?? {}, auth: arg1 };
    const forRootResult = super.forRoot(normalizedOptions);
    return {
      ...forRootResult,
      providers: [
        ...forRootResult.providers ?? [],
        ...!normalizedOptions.disableGlobalAuthGuard ? [
          {
            provide: core.APP_GUARD,
            useClass: exports.AuthGuard
          }
        ] : []
      ]
    };
  }
};
exports.AuthModule = __decorateClass([
  common.Module({
    imports: [core.DiscoveryModule],
    providers: [exports.AuthService],
    exports: [exports.AuthService]
  }),
  __decorateParam(0, common.Inject(core.DiscoveryService)),
  __decorateParam(1, common.Inject(core.MetadataScanner)),
  __decorateParam(2, common.Inject(core.HttpAdapterHost)),
  __decorateParam(3, common.Inject(MODULE_OPTIONS_TOKEN))
], exports.AuthModule);

exports.AFTER_HOOK_KEY = AFTER_HOOK_KEY;
exports.AUTH_MODULE_OPTIONS_KEY = AUTH_MODULE_OPTIONS_KEY;
exports.AfterHook = AfterHook;
exports.AllowAnonymous = AllowAnonymous;
exports.BEFORE_HOOK_KEY = BEFORE_HOOK_KEY;
exports.BeforeHook = BeforeHook;
exports.HOOK_KEY = HOOK_KEY;
exports.Hook = Hook;
exports.Optional = Optional;
exports.OptionalAuth = OptionalAuth;
exports.Public = Public;
exports.Roles = Roles;
exports.Session = Session;
