// Run: node src/lib/awsErrors.check.mjs
import assert from 'node:assert/strict';
import { customerAwsError } from './awsErrors.js';

const assume =
  'An error occurred (AccessDenied) when calling the AssumeRole operation: User: arn:aws:sts::906335841271:assumed-role/nhi-scanner/abc is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::111111111111:role/DaRead';
const out = customerAwsError(assume);
assert.ok(out.includes('111111111111') && out.includes('DaRead'), out);
assert.ok(!out.includes('906335841271') && !out.includes('nhi-scanner'), out);
assert.ok(!customerAwsError('boom from arn:aws:sts::906335841271:assumed-role/x/y while reading').includes('906335841271'));
assert.ok(customerAwsError('Rate exceeded').startsWith('AWS asked us'));
assert.equal(customerAwsError(''), '');
console.log('awsErrors ok');
