import { CustomResource, RemovalPolicy, Token } from 'aws-cdk-lib';
import { IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { ITemporalDatastore, TemporalCluster } from '../..';
import { ITemporalDatabaseResourceProperties } from './TemporalDatabaseHandler';
import { TemporalDatabaseProvider } from './TemporalDatabaseProvider';

export interface ITemporalDatabaseProps {
    readonly temporalCluster: TemporalCluster;
    readonly datastore: ITemporalDatastore;
    readonly vpc: IVpc;
    readonly vpcSubnets?: SubnetSelection;
    readonly databaseName: string;
    readonly schemaType: 'main' | 'visibility';
    readonly removalPolicy?: RemovalPolicy;
}

// Represents a Temporal schema
export class TemporalDatabase extends Construct {
    public readonly datastore: ITemporalDatastore;
    public readonly databaseName: string;
    public readonly schemaType: 'main' | 'visibility';

    constructor(scope: Construct, id: string, props: ITemporalDatabaseProps) {
        super(scope, id);

        const provider = TemporalDatabaseProvider.getOrCreate(
            scope,
            {
                temporalVersion: props.temporalCluster.temporalVersion,
                vpc: props.vpc,
                vpcSubnets: props.vpcSubnets,
            },
            props,
        );

        new CustomResource(this, 'Resource', {
            serviceToken: provider,
            resourceType: 'Custom::TemporalSchema',
            properties: <ITemporalDatabaseResourceProperties>{
                DatastorePlugin: props.datastore.plugin,
                DatastoreHost: props.datastore.host,
                DatastorePort: Token.asString(props.datastore.port),
                DatastoreSecretId: props.datastore.secret.secretName,
                SchemaType: props.schemaType,
                DatabaseName: props.databaseName,
                TemporalVersion: props.temporalCluster.temporalVersion.version,
            },
            removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
        });

        this.datastore = props.datastore;
        this.databaseName = props.databaseName;
        this.schemaType = props.schemaType;
    }
}
