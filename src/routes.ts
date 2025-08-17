import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ApiResponse } from "./apiResponse";
import { handler as similarStudents } from "./controllers/similarStudents";

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

    "/similar-students": similarStudents
};
