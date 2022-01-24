import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Stack } from 'aws-cdk-lib';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

interface IEfsFileProviderProps {
    readonly vpc: IVpc;
    readonly vpcSubnets: SubnetSelection;
    readonly fileSystem: FileSystem;
    readonly rootDir: string;
}

export class EfsFileProvider extends Construct {
    /**
     * Returns the singleton provider corresponding to the given vpc and file system.
     */
    public static getOrCreate(scope: Construct, props: IEfsFileProviderProps) {
        const id = `CustomResource-EfsFileProvider-${props.vpc.node.addr}-${
            props.fileSystem.node.addr
        }-${props.rootDir.slice(1)}`;
        const stack = Stack.of(scope);
        const x = (stack.node.tryFindChild(id) as EfsFileProvider) || new EfsFileProvider(stack, id, props);
        return x.provider.serviceToken;
    }

    private readonly provider: Provider;

    constructor(scope: Construct, id: string, props: IEfsFileProviderProps) {
        super(scope, id);

        this.node.addDependency(props.vpc);

        // https://github.com/aws/aws-cdk/blob/621a410471fcda0e388a7a53bb0e3cdb77be759c/packages/%40aws-cdk/aws-s3-deployment/lib/bucket-deployment.ts#L260
        const accessPoint = props.fileSystem.addAccessPoint('AccessPoint', {
            path: props.rootDir,
            createAcl: {
                ownerUid: '1001',
                ownerGid: '1001',
                permissions: '0777',
            },
            posixUser: {
                uid: '1001',
                gid: '1001',
            },
        });

        const lambdaFunction = new NodejsFunction(this, 'OnEventHandler', {
            entry: require.resolve('./EfsFileHandler'),
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'onEvent',
            vpc: props.vpc,
            vpcSubnets: props.vpcSubnets,
            filesystem: lambda.FileSystem.fromEfsAccessPoint(accessPoint, `/mnt${props.rootDir}`),
        });

        this.provider = new Provider(this, 'Provider', {
            onEventHandler: lambdaFunction,
            logRetention: RetentionDays.FIVE_DAYS,
        });
    }
}
