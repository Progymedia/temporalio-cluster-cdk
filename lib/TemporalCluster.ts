import { Construct } from 'constructs';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { AuroraMysqlEngineVersion, DatabaseClusterEngine } from 'aws-cdk-lib/aws-rds';
import {
    AwsLogDriver,
    Cluster,
    CpuArchitecture,
    FargatePlatformVersion,
    FargateService,
    FargateTaskDefinition,
    Protocol,
    Secret,
} from 'aws-cdk-lib/aws-ecs';
import {
    AuroraServerlessTemporalDatastore,
    IAuroraServerlessTemporalDatastoreProps,
    ITemporalDatastore,
} from './TemporalDatastore';
import { TemporalVersion } from './TemporalVersion';
import { RemovalPolicy, Token } from 'aws-cdk-lib';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { EfsFile } from './utils/EfsFile';
import { TemporalConfiguration } from './configurations/TemporalConfiguration';

const TemporalServices = ['frontend', 'history', 'matching', 'worker'] as const;
type TemporalService = typeof TemporalServices[number];

interface ITemporalClusterProps {
    readonly temporalVersion?: TemporalVersion;

    readonly vpc: IVpc;

    readonly datastore?: ITemporalDatastore;
    readonly datastoreOptions?: Omit<IAuroraServerlessTemporalDatastoreProps, 'vpc' | 'engine'>;

    readonly ecsCluster?: Cluster;

    readonly removalPolicy?: RemovalPolicy;

    readonly services?: {
        [k in TemporalService | 'defaults']?: Partial<ITemporalServiceProps>;
    };
}

interface ITemporalServiceProps {
    readonly cpu: number;
    readonly memoryLimitMiB: number;
    readonly cpuArchitecture: CpuArchitecture;
}

const defaultServiceProperties: ITemporalServiceProps = {
    cpu: 256,
    memoryLimitMiB: 512,
    cpuArchitecture: CpuArchitecture.X86_64,
} as const;

export class TemporalCluster extends Construct {
    public readonly ecsCluster: Cluster;
    public readonly datastore: ITemporalDatastore;
    public readonly temporalVersion: TemporalVersion;

    private readonly configEfs: FileSystem;

    constructor(scope: Construct, id: string, clusterProps: ITemporalClusterProps) {
        super(scope, id);

        // const clusterName = Names.uniqueId(this);
        this.temporalVersion = clusterProps.temporalVersion ?? TemporalVersion.LATEST;
        const temporalConfig = new TemporalConfiguration();

        this.datastore = this.getOrCreateDatastore(clusterProps);
        this.ecsCluster = this.getOrCreateEcsCluster(clusterProps);

        this.configEfs = this.setupConfigFileSystem(clusterProps, temporalConfig);

        // FIXME: Replace the auto-setup image by CustomResources that only runs setup tasks
        this.makeTemporalAutoSetupTask(clusterProps);

        // FIXME: Replace by TemporalServices
        for (const service of TemporalServices) {
            const serviceProps = {
                ...defaultServiceProperties,
                ...clusterProps.services?.defaults,
                ...clusterProps.services?.[service],
            };

            const exposedPorts = [
                temporalConfig.configuration.services[service].rpc.grpcPort,
                temporalConfig.configuration.services[service].rpc.membershipPort,
            ];

            this.makeTemporalServiceTaskDefinition(service, clusterProps, serviceProps, exposedPorts);
        }
    }

    private setupConfigFileSystem(props: ITemporalClusterProps, temporalConfig: TemporalConfiguration) {
        const configEfs = new FileSystem(this, 'ConfigFS', {
            vpc: props.vpc,
            removalPolicy: props.removalPolicy,
        });

        // Temporal server image builds the main configuration file, from a template file
        // Ideally, we would replace that template file with something that already contains
        // most of our configuration items. However, we faced issues implementing that:
        // posix permissions when the script tries to write new dockerized config file; ECS doesn't
        // allow to map a single file from an EFS volume (only a directory)...
        // At present, we rely on the default template file, and pass all config items through env variables.
        // A possible alternative: https://kichik.com/2020/09/10/mounting-configuration-files-in-fargate/
        // new EfsFile(this, 'TemporalConfig', {
        //     fileSystem: configEfs,
        //     path: `/temporal/config/config_template.yaml`,
        //     vpc: props.vpc,
        //     contents: temporalConfig.stringifyConfiguration(),
        // });

        new EfsFile(this, 'TemporalDynamicConfig', {
            fileSystem: configEfs,
            path: `/temporal/dynamic_config/dynamic_config.yaml`,
            vpc: props.vpc,
            contents: temporalConfig.stringifyDynamic(),
        });

        new EfsFile(this, 'TemporalWebConfig', {
            fileSystem: configEfs,
            path: `/temporal/web-config/web-config.yaml`,
            vpc: props.vpc,
            contents: temporalConfig.stringifyWeb(),
        });

        return configEfs;
    }

    private getOrCreateDatastore(props: ITemporalClusterProps) {
        // FIXME: Validate that requested/provided datastore is supported by requested temporal server version
        // https://docs.temporal.io/docs/server/versions-and-dependencies/#server-versioning-and-support-policy

        if (props.datastore && props.datastoreOptions) {
            throw `You must specify either a datastore or datastoreOptions, not both.`;
        } else if (props.datastore) {
            return props.datastore;
        } else {
            return new AuroraServerlessTemporalDatastore(this, 'Datastore', {
                engine: DatabaseClusterEngine.auroraMysql({ version: AuroraMysqlEngineVersion.VER_2_10_1 }),
                vpc: props.vpc,
                removalPolicy: props.removalPolicy,
                ...props.datastoreOptions,
            });
        }
    }

    private getOrCreateEcsCluster(props: ITemporalClusterProps) {
        if (props.ecsCluster) {
            return props.ecsCluster;
        } else {
            return new Cluster(this, 'EcsCluster', {
                vpc: props.vpc,
                enableFargateCapacityProviders: true,
            });
        }
    }

    // FIXME: Replace this by a CustomResource that runs required initialization code from a lambda
    // This is definitely not what I have in mind, but it should works enough for a proof-of-concept
    makeTemporalAutoSetupTask(clusterProps: ITemporalClusterProps) {
        const logGroup = new LogGroup(this, `AutoSetupLogGroup`, {
            removalPolicy: clusterProps.removalPolicy,
            retention: RetentionDays.ONE_MONTH,
        });

        const taskDefinition = new FargateTaskDefinition(this, `AutoSetupTaskDef`, {
            cpu: defaultServiceProperties.cpu,
            memoryLimitMiB: defaultServiceProperties.memoryLimitMiB,
            runtimePlatform: { cpuArchitecture: defaultServiceProperties.cpuArchitecture },

            volumes: [
                {
                    name: 'dynamic_config',
                    efsVolumeConfiguration: {
                        fileSystemId: this.configEfs.fileSystemId,
                        rootDirectory: '/temporal/dynamic_config',
                        // FIXME: Add authorization and in transit encryption
                    },
                },
            ],
        });

        const container = taskDefinition.addContainer(`AutoSetupTaskDefServiceContainer`, {
            containerName: 'AutoSetup',
            image: this.temporalVersion.containerImages.temporalAutoSetup,

            environment: {
                SERVICES: 'frontend:history:matching:worker',

                //
                // See https://github.com/temporalio/temporal/blob/master/docker/config_template.yaml for reference.
                LOG_LEVEL: 'debug,info',
                NUM_HISTORY_SHARDS: '512',

                DB: this.datastore.type,
                MYSQL_SEEDS: this.datastore.host,
                DB_PORT: Token.asString(this.datastore.port),
                DBNAME: 'temporal',
                DBNAME_VISIBILITY: 'temporal_visibility',

                // Required for Aurora MySQL 5.7
                // https://github.com/temporalio/temporal/issues/1251
                // https://github.com/temporalio/temporal/blob/71093d7c5baed10546d1e91608ab814f73c6fdba/docker/auto-setup.sh#L157
                MYSQL_TX_ISOLATION_COMPAT: 'true',

                DYNAMIC_CONFIG_FILE_PATH: '/etc/temporal/dynamic_config/dynamic_config.yaml',
            },

            secrets: {
                MYSQL_USER: Secret.fromSecretsManager(this.datastore.secret, 'username'),
                MYSQL_PWD: Secret.fromSecretsManager(this.datastore.secret, 'password'),
            },

            logging: new AwsLogDriver({
                streamPrefix: `${this.node.id}-AutoSetup`,
                logGroup,
            }),

            portMappings: [7233, 7234, 7235, 7239, 6933, 6934, 6935, 6939].map((port: number) => ({
                containerPort: port,
                hostPort: port,
                protocol: Protocol.TCP,
            })),
        });

        container.addMountPoints(
            // {
            //     containerPath: `/etc/temporal/config`,
            //     readOnly: false, // FIXME: entrypoint will generate config/docker.yaml from config/config_template.yaml
            //     sourceVolume: 'config',
            // },
            {
                containerPath: `/etc/temporal/dynamic_config`,
                readOnly: true,
                sourceVolume: 'dynamic_config',
            },
        );

        const fargateService = new FargateService(this, `AutoSetupFargateService`, {
            cluster: this.ecsCluster,
            assignPublicIp: false,
            taskDefinition,
            platformVersion: FargatePlatformVersion.VERSION1_4,
        });

        this.configEfs.connections.allowDefaultPortFrom(fargateService);
        this.datastore.connections.allowDefaultPortFrom(fargateService);

        return taskDefinition;
    }

    private makeTemporalServiceTaskDefinition(
        service: string,
        clusterProps: ITemporalClusterProps,
        serviceProps: ITemporalServiceProps,
        exposedPorts: number[],
    ) {
        const logGroup = new LogGroup(this, `${capitalize(service)}LogGroup`, {
            removalPolicy: clusterProps.removalPolicy,
            retention: RetentionDays.ONE_MONTH,
        });

        const taskDefinition = new FargateTaskDefinition(this, `${capitalize(service)}TaskDef`, {
            cpu: serviceProps.cpu,
            memoryLimitMiB: serviceProps.memoryLimitMiB,
            runtimePlatform: { cpuArchitecture: serviceProps.cpuArchitecture },

            volumes: [
                {
                    name: 'dynamic_config',
                    efsVolumeConfiguration: {
                        fileSystemId: this.configEfs.fileSystemId,
                        rootDirectory: '/temporal/dynamic_config',
                        // FIXME: Add authorization and in transit encryption
                    },
                },
            ],
        });

        const container = taskDefinition.addContainer(`${capitalize(service)}TaskDefServiceContainer`, {
            containerName: service,
            image: this.temporalVersion.containerImages.temporalServer,

            environment: {
                SERVICES: service,

                //
                // See https://github.com/temporalio/temporal/blob/master/docker/config_template.yaml for reference.
                LOG_LEVEL: 'debug,info',
                NUM_HISTORY_SHARDS: '512',

                DB: this.datastore.type,
                MYSQL_SEEDS: this.datastore.host,
                DB_PORT: Token.asString(this.datastore.port),
                DBNAME: 'temporal',
                DBNAME_VISIBILITY: 'temporal_visibility',

                // Required for Aurora MySQL 5.7
                // https://github.com/temporalio/temporal/issues/1251
                // https://github.com/temporalio/temporal/blob/71093d7c5baed10546d1e91608ab814f73c6fdba/docker/auto-setup.sh#L157
                MYSQL_TX_ISOLATION_COMPAT: 'true',

                DYNAMIC_CONFIG_FILE_PATH: '/etc/temporal/dynamic_config/dynamic_config.yaml',
            },

            secrets: {
                MYSQL_USER: Secret.fromSecretsManager(this.datastore.secret, 'username'),
                MYSQL_PWD: Secret.fromSecretsManager(this.datastore.secret, 'password'),
            },

            logging: new AwsLogDriver({
                streamPrefix: `${this.node.id}-${capitalize(service)}`,
                logGroup,
            }),

            portMappings: exposedPorts.map((port: number) => ({
                containerPort: port,
                hostPort: port,
                protocol: Protocol.TCP,
            })),
        });

        container.addMountPoints(
            // {
            //     containerPath: `/etc/temporal/config`,
            //     readOnly: false, // FIXME: entrypoint will generate config/docker.yaml from config/config_template.yaml
            //     sourceVolume: 'config',
            // },
            {
                containerPath: `/etc/temporal/dynamic_config`,
                readOnly: true,
                sourceVolume: 'dynamic_config',
            },
        );

        const fargateService = new FargateService(this, `${capitalize(service)}FargateService`, {
            cluster: this.ecsCluster,
            assignPublicIp: false,
            taskDefinition,
            platformVersion: FargatePlatformVersion.VERSION1_4,
        });

        this.configEfs.connections.allowDefaultPortFrom(fargateService);
        this.datastore.connections.allowDefaultPortFrom(fargateService);

        return taskDefinition;
    }
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
