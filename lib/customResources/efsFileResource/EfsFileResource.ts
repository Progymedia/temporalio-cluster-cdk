import { Construct } from 'constructs';
import { CustomResource } from 'aws-cdk-lib';
import { FileSystem } from 'aws-cdk-lib/aws-efs';
import { IEfsFileResourceProperties } from './EfsFileHandler';
import { IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { normalize } from 'path/posix';
import { EfsFileProvider } from './EfsFileProvider';

interface IEfsFileProps {
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
    constructor(scope: Construct, id: string, props: IEfsFileProps) {
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
            properties: <IEfsFileResourceProperties>{
                FileSystemId: props.fileSystem.fileSystemId,
                Contents: props.contents,
                Path: props.path,
            },
        });

        // FIXME: Determine if there is a need for any output attribute
    }
}
