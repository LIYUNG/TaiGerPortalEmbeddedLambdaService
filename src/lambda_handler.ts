import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    try {
        console.log("Received event:", JSON.stringify(event, null, 2));
        const path =  event.path;

        const handler = require(`./controllers/${path}`);
        if (typeof handler.handler !== 'function') {
            
        }
    } catch (error) {
        console.error("Error occurred:", error);
    } finally {
        console.log("Lambda handler execution completed.");
    }



    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Hello, World! " + process.env.ENV_VARIABLE })
    };
};
