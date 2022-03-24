import { CustomResource, RemovalPolicy, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ITemporalDatastore, TemporalCluster } from '../..';
import { ITemporalDatabaseResourceProperties } from './TemporalDatabaseHandler';
import { TemporalDatabaseProvider } from './TemporalDatabaseProvider';

export interface ITemporalDatabaseProps {
    readonly datastore: ITemporalDatastore;
    readonly databaseName: string;
    readonly schemaType: 'main' | 'visibility';
    readonly removalPolicy?: RemovalPolicy;
}

// Represents a Temporal schema
export class TemporalDatabase extends Construct {
    public readonly datastore: ITemporalDatastore;
    public readonly databaseName: string;
    public readonly schemaType: 'main' | 'visibility';

    constructor(cluster: TemporalCluster, id: string, props: ITemporalDatabaseProps) {
        super(cluster, id);

        const provider = TemporalDatabaseProvider.getOrCreate(cluster, props.datastore);

        const resource = new CustomResource(this, 'Resource', {
            serviceToken: provider,
            resourceType: 'Custom::TemporalSchema',
            properties: <ITemporalDatabaseResourceProperties>{
                DatastorePlugin: props.datastore.plugin,
                DatastoreHost: props.datastore.host,
                DatastorePort: Token.asString(props.datastore.port),
                DatastoreSecretId: props.datastore.secret.secretName,
                SchemaType: props.schemaType,
                DatabaseName: props.databaseName,
                TemporalVersion: cluster.temporalVersion.version,
            },
            removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
        });
        resource.node.addDependency(props.datastore);

        this.datastore = props.datastore;
        this.databaseName = props.databaseName;
        this.schemaType = props.schemaType;
    }
}
