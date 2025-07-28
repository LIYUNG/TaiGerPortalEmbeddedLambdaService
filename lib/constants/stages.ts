import { AWS_ACCOUNT } from "../configuration";
import { Region } from "./regions";

export enum Stage {
    DEV = "dev",
    PROD = "prod"
}

export const STAGES = [
    {
        stageName: Stage.DEV,
        env: { region: Region.US_EAST_1, account: AWS_ACCOUNT },
        secretArn: `arn:aws:secretsmanager:${Region.US_EAST_1}:${AWS_ACCOUNT}:secret:beta/taiger/portal/service/env-486S9W`,
        isProd: false
    },
    {
        stageName: Stage.PROD,
        env: { region: Region.US_WEST_2, account: AWS_ACCOUNT },
        secretArn: `arn:aws:secretsmanager:${Region.US_WEST_2}:${AWS_ACCOUNT}:secret:prod/taiger/portal/service/env-74nBbU`,
        isProd: true
    }
];
