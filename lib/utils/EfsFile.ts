import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { CustomResource, Stack } from 'aws-cdk-lib';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { PROP_CONTENTS, PROP_FILESYSTEM_ID, PROP_PATH } from './efs-file-handler';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { normalize } from 'path';

interface EfsFileProps {
    /**
     * The VPC network to place the deployment lambda handler in.
     */
    readonly vpc: IVpc;

    /**
     * Where in the VPC to place the deployment lambda handler.
     *
     * @default - the Vpc default strategy if not specified
     */
    readonly vpcSubnets?: SubnetSelection;

    /**
     * The EFS file system in which the file will be created.
     */
    readonly fileSystem: FileSystem;

    /**
     * The full path to the file.
     */
    readonly path: string;

    /**
     * The contents of the file.
     */
    readonly contents: string;
}

export class EfsFile extends Construct {
    constructor(scope: Construct, id: string, props: EfsFileProps) {
        super(scope, id);

        const normalizedPath = normalize(props.path);
        const [, rootDir] = normalizedPath.match(/^([/][^/]+)[/].*[^/]$/);
        if (!rootDir)
            throw new Error(
                'Path must be absolute, must point to a file, and must have at least one intermediate directory',
            );

        // Making the VPC dependent on EfsFile is required to avoid potential CFN stack deletion
        // issues. Refer to https://github.com/aws/aws-cdk/pull/15220 for explanations.
        this.node.addDependency(props.vpc);

        new CustomResource(this, 'Resource', {
            serviceToken: EfsFileProvider.getOrCreate(this, {
                vpc: props.vpc,
                vpcSubnets: props.vpcSubnets,
                fileSystem: props.fileSystem,
                rootDir: rootDir,
            }),
            resourceType: 'Custom::EfsFile',
            properties: {
                [PROP_FILESYSTEM_ID]: props.fileSystem.fileSystemId,
                [PROP_CONTENTS]: props.contents,
                [PROP_PATH]: props.path,
            },
        });

        // FIXME: Determine if there is a need for any output attribute
    }
}

interface IEfsFileProviderProps {
    vpc: IVpc;
    vpcSubnets: SubnetSelection;
    fileSystem: FileSystem;
    rootDir: string;
}

class EfsFileProvider extends Construct {
    /**
     * Returns the singleton provider corresponding to the given file system.
     */
    public static getOrCreate(scope: Construct, props: IEfsFileProviderProps) {
        const stack = Stack.of(scope);
        const id = `CustomResource-EfsFileProvider-${props.vpc.node.addr}-${props.fileSystem.node.addr}`;
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
            entry: require.resolve('./efs-file-handler/index'),
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
