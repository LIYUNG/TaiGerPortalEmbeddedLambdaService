import * as cdk from "aws-cdk-lib";
import { Alias, Code, SnapStartConf, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import {
    AuthorizationType,
    LambdaIntegration,
    MethodOptions,
    RestApi
} from "aws-cdk-lib/aws-apigateway";

import { APPLICATION_NAME } from "../configuration";

interface LambdaStackProps extends cdk.StackProps {
    stageName: string;
    isProd: boolean;
}

export class LambdaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: LambdaStackProps) {
        super(scope, id, props);

        const lambdaFunction = new Function(
            this,
            `${APPLICATION_NAME}-Function-${props.stageName}`,
            {
                functionName: `${APPLICATION_NAME}-${props.stageName}`,
                runtime: Runtime.PYTHON_3_12, // Using python 3.12 or above runtime
                code: Code.fromInline(`
import json
import os

def lambda_handler(event, context):
    print("Received event:", json.dumps(event, indent=2))

    # Access environment variables
    ENV_VARIABLE = os.getenv("ENV_VARIABLE")

    print("Environment Variables:")
    print(f"ENV_VARIABLE: {ENV_VARIABLE}")


    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Hello from inline Python Lambda!"}),
    }
`),
                handler: "index.lambda_handler",
                architecture: cdk.aws_lambda.Architecture.ARM_64,
                memorySize: 128,
                timeout: cdk.Duration.seconds(300),
                environment: {
                    ENV_VARIABLE: props.stageName
                },
                snapStart: SnapStartConf.ON_PUBLISHED_VERSIONS // Enable SnapStart
            }
        );

        // Explicitly publish a new Lambda version
        const lambdaVersion = new Version(this, `LambdaVersion-${props.stageName}`, {
            lambda: lambdaFunction
        });

        // Alias pointing to the latest published version
        const lambdaAlias = new Alias(this, `LambdaAlias-${props.stageName}`, {
            aliasName: "live",
            version: lambdaVersion
        });

        // Step 2: Create API Gateway
        const api = new RestApi(this, `${APPLICATION_NAME}-APIG-${props.stageName}`, {
            restApiName: `${APPLICATION_NAME}-${props.stageName}`,
            description: "This service handles requests with Lambda.",
            deployOptions: {
                stageName: props.stageName // Your API stage
            }
        });

        // Lambda integration
        const lambdaIntegration = new LambdaIntegration(lambdaAlias, {
            proxy: true // Proxy all requests to the Lambda
        });

        // Define IAM authorization for the API Gateway method
        const methodOptions: MethodOptions = {
            authorizationType: AuthorizationType.IAM // Require SigV4 signed requests
        };

        // Create a resource and method in API Gateway
        const lambdaHelloWorld = api.root.addResource("hello");
        lambdaHelloWorld.addMethod("GET", lambdaIntegration, methodOptions);

        // Cost center tag
        cdk.Tags.of(lambdaFunction).add("Project", "Example");
        cdk.Tags.of(lambdaFunction).add("Environment", "Production");
        cdk.Tags.of(api).add("CostCenter", "LambdaService");
    }
}
