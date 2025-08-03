import { APIGatewayProxyResult } from "aws-lambda";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // You can restrict this to specific domains
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json"
};

export const ApiResponse = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ok: (data: any): APIGatewayProxyResult => ({
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(data)
    }),

    notFound: (message: string): APIGatewayProxyResult => ({
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: message })
    }),

    internalServerError: (message: string): APIGatewayProxyResult => ({
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: message })
    })
};
