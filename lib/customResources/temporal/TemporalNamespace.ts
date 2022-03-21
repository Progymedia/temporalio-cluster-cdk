import { CustomResource, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TemporalCluster } from '../..';
import { ITemporalNamespaceResourceProperties } from './TemporalNamespaceHandler';
import { TemporalNamespaceProvider } from './TemporalNamespaceProvider';

export class TemporalNamespace extends Construct {
    public readonly name: string;

    constructor(cluster: TemporalCluster, name: string) {
        super(cluster, `Namespace-${name}`);

        const provider = TemporalNamespaceProvider.getOrCreate(cluster);

        new CustomResource(this, 'Resource', {
            serviceToken: provider,
            resourceType: 'Custom::TemporalNamespace',
            properties: <ITemporalNamespaceResourceProperties>{
                TemporalHost: cluster.host,
                NamespaceName: name,
            },
        });

        this.name = name;
    }
}
