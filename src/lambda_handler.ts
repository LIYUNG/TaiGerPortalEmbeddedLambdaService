import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log(event);
    console.log(process.env.ENV_VARIABLE);
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Hello, World! " + process.env.ENV_VARIABLE })
    };
};
