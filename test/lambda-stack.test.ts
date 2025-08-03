import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { LambdaStack } from "../lib/stacks/lambda-stack";
import { APPLICATION_NAME } from "../lib/configuration";

test("Lambda Stack Created", () => {
    const app = new cdk.App();
    const stageName = "test";
    const secretArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret";
    // WHEN
    const lambdaStack = new LambdaStack(app, "LambdaStack", {
        stageName: stageName,
        isProd: false,
        secretArn: secretArn,
        env: {
            account: "123456789313",
            region: "us-east-1"
        }
    });
    // THEN
    const template = Template.fromStack(lambdaStack);

    // Check if Lambda Function exists
    template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs20.x", // Adjust if needed
        Handler: "index.handler" // Ensure this matches your Lambda handler
    });

    // Check if API Gateway exists
    template.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Name: `${APPLICATION_NAME}-${stageName}` // Ensure this matches your API Gateway name
    });
});
