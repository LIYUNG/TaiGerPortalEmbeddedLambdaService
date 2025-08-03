import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
    AuthorizationType,
    BasePathMapping,
    LambdaIntegration,
    RestApi,
    DomainName,
    EndpointType
} from "aws-cdk-lib/aws-apigateway";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGatewayDomain } from "aws-cdk-lib/aws-route53-targets";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

import { APPLICATION_NAME, DOMAIN_NAME } from "../configuration";

interface LambdaStackProps extends cdk.StackProps {
    stageName: string;
    secretArn: string;
    isProd: boolean;
}

export class LambdaStack extends cdk.Stack {
    public readonly api: RestApi;
    constructor(scope: Construct, id: string, props: LambdaStackProps) {
        super(scope, id, props);

        const secret = Secret.fromSecretCompleteArn(
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
        this.api = new RestApi(this, `${APPLICATION_NAME}-APIG-${props.stageName}`, {
            restApiName: `${APPLICATION_NAME}-${props.stageName}`,
            defaultCorsPreflightOptions: {
                allowOrigins: [
                    "http://localhost:3006" // 本地開發
                ],
                allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                allowHeaders: ["Authorization", "Content-Type", "X-auth"],
                allowCredentials: true
            },
            description: "This service handles requests with Lambda.",
            deployOptions: {
                stageName: props.stageName // Your API stage
            },
            endpointConfiguration: { types: [EndpointType.REGIONAL] }
        });

        // Lambda integration
        const lambdaIntegration = new LambdaIntegration(lambdaFunction.currentVersion, {
            proxy: true // Proxy all requests to the Lambda
        });

        // Create a resource and method in API Gateway
        const lambdaProxy = this.api.root.addResource("{proxy+}");
        lambdaProxy.addMethod("ANY", lambdaIntegration, {
            authorizationType: AuthorizationType.IAM,
            requestParameters: {
                "method.request.path.proxy": true // Enable path parameter
            }
        });

        // Look up the existing hosted zone for your domain
        const hostedZone = HostedZone.fromLookup(
            this,
            `${APPLICATION_NAME}-HostedZone-${props.stageName}`,
            {
                domainName: DOMAIN_NAME // Your domain name
            }
        );

        const apiDomain = `api.crm.${props.stageName}.${DOMAIN_NAME}`;

        const certificate = new Certificate(
            this,
            `${APPLICATION_NAME}-ApiCertificate-${props.stageName}`,
            {
                domainName: apiDomain,
                validation: CertificateValidation.fromDns(hostedZone)
            }
        );

        const domainName = new DomainName(
            this,
            `${APPLICATION_NAME}-CustomDomain-${props.stageName}`,
            {
                domainName: apiDomain,
                certificate
            }
        );

        new BasePathMapping(this, `${APPLICATION_NAME}-BasePathMapping-${props.stageName}`, {
            domainName: domainName,
            restApi: this.api,
            stage: this.api.deploymentStage
        });

        // Step 6: Create Route 53 Record to point to the API Gateway
        new ARecord(this, `${APPLICATION_NAME}-ApiGatewayRecord-${props.stageName}`, {
            zone: hostedZone,
            recordName: apiDomain, // Subdomain name for your custom domain
            target: RecordTarget.fromAlias(new ApiGatewayDomain(domainName))
        });

        // Cost center tag
        cdk.Tags.of(lambdaFunction).add("Project", "TaiGerPortalEmbeddedLambdaService");
        cdk.Tags.of(lambdaFunction).add("Environment", props.stageName);
        cdk.Tags.of(this.api).add("CostCenter", "LambdaService");
    }
}
