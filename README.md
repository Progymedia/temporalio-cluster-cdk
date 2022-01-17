## Example usage

```
import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { TemporalCluster } from '@progymedia/temporal-cluster-cdk';
import { Vpc } from 'aws-cdk-lib/aws-ec2';

const app = new App();

const stack = new Stack(app, 'MyTemporalClusterStack', {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
});

const vpc = new Vpc(stack, 'Vpc', {
    maxAzs: 2,
});

new TemporalCluster(stack, 'TemporalCluster', {
    vpc,
    removalPolicy: RemovalPolicy.DESTROY,
});

app.synth();
```
