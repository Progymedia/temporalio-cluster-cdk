import {
    AwsLogDriver,
    ContainerImage,
    CpuArchitecture,
    FargatePlatformVersion,
    FargateService,
    FargateTaskDefinition,
    OperatingSystemFamily,
    Protocol,
    Secret,
} from 'aws-cdk-lib/aws-ecs';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { TemporalCluster } from '..';
import { uniq, map } from 'lodash';
import { DockerImage, RemovalPolicy } from 'aws-cdk-lib';
import { Connections, IConnectable, SubnetType } from 'aws-cdk-lib/aws-ec2';

export interface ITemporalServiceMachineProps {
    readonly cpu: number;
    readonly memoryLimitMiB: number;
    readonly cpuArchitecture: CpuArchitecture;
}

export interface ITemporalServiceVolumeProps {
    name: string;
    fileSystem: FileSystem;
    volumePath: string;
    containerPath: string;
    readOnly: boolean;
}

export interface IBaseTemporalServiceProps {
    readonly image: DockerImage;
    readonly machine: ITemporalServiceMachineProps;
    readonly environement: { [key: string]: string };
    readonly secrets?: { [key: string]: Secret };
    readonly volumes: ITemporalServiceVolumeProps[];
    readonly exposedPorts: number[];
}

export abstract class BaseTemporalService extends Construct implements IConnectable {
    public readonly fargateService: FargateService;

    constructor(private cluster: TemporalCluster, id: string, props: IBaseTemporalServiceProps) {
        super(cluster, id);

        const taskDefinition = new FargateTaskDefinition(this, `TaskDef`, {
            cpu: props.machine.cpu,
            memoryLimitMiB: props.machine.memoryLimitMiB,
            runtimePlatform: {
                cpuArchitecture: props.machine.cpuArchitecture,
                operatingSystemFamily: OperatingSystemFamily.LINUX,
            },

            volumes: props.volumes.map((vol) => ({
                name: vol.name,
                efsVolumeConfiguration: {
                    fileSystemId: vol.fileSystem.fileSystemId,
                    rootDirectory: vol.volumePath,
                    // FIXME: Add authorization and in transit encryption
                },
            })),
        });

        const container = taskDefinition.addContainer(`Container`, {
            containerName: `${cluster.name}-${id}`,
            image: ContainerImage.fromRegistry(props.image.image),

            environment: props.environement,
            secrets: props.secrets,

            logging: new AwsLogDriver({
                streamPrefix: `${this.cluster.name}-${id}`,
                logGroup: new LogGroup(this, `LogGroup`, {
                    // FIXME: Make this configurable
                    removalPolicy: RemovalPolicy.RETAIN,
                    retention: RetentionDays.ONE_WEEK,
                }),
            }),

            portMappings: props.exposedPorts.map((port: number) => ({
                containerPort: port,
                hostPort: port,
                protocol: Protocol.TCP,
            })),
        });

        container.addMountPoints(
            ...props.volumes.map((vol) => ({
                sourceVolume: vol.name,
                containerPath: vol.containerPath,
                readOnly: vol.readOnly,
            })),
        );

        this.fargateService = new FargateService(this, `FargateService`, {
            cluster: cluster.ecsCluster,
            assignPublicIp: false,
            taskDefinition,

            // FIXME: Make this configurable
            vpcSubnets: { onePerAz: true, subnetType: SubnetType.PRIVATE_WITH_NAT },
            platformVersion: FargatePlatformVersion.VERSION1_4,
        });

        // Grant network access from the fargate service to the EFS file system
        for (const fs of uniq(map(props.volumes, 'fileSystem'))) {
            fs.connections.allowDefaultPortFrom(this.fargateService);
        }
    }

    public get connections(): Connections {
        return this.fargateService.connections;
    }
}
