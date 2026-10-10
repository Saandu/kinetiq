import assert from 'node:assert/strict';

export function validateLocalScaling(objects) {
  assert.equal(objects.length, 2);
  assert.ok(objects.every(object => object.apiVersion === 'keda.sh/v1alpha1' && object.metadata.namespace === 'kinetiq-local'));
  const auth = objects.find(object => object.kind === 'TriggerAuthentication');
  const scaled = objects.find(object => object.kind === 'ScaledObject');
  assert.equal(auth.metadata.name, 'kinetiq-sqs-local');
  assert.deepEqual(auth.spec.secretTargetRef, [
    {parameter: 'awsAccessKeyID', name: 'kinetiq-keda-local', key: 'accessKey'},
    {parameter: 'awsSecretAccessKey', name: 'kinetiq-keda-local', key: 'secretKey'},
  ]);
  assert.equal(scaled.metadata.name, 'kinetiq-ingest');
  assert.deepEqual(scaled.spec.scaleTargetRef, {name: 'kinetiq-ingest'});
  assert.equal(scaled.spec.minReplicaCount, 1); assert.equal(scaled.spec.maxReplicaCount, 3);
  assert.equal(scaled.spec.triggers.length, 1);
  const trigger = scaled.spec.triggers[0];
  assert.equal(trigger.type, 'aws-sqs-queue');
  assert.deepEqual(trigger.authenticationRef, {name: 'kinetiq-sqs-local'});
  assert.deepEqual(trigger.metadata, {awsRegion: 'us-east-1', awsEndpoint: 'http://localstack.kinetiq-local.svc.cluster.local:4566',
    queueURL: 'http://localstack.kinetiq-local.svc.cluster.local:4566/000000000000/kinetiq-telemetry', queueLength: '20', scaleOnInFlight: 'true'});
}
