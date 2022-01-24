CDK constructs to setup a Temporal cluster on ECS Fargate.

Note: this is currently a work in progress. At this point, I consider it as a proof-of-concept. However, I believe that, once completed, these constructs will provide a reasonable method for Temporal cluster setup in AWS/CDK environements and applications.

# Features

## Current features

-   Setup a Temporal cluster on ECS Fargate
-   Use distinct containers for each Temporal server roles (frontend, history, matching, worker)
-   Specify the size of containers (can be specified specifically for each server role, or as default values)
-   Register frontend containers to a CloudMap namespace
-   By default, create an Aurora serverless (MySQL compatible) data store
-   Possibility of specifying Temporal software version, as well as modifying address of docker images (either to use a less restrictive docker registry, or to use customized build images)
-   Use an EFS file system to store and share Temporal's dynamic_config.yaml file among all server nodes
-   Automatically creates and upgrade the 'temporal' and 'visibility' schemas at launch time, if appropriate, without using the auto_setup container
-   Optionnaly launch the Temporal web UI

## Missing features

-   Automatically creates the default Temporal namespace at launch
-   Allow configuring distinct datastores for 'temporal' and 'visibility' schemas (notably, using ElasticSearch for 'visiblity')
-   Make it possible to easily configure the cluster as a single node cluster (that is, one container executing all roles). That would be useful for development in situations where the Temporal cluster is part of the application deployment
-   Configuration of auto-scalling
-   Propertly generate the configuration file
-   Register the Temporal web UI nodes to CloudMap
-   ...

# Example usage

Note that default machine specs are intentionnaly small; also, in the following examples, removal policy is intentionnaly set to DESTROY. This is appropriate for tests and development purpose. In production, you should size up your containers appropriately and would most likely want to set removal policy to RETAIN (well, at least on your datastore).

## Simple example

```
import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { TemporalCluster } from '@progymedia/temporal-cluster-cdk';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';

const app = new App();

const stack = new Stack(app, 'MyTemporalClusterStack', {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
});

const vpc = new Vpc(stack, 'Vpc', {
    maxAzs: 2,
    natGateways: 1,
});

const cloudMapNamespace = new PrivateDnsNamespace(stack, 'CloudMapNamespace', {
    name: 'privatesvc',
    vpc: vpc,
});

new TemporalCluster(stack, 'TemporalCluster', {
    vpc,
    cloudMapRegistration: {
        namespace: cloudMapNamespace,
        serviceName: 'temporal',
    },
    removalPolicy: RemovalPolicy.DESTROY,
});

app.synth();
```

## Going farther

### Specifying Temporal version

```
new TemporalCluster(stack, 'TemporalCluster', {
    ...
    temporalVersion: TemporalVersion.V1_14_1
    ...
}
```

### Alternative or customized docker images

```
new TemporalCluster(stack, 'TemporalCluster', {
    ...
    temporalVersion: TemporalVersion.V1_14_3.withCustomizations({ repositoryBase: 'public.ecr.aws/123456789/' }),
    ...
}
```

### Use an existing ECS cluster

```
const ecsCluster = new Cluster(stack, 'EcsCluster', {
    vpc: vpc,
    enableFargateCapacityProviders: true,
    containerInsights: true,
});

new TemporalCluster(stack, 'TemporalCluster', {
    ...
    ecsCluster
    ...
}
```

### Taking control of the datastore

```
const datastore = new AuroraServerlessTemporalDatastore(stack, 'Datastore', {
    engine: DatabaseClusterEngine.auroraMysql({ version: AuroraMysqlEngineVersion.VER_2_10_1 }),
    vpc,
    removalPolicy: RemovalPolicy.DESTROY,
});

new TemporalCluster(stack, 'TemporalCluster', {
    ...
    datastore,
    ...
}
```

# License

The MIT License

Copyright (c) 2022 Progymedia Inc. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
