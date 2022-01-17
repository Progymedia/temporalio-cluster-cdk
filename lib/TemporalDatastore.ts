import { Construct } from 'constructs';
import { Connections, IConnectable, IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import {
    IClusterEngine,
    ServerlessCluster,
    ServerlessClusterProps,
    ServerlessScalingOptions,
} from 'aws-cdk-lib/aws-rds';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { RemovalPolicy } from 'aws-cdk-lib';

export interface ITemporalDatastore extends IConnectable {
    readonly type: 'mysql' | 'postgres' | 'cassandra';
    readonly host: string;
    readonly port: number;
    readonly secret: ISecret;
}

// interface IExistingAuroraServerlessMySqlClusterProps {}

// export function fromExistingAuroraServerlessMySqlCluster(
//     scope: Construct,
//     id: string,
//     props: IExistingAuroraServerlessMySqlClusterProps,
// ) {}

export interface IAuroraServerlessTemporalDatastoreProps {
    readonly engine: IClusterEngine;

    readonly vpc: IVpc;
    readonly vpcSubnets?: SubnetSelection;

    readonly scaling?: ServerlessScalingOptions;

    readonly removalPolicy?: RemovalPolicy;

    readonly otherServerlessClusterProps?: Partial<Omit<ServerlessClusterProps, 'engine' | 'vpc' | 'scaling'>>;
}

export class AuroraServerlessTemporalDatastore extends Construct implements ITemporalDatastore {
    public readonly databaseCluster: ServerlessCluster;
    // public readonly databaseClusterUsageSG?: SecurityGroup;
    // public readonly databaseClusterSecret: ISecret;

    constructor(scope: Construct, id: string, props: IAuroraServerlessTemporalDatastoreProps) {
        super(scope, id);

        this.databaseCluster = new ServerlessCluster(this, 'ServerlessCluster', {
            engine: props.engine,

            vpc: props.vpc,
            vpcSubnets: props.vpcSubnets,

            scaling: {
                ...props.scaling,
            },

            removalPolicy: props.removalPolicy,
            deletionProtection: props.removalPolicy === RemovalPolicy.RETAIN,

            ...props.otherServerlessClusterProps,
        });

        // this.databaseClusterUsageSG = new SecurityGroup(this, 'ServerlessClusterUsageSG', {
        //     vpc: props.vpc,
        // });

        // this.databaseCluster.connections.allowDefaultPortFrom(this.databaseClusterUsageSG);

        // this.databaseClusterSecret = this.databaseCluster.secret;
    }

    public readonly type = 'mysql';

    public get host(): string {
        return this.databaseCluster.clusterEndpoint.hostname;
    }

    public get port(): number {
        return this.databaseCluster.clusterEndpoint.port;
    }

    public get secret(): ISecret {
        return this.databaseCluster.secret;
    }

    public get connections(): Connections {
        return this.databaseCluster.connections;
    }
}
