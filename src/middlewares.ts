import { Injectable, NestMiddleware } from "@nestjs/common";

@Injectable()
export class SkipBodyParsingMiddleware implements NestMiddleware {
  use(req: any, res: any, next: any): void {
    const baseUrl = this.getBaseUrl(req);

    if (baseUrl.startsWith("/api/auth")) {
      if (req.raw) {
        next();
        return;
      }
      next();
      return;
    }

    // Only apply express parsing if NOT Fastify
    if (!req.raw) {
      const express = require("express");
      express.json()(req, res, (err: any) => {
        if (err) return next(err);
        express.urlencoded({ extended: true })(req, res, next);
      });
    } else {
      next();
    }
  }

  private getBaseUrl(req: any): string {
    if (req.raw) return req.raw.url || req.raw.originalUrl || "";
    return req.baseUrl || req.originalUrl || req.url || "";
  }
}
