import { Token } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-ecs';
import YAML from 'yaml';
import { TemporalDatabase } from '../customResources/temporal/TemporalDatabaseResource';
import { ITemporalDatastore } from '../TemporalDatastore';

export class TemporalConfiguration {
    public configuration = { ...baseTemporalConfiguration };
    public dynamic = { ...baseDynamicConfiguration };
    public web = { ...baseWebConfiguration };
    private envVariables: { [k: string]: string };
    private secrets: { [k: string]: Secret };

    public toEnvironmentVariables(): { [k: string]: string } {
        return {
            //
            // See https://github.com/temporalio/temporal/blob/master/docker/config_template.yaml for reference.
            LOG_LEVEL: 'debug,info',
            NUM_HISTORY_SHARDS: `${this.configuration.persistence.numHistoryShards}`,

            ...this.envVariables,

            DYNAMIC_CONFIG_FILE_PATH: '/etc/temporal/dynamic_config/dynamic_config.yaml',
        };
    }

    public toSecrets(): { [key: string]: Secret } {
        return this.secrets;
    }

    public stringifyConfiguration(): string {
        return YAML.stringify(this.configuration);
    }

    public stringifyDynamic(): string {
        return YAML.stringify(this.dynamic);
    }

    public stringifyWeb(): string {
        return YAML.stringify(this.web);
    }

    public attachDatabase(database: TemporalDatabase) {
        // FIXME: Add support for various types of datastores. At this time, this is much more difficult that it should
        // because of the fact that we can't replace the temporal configuration file directly, and must therefore go
        // through environement variables...
        if (database.datastore.plugin === 'mysql') {
            this.envVariables = {
                DB: 'mysql',
                MYSQL_SEEDS: database.datastore.host,
                DB_PORT: Token.asString(database.datastore.port),
                DBNAME: 'temporal',
                DBNAME_VISIBILITY: 'temporal_visibility',

                // Required for Aurora MySQL 5.7
                // https://github.com/temporalio/temporal/issues/1251
                // https://github.com/temporalio/temporal/blob/71093d7c5baed10546d1e91608ab814f73c6fdba/docker/auto-setup.sh#L157
                MYSQL_TX_ISOLATION_COMPAT: 'true',
            };

            this.secrets = {
                MYSQL_USER: Secret.fromSecretsManager(database.datastore.secret, 'username'),
                MYSQL_PWD: Secret.fromSecretsManager(database.datastore.secret, 'password'),
            };
        }
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
        numHistoryShards: 8,
        defaultStore: 'default',
        visibilityStore: 'visibility',
        datastores: {
            default: {} as IMySQLConnectionConfig | IPostgresqlConnectionConfig,
            visibility: {} as IMySQLConnectionConfig | IPostgresqlConnectionConfig,
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

interface IMySQLConnectionConfig {
    sql: {
        pluginName: 'mysql';
        driverName: 'mysql';
        databaseName: string;
        connectAddr: string;
        connectProtocol: 'tcp';
        user: string;
        password: string;
        maxConnLifetime: string;
        maxConns: number;
        secretName: string;
    };
}

interface IPostgresqlConnectionConfig {
    sql: {
        pluginName: 'postgres';
        driverName: 'postgres';
        databaseName: string;
        connectAddr: string;
        connectProtocol: 'tcp';
        user: string;
        password: string;
        maxConnLifetime: string;
        maxConns: number;
        secretName: string;
    };
}
