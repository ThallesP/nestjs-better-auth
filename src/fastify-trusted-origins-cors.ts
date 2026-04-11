import type { IncomingMessage, ServerResponse } from "node:http";
import { getNodeRequest, getNodeResponse } from "./middlewares.ts";

type RequestLike = IncomingMessage & {
	raw?: IncomingMessage;
	headers: IncomingMessage["headers"];
	method?: string;
};

type ResponseLike = ServerResponse<IncomingMessage> & {
	raw?: ServerResponse<IncomingMessage>;
};

type NodeResponseLike = ServerResponse<IncomingMessage> & {
	getHeader(name: string): number | string | string[] | undefined;
	setHeader(name: string, value: number | string | readonly string[]): this;
	statusCode: number;
};

function getHeaderValue(header: string | string[] | undefined) {
	if (Array.isArray(header)) {
		return header.join(", ");
	}

	return header;
}

function appendVaryHeader(res: NodeResponseLike, value: string) {
	const currentHeader = res.getHeader("Vary");
	const currentValue =
		typeof currentHeader === "number"
			? String(currentHeader)
			: Array.isArray(currentHeader)
				? currentHeader.join(", ")
				: currentHeader;

	const varyValues = new Set(
		currentValue
			?.split(",")
			.map((item) => item.trim())
			.filter(Boolean) ?? [],
	);
	varyValues.add(value);

	res.setHeader("Vary", Array.from(varyValues).join(", "));
}

function escapeRegex(pattern: string) {
	return pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function matchesOriginPattern(origin: string, pattern: string) {
	if (pattern === "*") return true;

	const regex = new RegExp(
		`^${pattern.split("*").map(escapeRegex).join(".*")}$`,
	);
	return regex.test(origin);
}

function isAllowedOrigin(origin: string, trustedOrigins: string[]) {
	return trustedOrigins.some((trustedOrigin) =>
		matchesOriginPattern(origin, trustedOrigin),
	);
}

export interface FastifyTrustedOriginsCorsOptions {
	trustedOrigins: string[];
}

export function handleFastifyTrustedOriginsCors(
	req: RequestLike,
	res: ResponseLike,
	options: FastifyTrustedOriginsCorsOptions,
) {
	const nodeReq = getNodeRequest(req) as RequestLike;
	const nodeRes = getNodeResponse(res) as NodeResponseLike;
	const origin = getHeaderValue(nodeReq.headers.origin);

	if (!origin || !isAllowedOrigin(origin, options.trustedOrigins)) {
		return false;
	}

	nodeRes.setHeader("Access-Control-Allow-Origin", origin);
	nodeRes.setHeader("Access-Control-Allow-Credentials", "true");
	appendVaryHeader(nodeRes, "Origin");

	if (nodeReq.method?.toUpperCase() !== "OPTIONS") {
		return false;
	}

	const requestMethod = getHeaderValue(
		nodeReq.headers["access-control-request-method"],
	);
	const requestHeaders = getHeaderValue(
		nodeReq.headers["access-control-request-headers"],
	);

	nodeRes.setHeader(
		"Access-Control-Allow-Methods",
		requestMethod ?? "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
	);

	if (requestHeaders) {
		nodeRes.setHeader("Access-Control-Allow-Headers", requestHeaders);
		appendVaryHeader(nodeRes, "Access-Control-Request-Headers");
	}

	nodeRes.statusCode = 204;
	nodeRes.setHeader("Content-Length", "0");
	nodeRes.end();

	return true;
}
