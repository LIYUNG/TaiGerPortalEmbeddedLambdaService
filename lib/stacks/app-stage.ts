import { Construct } from "constructs";
import { Stage, StageProps } from "aws-cdk-lib";
import { LambdaStack } from "./lambda-stack";
import { APPLICATION_NAME } from "../configuration";

interface DeploymentkProps extends StageProps {
    stageName: string;
    secretArn: string;
    isProd: boolean;
}

export class PipelineAppStage extends Stage {
    readonly lambdaStack: LambdaStack;
    constructor(scope: Construct, id: string, props: DeploymentkProps) {
        super(scope, id, props);

        this.lambdaStack = new LambdaStack(
            this,
            `${APPLICATION_NAME}LambdaStack-${props.stageName}`,
            {
                ...props,
                stageName: props.stageName,
                secretArn: props.secretArn,
                isProd: props.isProd
            }
        );
    }
}
