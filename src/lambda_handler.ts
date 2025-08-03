import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { routes } from "./routes";
import { ApiResponse } from "./apiResponse";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Processing API request:", JSON.stringify(event, null, 2));

        // Handle preflight OPTIONS requests for CORS
        if (event.httpMethod === "OPTIONS") {
            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers":
                        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
                },
                body: ""
            };
        }

        const path = event.path;

        const routeHandler = routes[path as keyof typeof routes];
        if (!routeHandler) {
            return ApiResponse.notFound("Endpoint not found");
        }

        return await routeHandler(event);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Unexpected error:", error);
        return ApiResponse.internalServerError("An unexpected error occurred");
    }
};
