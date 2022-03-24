import { CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TemporalCluster } from '../..';
import { ITemporalNamespaceResourceProperties } from './TemporalNamespaceHandler';
import { TemporalNamespaceProvider } from './TemporalNamespaceProvider';

export class TemporalNamespace extends Construct {
    public readonly name: string;

    constructor(cluster: TemporalCluster, name: string) {
        super(cluster, `Namespace-${name}`);

        const provider = TemporalNamespaceProvider.getOrCreate(cluster);

        const resource = new CustomResource(this, 'Resource', {
            serviceToken: provider,
            resourceType: 'Custom::TemporalNamespace',
            properties: <ITemporalNamespaceResourceProperties>{
                TemporalHost: cluster.host,
                NamespaceName: name,
            },
        });
        resource.node.addDependency(cluster.services.frontend.fargateService);

        this.name = name;
    }
}
