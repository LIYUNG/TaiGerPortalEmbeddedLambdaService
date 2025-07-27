import { APIGatewayProxyResult } from "aws-lambda";

export const ApiResponse = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ok: (data: any): APIGatewayProxyResult => ({
        statusCode: 200,
        body: JSON.stringify(data)
    }),

    notFound: (message: string): APIGatewayProxyResult => ({
        statusCode: 404,
        body: JSON.stringify({ error: message })
    }),

    internalServerError: (message: string): APIGatewayProxyResult => ({
        statusCode: 500,
        body: JSON.stringify({ error: message })
    })
};
