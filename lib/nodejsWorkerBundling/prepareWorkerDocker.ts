#!/usr/bin/env node
import { NodejsWorkerBundler } from './NodejsWorkerBundler';
import FileSystem from 'fs';
import Path from 'path';
import { exit } from 'process';
import nopt from 'nopt';

interface IPrepareWorkerDockerOpts {
    entrypointPath: string;
    targetPath: string;
    externals: (string | RegExp)[];
}

export async function prepareNodejsWorkerDocker(options: IPrepareWorkerDockerOpts): Promise<void> {
    FileSystem.mkdirSync(Path.dirname(options.targetPath), { recursive: true });
    const tmpTargetPath = FileSystem.mkdtempSync(options.targetPath);

    try {
        await new NodejsWorkerBundler({
            entrypointPath: options.entrypointPath,
            targetPath: `${tmpTargetPath}/main.js`,
            externals: options.externals,
        }).bundle();

        FileSystem.copyFileSync(`${__dirname}/Dockerfile`, `${tmpTargetPath}/Dockerfile`);

        FileSystem.rmSync(options.targetPath, { recursive: true, force: true });
        FileSystem.renameSync(tmpTargetPath, options.targetPath);
    } finally {
        try {
            FileSystem.rmSync(tmpTargetPath, { recursive: true, force: true });
        } catch {
            // Ignore cleaning up errors as it would shadow the initial error, if any
        }
    }
}

function parseCli(): IPrepareWorkerDockerOpts {
    const knownOpts = {
        external: [String, Array],
    };
    const parsedOpts = nopt(knownOpts);

    if (parsedOpts.argv.remain.length !== 2) {
        console.error(`Error: expected exactly 2 arguments`);
        process.exit(1);
    }

    const entrypointPath: string = Path.resolve(process.cwd(), parsedOpts.argv.remain[0]);
    const targetPath: string = Path.resolve(process.cwd(), parsedOpts.argv.remain[1]);

    const externalsRaw: string[] = parsedOpts['external'] ?? [];
    const externals = externalsRaw.map(toStringOrRegExp);

    if (!isExistingFile(entrypointPath)) {
        console.error(`Error: no such file: '${entrypointPath}'`);
        process.exit(1);
    }

    return {
        entrypointPath,
        targetPath,
        externals,
    };
}

function toStringOrRegExp(s: string) {
    const matches = s.match(/^[/](.+)[/](i?)$/);
    if (matches) return new RegExp(matches[1], matches[2]);
    else return s;
}

function isExistingFile(file: string): boolean {
    try {
        return FileSystem.statSync(file).isFile();
    } catch {
        return false;
    }
}

prepareNodejsWorkerDocker(parseCli())
    .then(() => {
        console.log(`Done preparing Temporal worker's Docker directory`);
        exit(0);
    })
    .catch((e: unknown) => {
        console.error(`Failed to prepare Temporal worker's Docker directory`);
        console.error(e);

        exit(1);
    });
