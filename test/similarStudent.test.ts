import { readFileSync } from "fs";
import path from "path";
import type { APIGatewayProxyEvent } from "aws-lambda";

function loadEnvFromFile(): void {
    const envPath = path.resolve(__dirname, "../env.json");
    const envRaw = readFileSync(envPath, "utf8");
    const envJson = JSON.parse(envRaw);
    const envConfig = envJson?.LeadSimilarityFunction ?? {};

    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? envConfig.OPENAI_API_KEY;

    if (!process.env.POSTGRES_URI && envConfig.DB_HOST) {
        const sslMode = envConfig.DB_SSL === "false" ? "disable" : "require";
        process.env.POSTGRES_URI =
            `postgresql://${envConfig.DB_USER}:${envConfig.DB_PASSWORD}` +
            `@${envConfig.DB_HOST}:${envConfig.DB_PORT}/${envConfig.DB_NAME}?sslmode=${sslMode}`;
    }
}

async function main() {
    loadEnvFromFile();

    const { handler } = await import("../src/controllers/similarStudents");

    const event: APIGatewayProxyEvent = {
        body: null,
        headers: {},
        multiValueHeaders: {},
        httpMethod: "GET",
        isBase64Encoded: false,
        path: "/test/similar-students",
        pathParameters: null,
        queryStringParameters: { leadId: "Tdw2hAm07kqKpfWaV5hSx", limit: "10" },
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: "/test/similar-students"
    };

    const response = await handler(event);
    console.info(response);
}

main().catch((err) => {
    console.error("Test run failed:", err);
    process.exit(1);
});
