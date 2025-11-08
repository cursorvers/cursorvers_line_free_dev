import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateParameters } from '../../scripts/checks/verify-runtime-config.mjs';

const PARAMETERS = [
  {
    id: 'REQUIRED_FLAG',
    required: true,
    location: 'variable',
    description: 'Required flag',
  },
  {
    id: 'OPTIONAL_SECRET',
    required: false,
    location: 'secret',
    description: 'Optional secret',
  },
];

test('evaluateParameters records missing required and optional values', () => {
  const evaluation = evaluateParameters(PARAMETERS, {});
  assert.equal(evaluation.missingRequired.length, 1);
  assert.equal(evaluation.missingRequired[0].id, 'REQUIRED_FLAG');
  assert.equal(evaluation.missingOptional.length, 1);
  assert.equal(evaluation.missingOptional[0].id, 'OPTIONAL_SECRET');
});

test('evaluateParameters marks present values', () => {
  const evaluation = evaluateParameters(PARAMETERS, {
    REQUIRED_FLAG: 'true',
    OPTIONAL_SECRET: 'secret',
  });
  assert.equal(evaluation.missingRequired.length, 0);
  assert.equal(evaluation.missingOptional.length, 0);
  const statuses = evaluation.results.reduce((map, entry) => {
    map[entry.parameter.id] = entry.present;
    return map;
  }, {});
  assert.equal(statuses.REQUIRED_FLAG, true);
  assert.equal(statuses.OPTIONAL_SECRET, true);
});
