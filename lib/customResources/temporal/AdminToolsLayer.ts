import { Construct } from 'constructs';
import { Code, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { TemporalVersion } from '../..';
import path from 'path';
import { Stack } from 'aws-cdk-lib';

export class AdminToolsLayer extends LayerVersion {
    public static getOrCreate(scope: Construct, temporalVersion: TemporalVersion): AdminToolsLayer {
        const stack = Stack.of(scope);
        const id = `TemporalAdminToolsLayerV${temporalVersion.version}`;
        return (stack.node.tryFindChild(id) as AdminToolsLayer) ?? new AdminToolsLayer(stack, id, temporalVersion);
    }

    private constructor(scope: Construct, id: string, temporalVersion: TemporalVersion) {
        super(scope, id, {
            code: Code.fromDockerBuild(path.resolve(__dirname, 'adminToolsLayer'), {
                buildArgs: {
                    TEMPORAL_ADMIN_TOOLS_IMAGE: temporalVersion.containerImages.temporalAdminTools.image,
                },
            }),
        });
    }
}
