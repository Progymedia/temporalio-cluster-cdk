import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { execFileSync } from 'child_process';
import waitPort from 'wait-port';
import { SecretsManager } from 'aws-sdk';

const SecretsManagerClient = new SecretsManager({});

export interface ITemporalDatabaseResourceProperties {
    readonly DatastorePlugin: 'mysql' | 'postgres' | 'cassandra' | 'elasticsearch';
    readonly DatastoreHost: string;
    readonly DatastorePort: string;
    readonly DatastoreSecretId: string;
    readonly DatabaseName: string;
    readonly SchemaType: 'main' | 'visibility';

    // TemporalVersion is not actually used by this lambda. Database schema
    // versions are not related to temporal software versions. Still, Temporal
    // version is required in order to ensure that the resource gets updated
    // whenever the version of Temporal changes. This is how we get the
    // opportunity to update database schemas.
    readonly TemporalVersion: string;
}

export interface IResolvedTemporalDatabaseResourceProps {
    readonly datastorePlugin: 'mysql' | 'postgres' | 'cassandra' | 'elasticsearch';
    readonly datastoreHost: string;
    readonly datastorePort: number;
    readonly datastoreUser: string;
    readonly datastorePassword: string;
    readonly databaseName: string;
    readonly schemaType: 'main' | 'visibility';
    readonly temporalVersion: string;
    readonly resourcePhysicalId: string;
}

export async function onEvent(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
    const resourceProps = await extractResourceProperties(event);

    switch (event.RequestType) {
        case 'Create':
        case 'Update':
            waitForDatabase(resourceProps);
            createDatabase(resourceProps);
            upgradeDatabase(resourceProps);
            return {
                PhysicalResourceId: resourceProps.resourcePhysicalId,
            };

        case 'Delete': {
            waitForDatabase(resourceProps);
            dropDatabase(resourceProps);
            return {
                PhysicalResourceId: resourceProps.resourcePhysicalId,
            };
        }
    }
}

async function extractResourceProperties(
    event: CdkCustomResourceEvent,
): Promise<IResolvedTemporalDatabaseResourceProps> {
    const inputProps = event.ResourceProperties as unknown as ITemporalDatabaseResourceProperties;

    if (!inputProps.DatastorePlugin) throw new Error('"DatastorePlugin" is required');
    if (!['mysql', 'postgres', 'cassandra', 'elasticsearch'].includes(inputProps.DatastorePlugin))
        throw new Error('"DatastorePlugin" value bust be one of "mysql", "postgres", "cassandra" or "elasticsearch"');

    if (!inputProps.DatastoreHost) throw new Error('"DatastoreHost" is required');

    if (!inputProps.DatastorePort) throw new Error('"DatastorePort" is required');
    if (!inputProps.DatastorePort.match(/^[1-9][0-9]+$/)) throw new Error('"DatastorePort" must be a number');

    if (!inputProps.DatastoreSecretId) throw new Error('"DatastoreSecretId" is required');

    if (!inputProps.DatabaseName) throw new Error('"DatabaseName" is required');

    if (!inputProps.SchemaType) throw new Error('"SchemaType" is required');
    if (!['main', 'visibility'].includes(inputProps.SchemaType))
        throw new Error('"SchemaType" must be either "main" or "visibility"');

    if (!inputProps.TemporalVersion) throw new Error('"TemporalVersion" is required');

    const datastoreSecret = await SecretsManagerClient.getSecretValue({
        SecretId: inputProps.DatastoreSecretId,
    }).promise();
    const datastoreSecretObject = JSON.parse(datastoreSecret.SecretString);

    const resourcePhysicalId = `${inputProps.DatastorePlugin}://${inputProps.DatastoreHost}:${inputProps.DatastorePort}/${inputProps.DatabaseName}`;

    return {
        datastorePlugin: inputProps.DatastorePlugin,
        datastoreHost: inputProps.DatastoreHost,
        datastorePort: parseInt(inputProps.DatastorePort),
        datastoreUser: datastoreSecretObject.username,
        datastorePassword: datastoreSecretObject.password,
        databaseName: inputProps.DatabaseName,
        schemaType: inputProps.SchemaType,
        temporalVersion: inputProps.TemporalVersion,
        resourcePhysicalId,
    };
}

function waitForDatabase(resourceProps: IResolvedTemporalDatabaseResourceProps) {
    waitPort({
        host: resourceProps.datastoreHost,
        port: resourceProps.datastorePort,
    });
}

function createDatabase(resourceProps: IResolvedTemporalDatabaseResourceProps) {
    switch (resourceProps.datastorePlugin) {
        case 'mysql':
        case 'postgres':
            execTemporalSqlTool(resourceProps, ['create-database', '--database', resourceProps.databaseName]);
            execTemporalSqlTool(resourceProps, ['setup-schema', '-v', '0.0']);
            break;

        case 'cassandra':
            throw new Error('createDatabase(cassandra) is not yet implemented');

        case 'elasticsearch':
            throw new Error('createDatabase(elasticsearch) is not yet implemented');
    }
}

function upgradeDatabase(resourceProps: IResolvedTemporalDatabaseResourceProps) {
    const type = resourceProps.schemaType === 'main' ? 'temporal' : 'visibility';
    switch (resourceProps.datastorePlugin) {
        case 'mysql': {
            const schemaDir = `/opt/temporal/schema/mysql/v57/${type}/versioned`;
            execTemporalSqlTool(resourceProps, ['update-schema', '-d', schemaDir]);
            break;
        }

        case 'postgres': {
            const schemaDir = `/opt/temporal/schema/postgresql/v96/${type}/versioned`;
            execTemporalSqlTool(resourceProps, ['update-schema', '-d', schemaDir]);
            break;
        }

        case 'cassandra': {
            // const schemaDir = `/opt/temporal/schema/cassandra/${type}/versioned`;
            throw new Error('upgradeDatabase(cassandra) is not yet implemented');
        }

        case 'elasticsearch': {
            // const schemaDir = `/opt/temporal/schema/elasticsearch/visibility/versioned`;
            throw new Error('upgradeDatabase(elasticsearch) is not yet implemented');
        }
    }
}

function dropDatabase(resourceProps: IResolvedTemporalDatabaseResourceProps) {
    switch (resourceProps.datastorePlugin) {
        case 'mysql':
        case 'postgres':
            execTemporalSqlTool(resourceProps, ['drop-database', '--database', resourceProps.databaseName, '--force']);
            break;

        case 'cassandra':
            throw new Error('dropDatabase(cassandra) is not yet implemented');

        case 'elasticsearch':
            throw new Error('dropDatabase(elasticsearch) is not yet implemented');
    }
}

function execTemporalSqlTool(context: IResolvedTemporalDatabaseResourceProps, command: string[]) {
    const args = [];
    const env = {};

    args.push('--endpoint', context.datastoreHost);
    args.push('--port', `${context.datastorePort}`);
    args.push('--user', context.datastoreUser);
    env['SQL_PASSWORD'] = context.datastorePassword;
    args.push('--database', context.databaseName);

    // Tx Attributes
    if (context.datastorePlugin === 'mysql') {
        args.push('--connect-attributes', 'tx_isolation=READ-COMMITTED');
    }

    execFileSync('/opt/temporal/bin/temporal-sql-tool', [...args, ...command], {
        encoding: 'utf-8',
        env,
        stdio: [
            'ignore', // ignore stdin
            process.stderr, // redirect stdout to stderr
            'inherit', // inherit stderr
        ],
    });
}
