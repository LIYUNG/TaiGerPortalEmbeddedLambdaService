import { readFileSync } from "fs";
import path from "path";
import type { APIGatewayProxyEvent } from "aws-lambda";

function loadEnvFromFile(): void {
    const envPath = path.resolve(__dirname, "../env.json");
    const envRaw = readFileSync(envPath, "utf8");
    const envJson = JSON.parse(envRaw);
    const envConfig = envJson?.LeadSimilarityFunction ?? {};

    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? envConfig.OPENAI_API_KEY;
    process.env.MONGODB_URI = process.env.MONGODB_URI ?? envConfig.MONGODB_URI;

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

    const requestContext = {} as unknown as APIGatewayProxyEvent["requestContext"];

    const event: APIGatewayProxyEvent = {
        body: null,
        headers: {},
        multiValueHeaders: {},
        httpMethod: "GET",
        isBase64Encoded: false,
        path: "/test/similar-students",
        pathParameters: null,
        queryStringParameters: { leadId: "iLyQHGSZjztrJ4ipxTocj", limit: "10" },
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext,
        resource: "/test/similar-students"
    };

    const response = await handler(event);
    console.info(response);
    process.exit(0);
}

main().catch((err) => {
    console.error("Test run failed:", err);
    process.exit(1);
});
