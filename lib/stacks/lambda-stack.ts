import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
    AuthorizationType,
    LambdaIntegration,
    MethodOptions,
    RestApi
} from "aws-cdk-lib/aws-apigateway";
import { aws_secretsmanager } from "aws-cdk-lib";
import { APPLICATION_NAME } from "../configuration";

interface LambdaStackProps extends cdk.StackProps {
    stageName: string;
    secretArn: string;
    isProd: boolean;
}

export class LambdaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: LambdaStackProps) {
        super(scope, id, props);

        const secret = aws_secretsmanager.Secret.fromSecretCompleteArn(
            this,
            `${APPLICATION_NAME}-Secret-${props.stageName}`,
            props.secretArn
        );

        const lambdaFunction = new NodejsFunction(
            this,
            `${APPLICATION_NAME}-Function-${props.stageName}`,
            {
                functionName: `${APPLICATION_NAME}-${props.stageName}`,
                runtime: Runtime.NODEJS_20_X,
                handler: "handler",
                entry: "src/lambda_handler.ts",
                bundling: {
                    esbuildArgs: { "--bundle": true },
                    target: "es2020",
                    platform: "node",
                    minify: true
                },
                architecture: cdk.aws_lambda.Architecture.ARM_64,
                memorySize: 128,
                timeout: cdk.Duration.seconds(300),
                environment: {
                    ENV_VARIABLE: props.stageName,
                    POSTGRES_URI: secret.secretValueFromJson("POSTGRES_URI").unsafeUnwrap(),
                    OPENAI_API_KEY: secret.secretValueFromJson("OPENAI_API_KEY").unsafeUnwrap()
                }
            }
        );

        secret.grantRead(lambdaFunction);

        // Step 2: Create API Gateway
        const api = new RestApi(this, `${APPLICATION_NAME}-APIG-${props.stageName}`, {
            restApiName: `${APPLICATION_NAME}-${props.stageName}`,
            description: "This service handles requests with Lambda.",
            deployOptions: {
                stageName: props.stageName // Your API stage
            }
        });

        // Lambda integration
        const lambdaIntegration = new LambdaIntegration(lambdaFunction.currentVersion, {
            proxy: true // Proxy all requests to the Lambda
        });

        // Define IAM authorization for the API Gateway method
        const methodOptions: MethodOptions = {
            authorizationType: AuthorizationType.IAM // Require SigV4 signed requests
        };

        // Create a proxy resource that catches all paths
        api.root.addProxy({
            defaultIntegration: lambdaIntegration,
            defaultMethodOptions: methodOptions
        });

        // Cost center tag
        cdk.Tags.of(lambdaFunction).add("Project", "TaiGerPortalEmbeddedLambdaService");
        cdk.Tags.of(lambdaFunction).add("Environment", props.stageName);
        cdk.Tags.of(api).add("CostCenter", "LambdaService");
    }
}
