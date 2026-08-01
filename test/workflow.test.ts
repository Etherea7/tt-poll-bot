import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync('.github/workflows/monthly-polls.yml', 'utf8');

// AC11 (R14): dependencies run without a checkout credential that could push
// state. The write credential is introduced only by the dedicated push phase.
test('monthly workflow uses current setup actions and does not persist checkout credentials', () => {
  assert.match(workflow, /uses:\s*actions\/checkout@v6\b/);
  assert.match(workflow, /uses:\s*actions\/setup-node@v6\b/);
  assert.match(workflow, /actions\/checkout@v6[\s\S]*?persist-credentials:\s*false/);
});

// AC11 (R14, R15): a live request is legal only after a durable pre-send claim
// is pushed. The post-send push records the delivered result or preserves the
// claim on failure.
test('monthly workflow orders prepare, state push, live delivery, then state push', () => {
  const prepare = workflow.indexOf('--prepare');
  const firstPush = workflow.indexOf('git push', prepare);
  const live = workflow.indexOf('--live', firstPush);
  const secondPush = workflow.indexOf('git push', live);

  assert.ok(prepare >= 0, 'workflow must prepare delivery claims');
  assert.ok(firstPush > prepare, 'prepared claims must be pushed before delivery');
  assert.ok(live > firstPush, 'live delivery must follow the successful pre-send push');
  assert.ok(secondPush > live, 'post-send delivery state must be pushed after delivery');
});

// The checkout intentionally does not persist credentials. Each dedicated
// state-push step must therefore configure its scoped auth header before its
// first network operation, including fetch.
test('each state-push step authenticates before fetching or pushing', () => {
  const stepNames = ['Push prepared delivery claims', 'Push delivered state'];

  for (const [index, stepName] of stepNames.entries()) {
    const start = workflow.indexOf(`- name: ${stepName}`);
    const end =
      index + 1 < stepNames.length
        ? workflow.indexOf(`- name: ${stepNames[index + 1]}`, start)
        : workflow.length;
    const step = workflow.slice(start, end);
    const auth = step.indexOf('git config "$auth_key" "AUTHORIZATION: basic $basic_auth"');
    const fetch = step.indexOf('git fetch origin "$GITHUB_REF_NAME"');
    const push = step.indexOf('git push origin "HEAD:$GITHUB_REF_NAME"');

    assert.ok(start >= 0, `${stepName} must exist`);
    assert.ok(auth >= 0, `${stepName} must configure Git authentication`);
    assert.ok(fetch > auth, `${stepName} must authenticate before fetching`);
    assert.ok(push > fetch, `${stepName} must fetch and rebase before pushing`);
  }
});
