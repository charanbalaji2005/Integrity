import type { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { auth } from "../providers/auth";
import { openApiDocument } from "./openapi";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

interface OpenApiOperation {
	tags?: string[];
}

type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

interface AuthOpenApiDocument {
	info: {
		title: string;
		description: string;
		version: string;
	};
	tags: Array<{
		name: string;
		description: string;
	}>;
	paths: Record<string, OpenApiPathItem>;
	[key: string]: unknown;
}

function formatAuthOpenApiDocument(document: AuthOpenApiDocument) {
	document.info = {
		...document.info,
		title: "API",
		description: "API reference for authentication endpoints.",
	};

	document.tags = [
		{
			name: "Auth",
			description: "Authentication and session endpoints.",
		},
	];

	for (const pathItem of Object.values(document.paths)) {
		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];

			if (operation) {
				operation.tags = ["Auth"];
			}
		}
	}

	return document;
}

function getScalarReferenceHtml() {
	const scalarConfiguration = {
		metaData: {
			title: "API Reference",
			description: "Application and authentication API reference",
		},
		sources: [
			{
				title: "API",
				slug: "api",
				url: "/api/openapi.json",
			},
			{
				title: "Auth",
				slug: "auth",
				url: "/api/auth/open-api/generate-schema",
				default: true,
			},
		],
		theme: "default",
	};

	return `<!doctype html>
<html>
  <head>
    <title>API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html,
      body,
      #app {
        height: 100%;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference("#app", ${JSON.stringify(scalarConfiguration)});
    </script>
  </body>
</html>`;
}

export function registerSwaggerDocs(app: Express) {
	app.get("/api/openapi.json", (_req: Request, res: Response) => {
		res.json(openApiDocument);
	});

	app.get("/api/auth/open-api/generate-schema", async (_req: Request, res: Response) => {
		const authOpenApiDocument = await auth.api.generateOpenAPISchema({
			headers: new Headers(),
		});

		res.json(formatAuthOpenApiDocument(authOpenApiDocument));
	});

	app.get("/api/v1/docs", (_req: Request, res: Response) => {
		res.type("html").send(getScalarReferenceHtml());
	});

	app.use(
		"/api/docs",
		swaggerUi.serve,
		swaggerUi.setup(openApiDocument, {
			customSiteTitle: "Assessment Integrity Agent API Docs",
			explorer: true,
			swaggerOptions: {
				urls: [
					{
						name: "Application API",
						url: "/api/openapi.json",
					},
					{
						name: "Better Auth API",
						url: "/api/auth/open-api/generate-schema",
					},
				],
			},
		}),
	);
}
