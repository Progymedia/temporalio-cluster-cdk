import { TemporalCluster } from '..';
import { BaseTemporalService, IBaseTemporalServiceProps } from './BaseService';

export class SingleService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Single', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            environement: {
                SERVICES: 'frontend:history:matching:worker',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/temporal/dynamic_config',
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                },
            ],
            exposedPorts: [
                // FIXME: make this cleaner
                cluster.temporalConfig.configuration.services.frontend.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.frontend.rpc.membershipPort,
                cluster.temporalConfig.configuration.services.history.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.history.rpc.membershipPort,
                cluster.temporalConfig.configuration.services.matching.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.matching.rpc.membershipPort,
                cluster.temporalConfig.configuration.services.worker.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.worker.rpc.membershipPort,
            ],
        });
    }
}

export class FrontendService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Frontend', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            environement: {
                SERVICES: 'frontend',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/temporal/dynamic_config',
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                },
            ],
            exposedPorts: [
                // FIXME: make this cleaner
                cluster.temporalConfig.configuration.services.frontend.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.frontend.rpc.membershipPort,
            ],
        });
    }
}

export class HistoryService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'History', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            environement: {
                SERVICES: 'history',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/temporal/dynamic_config',
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                },
            ],
            exposedPorts: [
                // FIXME: make this cleaner
                cluster.temporalConfig.configuration.services.history.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.history.rpc.membershipPort,
            ],
        });
    }
}

export class MatchingService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Matching', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            environement: {
                SERVICES: 'matching',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/temporal/dynamic_config',
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                },
            ],
            exposedPorts: [
                // FIXME: make this cleaner
                cluster.temporalConfig.configuration.services.matching.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.matching.rpc.membershipPort,
            ],
        });
    }
}

export class WorkerService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Worker', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            environement: {
                SERVICES: 'worker',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/temporal/dynamic_config',
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                },
            ],
            exposedPorts: [
                // FIXME: make this cleaner
                cluster.temporalConfig.configuration.services.worker.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.worker.rpc.membershipPort,
            ],
        });
    }
}

export class WebService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Web', {
            image: cluster.temporalVersion.containerImages.temporalWeb,
            machine: props.machine,
            environement: {},
            volumes: [
                {
                    name: 'web_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/temporal/web_config',
                    containerPath: `/etc/temporal/web_config`,
                    readOnly: true,
                },
            ],
            exposedPorts: [
                // FIXME: make this configurable
                8088,
            ],
        });
    }
}
