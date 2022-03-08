import { PluginObj, NodePath, PluginPass } from '@babel/core';
import {
    Expression,
    V8IntrinsicIdentifier,
    ObjectExpression,
    objectProperty,
    identifier,
    objectExpression,
    stringLiteral,
    callExpression,
    memberExpression,
} from '@babel/types';

export type WorkflowsTransformFunc = (workflowsPath: string, context: { filename: string }) => string;

interface IPluginArgs {
    readonly workflowsTransform: WorkflowsTransformFunc;
}

export function temporalWorkflowsBundlingBabelPlugin(_babelApi, { workflowsTransform }: IPluginArgs): PluginObj {
    function isReferenceToTemporalFunctionWorkerCreate(path: NodePath<Expression | V8IntrinsicIdentifier>): boolean {
        if (path.isMemberExpression()) {
            const property = path.get('property');

            // Is the property name "create"?
            if (!(property.isIdentifier() && property.node.name === 'create')) return false;

            // Is the object a reference to Temporal's Worker class?
            return isReferenceToTemporalClassWorker(path.get('object'));
        }

        return false;
    }

    function isReferenceToTemporalClassWorker(path: NodePath<Expression>): boolean {
        if (path.isIdentifier()) {
            // Is the object a direct reference to Temporal's Worker class import?
            // This handles the following cases:
            // - import { Worker } from '@temporalio/worker'; Worker.create({...});
            // - import { Worker as Alias } from '@temporalio/worker'; Alias.create({...});
            return path.referencesImport('@temporalio/worker', 'Worker');
        }

        if (path.isMemberExpression()) {
            const object = path.get('object');
            const property = path.get('property');

            // Is the property named Worker?
            if (!(property.isIdentifier() && property.node.name === 'Worker')) return false;

            // Is the object a reference to Temporal's package import?
            // This handles the following cases:
            // - import WorkerPackage from '@temporalio/worker'; WorkerPackage.Worker.create({...});
            // - import * as WorkerPackage from '@temporalio/worker'; WorkerPackage.Worker.create({...});
            return (
                object.referencesImport('@temporalio/worker', '*') ||
                object.referencesImport('@temporalio/worker', 'default')
            );
        }

        return false;
    }

    function handleWorkerCreateCall(workerOptionsPath: NodePath<ObjectExpression>, state: PluginPass) {
        for (const item of workerOptionsPath.get('properties')) {
            if (item.isObjectProperty()) {
                const key = item.get('key');
                const value = item.get('value');

                if (key.isIdentifier() && key.node.name === 'workflowsPath' && value.isExpression()) {
                    const parsedValue = parseWorkflowsPathValue(value);
                    if (parsedValue) {
                        const replacement = workflowsTransform(parsedValue, { filename: state.filename });

                        const replacementProperty = objectProperty(
                            // workflowBundle: { ... }
                            identifier('workflowBundle'),
                            objectExpression([
                                objectProperty(
                                    // path: require.resolve('./FILENAME.js')
                                    identifier('path'),
                                    callExpression(memberExpression(identifier('require'), identifier('resolve')), [
                                        stringLiteral(replacement),
                                    ]),
                                ),
                            ]),
                        );
                        item.replaceWith(replacementProperty);
                    }
                }
            }
        }
    }

    function parseWorkflowsPathValue(workflowsPath: NodePath<Expression>): string {
        if (workflowsPath.isStringLiteral()) return workflowsPath.node.value;
        if (workflowsPath.isCallExpression() && workflowsPath.get('callee').matchesPattern('require.resolve')) {
            const firstArg = workflowsPath.get('arguments')[0];
            if (firstArg.isStringLiteral()) return firstArg.node.value;
        }
        return undefined;
    }

    return <PluginObj>{
        visitor: {
            CallExpression(path, state) {
                if (isReferenceToTemporalFunctionWorkerCreate(path.get('callee'))) {
                    const workerOptionsPath = path.get('arguments')[0];
                    if (workerOptionsPath.isObjectExpression()) {
                        handleWorkerCreateCall(workerOptionsPath, state);
                    }
                }
            },
        },
    };
}
