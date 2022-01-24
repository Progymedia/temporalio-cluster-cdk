import { Construct } from 'constructs';
import { IVpc, Port } from 'aws-cdk-lib/aws-ec2';
import { AuroraMysqlEngineVersion, DatabaseClusterEngine } from 'aws-cdk-lib/aws-rds';
import { Cluster, CpuArchitecture } from 'aws-cdk-lib/aws-ecs';
import {
    AuroraServerlessTemporalDatastore,
    IAuroraServerlessTemporalDatastoreProps,
    ITemporalDatastore,
} from './TemporalDatastore';
import { TemporalVersion } from './TemporalVersion';
import { Lazy, Names, RemovalPolicy } from 'aws-cdk-lib';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { EfsFile } from './customResources/efsFileResource/EfsFileResource';
import { TemporalConfiguration } from './configurations/TemporalConfiguration';
import { DnsRecordType, INamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { FrontendService, HistoryService, MatchingService, WebService, WorkerService } from './services/ServerServices';
import { BaseTemporalService, ITemporalServiceMachineProps } from './services/BaseService';
import { TemporalDatabase } from './customResources/temporal/TemporalDatabaseResource';
import { uniq } from 'lodash';

export interface ITemporalClusterProps {
    readonly clusterName?: string;
    readonly temporalVersion?: TemporalVersion;

    readonly vpc: IVpc;
    readonly ecsCluster?: Cluster;

    readonly removalPolicy?: RemovalPolicy;

    readonly datastore?: ITemporalDatastore;
    readonly datastoreOptions?: Omit<IAuroraServerlessTemporalDatastoreProps, 'vpc' | 'engine'>;

    readonly services?: {
        autoSetup?: Partial<ITemporalServiceProps>; // FIXME: To be removed
        frontend?: Partial<ITemporalServiceProps>;
        history?: Partial<ITemporalServiceProps>;
        matching?: Partial<ITemporalServiceProps>;
        worker?: Partial<ITemporalServiceProps>;
        web?: Partial<ITemporalServiceProps> & { enabled?: boolean };
        defaults?: Partial<ITemporalServiceProps>;
    };

    readonly cloudMapRegistration?: {
        namespace: INamespace;
        serviceName: string;
    };

    // FIXME: Implements this
    readonly metrics?: {
        engine?: 'disabled' | 'prometheus' | 'cloudwatch';
        prometheusServer?: string;
    };
}

interface ITemporalServiceProps {
    machine: ITemporalServiceMachineProps;
}

const defaultMachineProperties: ITemporalServiceMachineProps = {
    cpu: 256,
    memoryLimitMiB: 512,
    cpuArchitecture: CpuArchitecture.X86_64,
} as const;

export class TemporalCluster extends Construct {
    public readonly name: string;

    public readonly temporalVersion: TemporalVersion;

    // FIXME: Reconsider if it would be possible to not expose the following three publicly
    public readonly temporalConfig: TemporalConfiguration;
    public readonly ecsCluster: Cluster;
    public readonly configEfs: FileSystem;

    public readonly services: {
        // autoSetup?: AutoSetupService;
        frontend?: FrontendService;
        matching?: MatchingService;
        history?: HistoryService;
        worker?: WorkerService;
        web?: WebService;
    };

    constructor(scope: Construct, id: string, clusterProps: ITemporalClusterProps) {
        super(scope, id);

        this.name = clusterProps.clusterName ?? Names.uniqueId(this);
        this.temporalVersion = clusterProps.temporalVersion ?? TemporalVersion.LATEST;
        this.temporalConfig = new TemporalConfiguration();

        const servicesProps = this.resolveServiceProps(clusterProps.services);

        // FIXME: Add support for mixed datastores configuration (ie. SQL+Cassandra or SQL+ES)
        const datastore = this.getOrCreateDatastore(clusterProps);

        const mainDatabase = new TemporalDatabase(this, 'MainDatabase', {
            temporalCluster: this,
            datastore: datastore,
            vpc: clusterProps.vpc,
            databaseName: 'temporal', // FIXME: Make database name configurable (related to support for mixed datastore config)
            schemaType: 'main',
            removalPolicy: clusterProps.removalPolicy,
        });
        this.temporalConfig.attachDatabase(mainDatabase);

        const visibilityDatabase = new TemporalDatabase(this, 'VisibilityDatabase', {
            temporalCluster: this,
            datastore: datastore,
            vpc: clusterProps.vpc,
            databaseName: 'temporal_visibility', // FIXME: Make database name configurable (related to support for mixed datastore config)
            schemaType: 'visibility',
            removalPolicy: clusterProps.removalPolicy,
        });
        this.temporalConfig.attachDatabase(visibilityDatabase);

        this.ecsCluster = this.getOrCreateEcsCluster(clusterProps);

        this.configEfs = this.setupConfigFileSystem(clusterProps, this.temporalConfig);

        this.services = {
            // FIXME: Replace the auto-setup image by CustomResources that only runs setup tasks
            // autoSetup: new AutoSetupService(this, { machine: servicesProps.autoSetup.machine }),

            frontend: new FrontendService(this, { machine: servicesProps.frontend.machine }),
            matching: new MatchingService(this, { machine: servicesProps.matching.machine }),
            history: new HistoryService(this, { machine: servicesProps.history.machine }),
            worker: new WorkerService(this, { machine: servicesProps.worker.machine }),

            web: servicesProps.web.enabled ? new WebService(this, { machine: servicesProps.web.machine }) : undefined,
        };

        if (clusterProps.cloudMapRegistration) {
            this.services.frontend.fargateService.enableCloudMap({
                name: clusterProps.cloudMapRegistration?.serviceName,
                cloudMapNamespace: clusterProps.cloudMapRegistration?.namespace,
                dnsRecordType: DnsRecordType.A,
            });
        }

        this.wireUpNetworkAuthorizations([mainDatabase, visibilityDatabase]);
    }

    // FIXME: Refactor this
    private resolveServiceProps(
        services: ITemporalClusterProps['services'],
    ): Required<Omit<ITemporalClusterProps['services'], 'default'>> {
        const out: ITemporalClusterProps['services'] = {};

        for (const service of ['frontend', 'history', 'matching', 'worker', 'autoSetup', 'web'] as const) {
            out[service] = {
                ...services?.defaults,
                ...services?.[service],
                machine: {
                    ...defaultMachineProperties,
                    ...services?.defaults?.machine,
                    ...services?.[service]?.machine,
                },
            };
        }

        out.web.enabled ??= true;

        return out as Required<Omit<ITemporalClusterProps['services'], 'default'>>;
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
                containerInsights: true,
            });
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
        //     contents: Lazy.string({ produce: () => temporalConfig.stringifyConfiguration() }),
        // });

        new EfsFile(this, 'TemporalDynamicConfig', {
            fileSystem: configEfs,
            path: `/temporal/dynamic_config/dynamic_config.yaml`,
            vpc: props.vpc,
            contents: Lazy.string({ produce: () => temporalConfig.stringifyDynamic() }),
        });

        new EfsFile(this, 'TemporalWebConfig', {
            fileSystem: configEfs,
            path: `/temporal/web_config/web_config.yaml`,
            vpc: props.vpc,
            contents: Lazy.string({ produce: () => temporalConfig.stringifyWeb() }),
        });

        return configEfs;
    }

    private wireUpNetworkAuthorizations(databases: TemporalDatabase[]) {
        // Wire up network authorizations
        // FIXME: Refactor all of this
        // FIXME: At this time, the autoSetup plays all roles; it makes wiring up significantly more complicated...
        function allow(sources: BaseTemporalService[], port: number, targets: BaseTemporalService[]) {
            for (const target of targets)
                for (const source of sources) {
                    target.fargateService.connections.allowFrom(source.fargateService, Port.tcp(port));
                }
        }

        // FIXME: Not everyone might want this...
        this.services.frontend.fargateService.connections.allowFromAnyIpv4(Port.tcp(7233));
        // this.services.autoSetup.fargateService.connections.allowFromAnyIpv4(Port.tcp(7233)); // FIXME: Remove

        const frontendNodes = [this.services.frontend /*, this.services.autoSetup*/];
        const historyNodes = [this.services.history /*, this.services.autoSetup*/];
        const matchingNodes = [this.services.matching /*, this.services.autoSetup*/];
        const workerNodes = [this.services.worker /*, this.services.autoSetup*/];

        allow(frontendNodes, 7234, historyNodes);
        allow(frontendNodes, 7235, matchingNodes);
        allow(frontendNodes, 7239, workerNodes);

        allow(historyNodes, 7235, matchingNodes);

        allow(matchingNodes, 7233, frontendNodes);
        allow(matchingNodes, 7234, historyNodes);

        allow(workerNodes, 7233, frontendNodes);

        allow(frontendNodes, 6933, frontendNodes);
        allow(historyNodes, 6934, historyNodes);
        allow(matchingNodes, 6935, matchingNodes);
        allow(workerNodes, 6939, workerNodes);

        const datastores = uniq(databases.map((db) => db.datastore));
        for (const datastore of datastores) {
            // Grant network access from the fargate service to the RDS datastore
            datastore.connections.allowDefaultPortFrom(this.services.frontend.fargateService);
            datastore.connections.allowDefaultPortFrom(this.services.history.fargateService);
            datastore.connections.allowDefaultPortFrom(this.services.matching.fargateService);
            // datastore.connections.allowDefaultPortFrom(this.services.autoSetup.fargateService);
        }
    }
}
