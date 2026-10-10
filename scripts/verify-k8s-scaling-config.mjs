import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { validateLocalScaling } from './local-scaling.mjs';

const objects = YAML.parseAllDocuments(await readFile('infra/k8s/local/scaling.yaml', 'utf8')).map(document => document.toJSON());
validateLocalScaling(objects);
for (const mutate of [
  list => { list[1].spec.maxReplicaCount = 100; },
  list => { list[1].spec.minReplicaCount = 0; },
  list => { list[1].spec.scaleTargetRef.name = 'kinetiq-api'; },
  list => { list[1].spec.triggers[0].metadata.awsEndpoint = 'https://sqs.us-east-1.amazonaws.com'; },
  list => { list[1].spec.triggers[0].metadata.queueURL = 'https://sqs.us-east-1.amazonaws.com/000000000000/other'; },
  list => { list[0].spec.secretTargetRef[0].name = 'real-aws-credentials'; },
  list => { list[1].metadata.namespace = 'production'; },
]) {
  const unsafe = structuredClone(objects); mutate(unsafe);
  assert.throws(() => validateLocalScaling(unsafe));
}
console.log('Local scaling configuration and seven unsafe-change regressions passed.');
