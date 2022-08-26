import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { execFileSync, SpawnSyncReturns } from 'child_process';
import waitPort from 'wait-port';

export interface ITemporalNamespaceResourceProperties {
    readonly TemporalHost: string;
    readonly NamespaceName: string;
}

export interface IResolvedTemporalNamespaceResourceProps {
    readonly temporalHost: string;
    readonly namespaceName: string;
    readonly resourcePhysicalId: string;
}

export async function onEvent(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
    const resourceProps = await extractResourceProperties(event);

    switch (event.RequestType) {
        case 'Create':
        case 'Update':
            waitForTemporal(resourceProps);
            createNamespace(resourceProps);
            return {
                PhysicalResourceId: resourceProps.resourcePhysicalId,
            };

        case 'Delete': {
            // FIXME: Deleting a namespace is not yet supported - https://github.com/temporalio/temporal/issues/1679
            return {
                PhysicalResourceId: resourceProps.resourcePhysicalId,
            };
        }
    }
}

async function extractResourceProperties(
    event: CdkCustomResourceEvent,
): Promise<IResolvedTemporalNamespaceResourceProps> {
    const inputProps = event.ResourceProperties as unknown as ITemporalNamespaceResourceProperties;

    if (!inputProps.TemporalHost) throw new Error('"TemporalHost" is required');

    if (!inputProps.NamespaceName) throw new Error('"NamespaceName" is required');

    const resourcePhysicalId = `${inputProps.TemporalHost}://${inputProps.NamespaceName}`;

    return {
        temporalHost: inputProps.TemporalHost,
        namespaceName: inputProps.NamespaceName,
        resourcePhysicalId,
    };
}

function waitForTemporal(resourceProps: IResolvedTemporalNamespaceResourceProps) {
    const [host, port] = resourceProps.temporalHost.split(':');

    waitPort({
        host: host,
        port: parseInt(port),
    });
}

function createNamespace(resourceProps: IResolvedTemporalNamespaceResourceProps) {
    try {
        execTctlTool(resourceProps, ['--namespace', resourceProps.namespaceName, 'namespace', 'register']);
    } catch (e) {
        if ((e as SpawnSyncReturns<string>).stderr.includes('AlreadyExists')) {
            return;
        }

        console.error(`Failed to create namespace '${resourceProps.namespaceName}'`);
        console.error(e);
        process.exit(1);
    }
}

function execTctlTool(context: IResolvedTemporalNamespaceResourceProps, command: string[]) {
    const args = [];
    const env = {
        HOME: '/tmp',
    };

    args.push('--address', `${context.temporalHost}`);
    args.push('--auto_confirm');

    execFileSync('/opt/temporal/bin/tctl', [...args, ...command], {
        encoding: 'utf-8',
        env,
    });
}
