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
        isProd: false
    },
    {
        stageName: Stage.PROD,
        env: { region: Region.AP_NORTHEAST_1, account: AWS_ACCOUNT },
        isProd: true
    }
];
