import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { LambdaStack } from "../lib/stacks/lambda-stack";
import { APPLICATION_NAME } from "../lib/configuration";

test("Lambda Stack Created", () => {
    const app = new cdk.App();
    const stageName = "test";
    // WHEN
    const lambdaStack = new LambdaStack(app, "LambdaStack", {
        stageName: stageName,
        isProd: false
    });
    // THEN
    const template = Template.fromStack(lambdaStack);

    // Check if Lambda Function exists
    template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "python3.12", // Adjust if needed
        Handler: "index.lambda_handler" // Ensure this matches your Lambda handler
    });

    // Check if API Gateway exists
    template.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Name: `${APPLICATION_NAME}-${stageName}` // Ensure this matches your API Gateway name
    });
});
