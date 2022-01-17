import YAML from 'yaml';

export class TemporalConfiguration {
    public configuration = { ...baseTemporalConfiguration };
    public dynamic = { ...baseDynamicConfiguration };
    public web = { ...baseWebConfiguration };

    public stringifyConfiguration(): string {
        return YAML.stringify(this.configuration);
    }

    public stringifyDynamic(): string {
        return YAML.stringify(this.dynamic);
    }

    public stringifyWeb(): string {
        return YAML.stringify(this.web);
    }
}

// Note: This configuration will actually be reevaluated at each docker launch, using dockerize.
// It is therefore possible and acceptable to include reference to environment variables in this.
// Note however that
// See https://github.com/temporalio/temporal/blob/master/docker/config_template.yaml for reference.
const baseTemporalConfiguration = {
    log: {
        stdout: true,
        level: 'debug,info',
    },
    persistence: {
        defaultStore: 'default',
        visibilityStore: 'visibility',
        numHistoryShards: 8,
        datastores: {
            default: {
                sql: {
                    pluginName: 'mysql',
                    driverName: 'mysql',
                    databaseName: 'temporal',
                    connectAddr: 'mysql:3306',
                    connectProtocol: 'tcp',
                    user: 'temporal',
                    password: '',
                    maxConnLifetime: '1h',
                    maxConns: 20,
                    secretName: '',
                },
            },
            visibility: {
                sql: {
                    pluginName: 'mysql',
                    driverName: 'mysql',
                    databaseName: 'temporal_visibility',
                    connectAddr: 'mysql:3306',
                    connectProtocol: 'tcp',
                    user: 'temporal',
                    password: '{{ .Env.TEMPORAL_VISIBILITY_STORE_PASSWORD }}',
                    maxConnLifetime: '1h',
                    maxConns: 20,
                    secretName: '',
                },
            },
        },
    },
    global: {
        membership: {
            name: 'temporal',
            maxJoinDuration: '30s',
            broadcastAddress: {},
        },
        pprof: {
            port: 7936,
        },
    },
    services: {
        frontend: {
            rpc: {
                grpcPort: 7233,
                membershipPort: 6933,
                bindOnIP: '0.0.0.0',
            },
            metrics: {
                tags: {
                    type: 'frontend',
                },
                prometheus: {
                    timerType: 'histogram',
                    listenAddress: '0.0.0.0:9090',
                },
            },
        },
        history: {
            rpc: {
                grpcPort: 7234,
                membershipPort: 6934,
                bindOnIP: '0.0.0.0',
            },
            metrics: {
                tags: {
                    type: 'history',
                },
                prometheus: {
                    timerType: 'histogram',
                    listenAddress: '0.0.0.0:9090',
                },
            },
        },
        matching: {
            rpc: {
                grpcPort: 7235,
                membershipPort: 6935,
                bindOnIP: '0.0.0.0',
            },
            metrics: {
                tags: {
                    type: 'matching',
                },
                prometheus: {
                    timerType: 'histogram',
                    listenAddress: '0.0.0.0:9090',
                },
            },
        },
        worker: {
            rpc: {
                grpcPort: 7239,
                membershipPort: 6939,
                bindOnIP: '0.0.0.0',
            },
            metrics: {
                tags: {
                    type: 'worker',
                },
                prometheus: {
                    timerType: 'histogram',
                    listenAddress: '0.0.0.0:9090',
                },
            },
        },
    },
    clusterMetadata: {
        enableGlobalDomain: false,
        failoverVersionIncrement: 10,
        masterClusterName: 'active',
        currentClusterName: 'active',
        clusterInformation: {
            active: {
                enabled: true,
                initialFailoverVersion: 1,
                rpcName: 'temporal-frontend',
                rpcAddress: '127.0.0.1:7933',
            },
        },
    },
    dcRedirectionPolicy: {
        policy: 'noop',
        toDC: '',
    },
    archival: {
        status: 'disabled',
    },
    publicClient: {
        hostPort: 'abcdef.mydomain.com-frontend:7233',
    },
    dynamicConfigClient: {
        filepath: '/etc/temporal/dynamic_config/dynamic_config.yaml',
        pollInterval: '10s',
    },
};

const baseDynamicConfiguration = {};

const baseWebConfiguration = {
    auth: {
        enabled: false,
    },
    routing: {
        issue_report_link: 'https://github.com/temporalio/web/issues/new/choose',
    },
};
