import { Duration, Stack } from 'aws-cdk-lib';
import { IVpc, Port, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { ITemporalDatastore, TemporalCluster, TemporalVersion } from '../..';
import { AdminToolsLayer } from './AdminToolsLayer';
import { ITemporalDatabaseProps } from './TemporalDatabaseResource';

interface ITemporalDatabaseProviderProps {
    readonly temporalVersion: TemporalVersion;
    readonly vpc: IVpc;
    readonly vpcSubnets: SubnetSelection;
}

export class TemporalDatabaseProvider extends Construct {
    /**
     * We create a single instance of this provider by VPC and Temporal Version pair, at the stack level.
     * Privileges for that single instance's lambda function are then expanded to include network access
     * to each datastore and temporal frontend nodes, as well as read access to each datastore access secrets.
     */
    public static getOrCreate(
        scope: Construct,
        props: ITemporalDatabaseProviderProps,
        databaseProps: ITemporalDatabaseProps,
    ) {
        const stack = Stack.of(scope);
        // const id = `CustomResource-TemporalDatabaseProvider-${
        //     props.vpc.node.addr
        // }-${props.temporalVersion.version.replace(/[.]/g, '_')}`;
        const id = 'CustomResource-TemporalDatabaseProvider';
        const x =
            (stack.node.tryFindChild(id) as TemporalDatabaseProvider) ?? new TemporalDatabaseProvider(stack, id, props);

        x.expandPrivilegesToDatastore(databaseProps.datastore);

        return x.provider.serviceToken;
    }

    private readonly provider: Provider;
    private readonly lambdaFunction: NodejsFunction;

    constructor(scope: Construct, id: string, props: ITemporalDatabaseProviderProps) {
        super(scope, id);

        this.node.addDependency(props.vpc);

        this.lambdaFunction = new NodejsFunction(this, 'OnEventHandler', {
            entry: require.resolve('./TemporalDatabaseHandler'),
            runtime: Runtime.NODEJS_14_X,
            handler: 'onEvent',
            vpc: props.vpc,
            vpcSubnets: props.vpcSubnets,
            layers: [AdminToolsLayer.getOrCreate(this, props.temporalVersion)],
            timeout: Duration.minutes(5),
        });

        this.provider = new Provider(this, 'Provider', {
            onEventHandler: this.lambdaFunction,
            logRetention: RetentionDays.FIVE_DAYS,
        });
    }

    expandPrivilegesToDatastore(datastore: ITemporalDatastore) {
        datastore.connections.allowDefaultPortFrom(this.lambdaFunction);
        datastore.secret.grantRead(this.lambdaFunction);
    }

    expandPrivilegesToTemporalCluster(temporalCluster: TemporalCluster) {
        // FIXME: Make this cleaner and do not require that we provide the port number
        temporalCluster.services.frontend.fargateService.connections.allowFrom(this.lambdaFunction, Port.tcp(7233));
    }
}
