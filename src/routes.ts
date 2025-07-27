import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ApiResponse } from "./apiResponse";

export const routes: Record<
    string,
    (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
> = {
    "/hello": async () => {
        return ApiResponse.ok({ message: "Hello from Lambda!" });
    },

    "/echo": async (event) => {
        const body = event.body ? JSON.parse(event.body) : {};
        return ApiResponse.ok({ received: body });
    },

    "/time": async () => {
        return ApiResponse.ok({ time: new Date().toISOString() });
    },

    "/lead-student-matching": async () => {
        return ApiResponse.ok({
            message: "Lead-Student Matching endpoint is not implemented yet"
        });
    }
};
