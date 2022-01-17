import { dirname, join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';

export const PROP_FILESYSTEM_ID = 'FileSystemId';
export const PROP_CONTENTS = 'Contents';
export const PROP_PATH = 'Path';

export async function onEvent(event: CdkCustomResourceEvent) {
    switch (event.RequestType) {
        case 'Create':
        case 'Update':
            return putObject(event);

        case 'Delete':
            return deleteObject(event);
    }
}

export async function putObject(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
    const fileSystemId = event.ResourceProperties[PROP_FILESYSTEM_ID];
    if (!fileSystemId) {
        throw new Error('"FileSystemId" is required');
    }

    const contents = event.ResourceProperties[PROP_CONTENTS];
    if (!contents) {
        throw new Error('"Contents" is required');
    }

    const path = event.ResourceProperties[PROP_PATH];
    if (!path) {
        throw new Error('"Path" is required');
    }

    // FIXME: Not sure about encoding...
    console.log(`Writing to file efs://${fileSystemId}/${path}`);
    mkdirSync(dirname(toLocalPath(path)), { recursive: true });
    writeFileSync(toLocalPath(path), contents, { encoding: 'utf-8' });

    return {
        PhysicalResourceId: `efs://${fileSystemId}/${path}`,
    };
}

export async function deleteObject(event: CdkCustomResourceEvent) {
    const fileSystemId = event.ResourceProperties[PROP_FILESYSTEM_ID];
    if (!fileSystemId) {
        throw new Error('"FileSystemId" is required');
    }

    const path = event.ResourceProperties[PROP_PATH];
    if (!path) {
        throw new Error('"Path" is required');
    }

    console.log(`Deleting file efs://${fileSystemId}/${path}`);
    rmSync(toLocalPath(path), { force: true });

    return {
        PhysicalResourceId: `efs://${fileSystemId}/${path}`,
    };
}

function toLocalPath(path: string) {
    return join('/mnt', path);
}
