import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { execFileSync } from 'child_process';
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
    execTctlTool(resourceProps, ['--namespace', resourceProps.namespaceName, 'namespace', 'register']);
}

function execTctlTool(context: IResolvedTemporalNamespaceResourceProps, command: string[]) {
    const args = [];
    const env = {};

    args.push('--address', `${context.temporalHost}`);
    args.push('--auto_confirm');

    try {
        execFileSync('/opt/temporal/bin/tctl', [...args, ...command], {
            encoding: 'utf-8',
            env,
            stdio: [
                'ignore', // ignore stdin
                process.stderr, // redirect stdout to stderr
                'inherit', // inherit stderr
            ],
        });
    } catch (e) {
        execFileSync('/opt/temporal/bin/tctl', [...args, ...command], {
            encoding: 'utf-8',
            env,
            stdio: [
                'ignore', // ignore stdin
                process.stderr, // redirect stdout to stderr
                'inherit', // inherit stderr
            ],
        });

        // FIXME: Explicitly check for "Already exists" errors.
        //
        // Error: Register namespace operation failed.
        // Error Details: rpc error: code = AlreadyExists desc = Namespace already exists.
        // ERROR	Invoke Error 	{
        //    "errorType": "Error",
        //    "errorMessage": "Command failed: /opt/temporal/bin/tctl --address xxxx:7233 --auto_confirm --namespace xxxx namespace register",
        //    "status": 1,
        //    "signal": null,
        //    "output": [
        //        null,
        //        null,
        //        null
        //    ],
        //    "pid": 25,
        //    "stdout": null,
        //    "stderr": null,
        //    "stack": [
        //        "Error: Command failed: /opt/temporal/bin/tctl --address xxxx:7233 --auto_confirm --namespace xxxx namespace register",
        //        "    at checkExecSyncError (child_process.js:790:11)",
        //        "    at execFileSync (child_process.js:827:15)",
        //        "    at execTctlTool (/var/task/index.js:2658:36)",
        //        "    at createNamespace (/var/task/index.js:2651:3)",
        //        "    at Runtime.onEvent [as handler] (/var/task/index.js:2618:7)"
        //    ]
        //}
    }
}
