import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { routes } from "./routes";
import { ApiResponse } from "./apiResponse";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Processing API request:", JSON.stringify(event, null, 2));
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
