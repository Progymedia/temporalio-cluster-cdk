import { dirname, join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';

export interface IEfsFileResourceProperties {
    readonly FileSystemId: string;
    readonly Path: string;
    readonly Contents: string;
}

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
    const properties = event.ResourceProperties as unknown as IEfsFileResourceProperties;

    if (!properties.FileSystemId) throw new Error('"FileSystemId" is required');
    if (!properties.Contents) throw new Error('"Contents" is required');
    if (!properties.Path) throw new Error('"Path" is required');

    // FIXME: Not sure about encoding...
    console.log(`Writing to file efs://${properties.FileSystemId}/${properties.Path}`);
    mkdirSync(dirname(toLocalPath(properties.Path)), { recursive: true });
    writeFileSync(toLocalPath(properties.Path), properties.Contents, { encoding: 'utf-8' });

    return {
        PhysicalResourceId: `efs://${properties.FileSystemId}/${properties.Path}`,
    };
}

export async function deleteObject(event: CdkCustomResourceEvent) {
    const properties = event.ResourceProperties as unknown as IEfsFileResourceProperties;

    if (!properties.FileSystemId) throw new Error('"FileSystemId" is required');
    if (!properties.Contents) throw new Error('"Contents" is required');
    if (!properties.Path) throw new Error('"Path" is required');

    console.log(`Deleting file efs://${properties.FileSystemId}/${properties.Path}`);
    rmSync(toLocalPath(properties.Path), { force: true });

    return {
        PhysicalResourceId: `efs://${properties.FileSystemId}/${properties.Path}`,
    };
}

function toLocalPath(path: string) {
    return join('/mnt', path);
}
