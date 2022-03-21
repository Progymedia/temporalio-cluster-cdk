import { Construct } from 'constructs';
import { AssetHashType, AssetStaging, DockerImage } from 'aws-cdk-lib';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { spawnSync } from 'child_process';
import Path from 'path';

export interface ITemporalNodejsWorkerImageProps {
    readonly entrypoint: string;
    readonly externals?: (string | RegExp)[];
}

// FIXME: This is not working properly at this point.
//
// AssetStaging will "skip" when running 'cdk ls' or 'cdk destroy', causing a failure on
// DockerImageAsset because the specified input directory does not contain a Dockerfile.
// Also, how to properly determine assetHash, given the fact that we expect most of the
// code being bundled to be elsewhere in the project (outside of entrypoint's directory)?
// At this point, using this class is not recommanded.
export class TemporalNodejsWorkerImage extends Construct {
    public readonly dockerImageAsset: DockerImageAsset;

    constructor(scope: Construct, id: string, props: ITemporalNodejsWorkerImageProps) {
        super(scope, id);

        const staging = new AssetStaging(this, 'Staging', {
            sourcePath: Path.dirname(props.entrypoint),
            assetHashType: AssetHashType.OUTPUT,
            extraHash: `${Math.random()}`, // FIXME: How can we properly compute assetHash based on the entrypoint+its dependency?

            bundling: {
                local: {
                    tryBundle: (outputDir) => {
                        // Staging directory containing files of the worker bundle
                        const nodeJsCmd = process.execPath;
                        const nodeJsArgs = process.execArgv; // FIXME: Remove `-e ...` or `--eval ...` sequences to prevent fork bomb

                        const prepareWorkerDockerDirCmd = require.resolve('./nodejsWorkerBundling/prepareWorkerDocker');

                        const args: string[] = [
                            `${props.entrypoint}`,
                            outputDir,
                            ...(props.externals ?? []).map(encodeStringOrRegExp),
                        ];

                        spawnSync(nodeJsCmd, [...nodeJsArgs, prepareWorkerDockerDirCmd, ...args], {
                            stdio: [
                                'ignore', // ignore stdin
                                process.stderr, // redirect stdout to stderr
                                'inherit', // inherit stderr
                            ],
                        });

                        return true;
                    },
                },
                image: DockerImage.fromRegistry('dummy'),
            },
        });

        this.dockerImageAsset = new DockerImageAsset(this, 'ImageAsset', {
            directory: staging.absoluteStagedPath,
            buildArgs: {
                BUILD_IMAGE: `node:16-bullseye-slim`,
                RUNTIME_IMAGE: `gcr.io/distroless/nodejs:16`,
            },
        });
    }
}

function encodeStringOrRegExp(x: string | RegExp) {
    if (typeof x === 'string') return x;
    if (x instanceof RegExp) return `/${x.source}/${x.flags.includes('i') ? 'i' : ''}`;
    throw new Error('Expected argument to be either a string or a RegExp');
}
