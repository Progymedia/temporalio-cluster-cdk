import { DockerImage } from 'aws-cdk-lib';

// https://github.com/temporalio/temporal/releases
export class TemporalVersion {
    public static V1_13_0 = new TemporalVersion('1.13.0');
    public static V1_13_1 = new TemporalVersion('1.13.1');
    public static V1_13_2 = new TemporalVersion('1.13.2');
    public static V1_13_3 = new TemporalVersion('1.13.3');

    public static V1_14_0 = new TemporalVersion('1.14.0');
    public static V1_14_1 = new TemporalVersion('1.14.1');
    public static V1_14_2 = new TemporalVersion('1.14.2');
    public static V1_14_3 = new TemporalVersion('1.14.3');
    public static V1_14_4 = new TemporalVersion('1.14.4');

    public static LATEST = TemporalVersion.V1_14_4;

    private constructor(public version: string, private customizations?: { repositoryBase: string }) {
        // FIXME: Assert that (if defined), repositoryBase ends with /
    }

    public get containerImages() {
        const prefix = this.customizations?.repositoryBase ?? '';

        // FIXME: Rethink how we handle versionning in this class. Not all components have the same version
        return {
            temporalServer: DockerImage.fromRegistry(`${prefix}temporalio/server:${this.version}`),
            temporalAutoSetup: DockerImage.fromRegistry(`${prefix}temporalio/auto-setup:${this.version}`),
            temporalAdminTools: DockerImage.fromRegistry(`${prefix}temporalio/admin-tools:${this.version}`),
            temporalWeb: DockerImage.fromRegistry(`${prefix}temporalio/web:1.13.0`),
        };
    }

    public withCustomizations(customizations: { repositoryBase: string }) {
        return new TemporalVersion(this.version, customizations);
    }
}
