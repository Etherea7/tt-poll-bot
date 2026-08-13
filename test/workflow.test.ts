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

// ---------------------------------------------------------------------------
// Spec 004 — the attendance collection workflow
// ---------------------------------------------------------------------------

const attendance = readFileSync('.github/workflows/attendance.yml', 'utf8');

// AC1 (R1): hourly collection, far inside Telegram's 24-hour update retention.
test('attendance workflow collects hourly', () => {
  assert.match(attendance, /schedule:/);
  assert.match(attendance, /cron:\s*'0 \* \* \* \*'/);
});

// AC2 (R2): two concurrent getUpdates consumers receive HTTP 409, so the
// workflow must never overlap with itself.
test('attendance workflow runs as a single consumer', () => {
  assert.match(attendance, /concurrency:/);
  assert.match(attendance, /group:\s*attendance/);
  assert.match(attendance, /cancel-in-progress:\s*false/);
});

// AC2 (R2): getUpdates and setWebhook are mutually exclusive. Nothing in this
// project may register a webhook, or collection stops silently.
test('no source or workflow file registers a Telegram webhook', () => {
  const files = [
    'src/collect.ts',
    'src/collect-main.ts',
    'src/telegram.ts',
    'src/run.ts',
    '.github/workflows/attendance.yml',
    '.github/workflows/monthly-polls.yml',
  ];
  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /setWebhook/i,
      `${file} must not set a webhook`,
    );
  }
});

// The same credential discipline as the monthly workflow: the checkout carries
// no write credential, so the push step configures its own auth before any
// network operation.
test('attendance workflow authenticates before fetching or pushing state', () => {
  assert.match(attendance, /uses:\s*actions\/checkout@v6\b/);
  assert.match(attendance, /actions\/checkout@v6[\s\S]*?persist-credentials:\s*false/);

  const auth = attendance.indexOf('git config "$auth_key" "AUTHORIZATION: basic $basic_auth"');
  const fetched = attendance.indexOf('git fetch origin "$GITHUB_REF_NAME"');
  const push = attendance.indexOf('git push origin "HEAD:$GITHUB_REF_NAME"');

  assert.ok(auth >= 0, 'the state push must configure Git authentication');
  assert.ok(fetched > auth, 'it must authenticate before fetching');
  assert.ok(push > fetched, 'it must fetch and rebase before pushing');
});

// R25: a failed collection run must surface as a red workflow, so the step may
// not swallow the CLI exit code.
test('attendance workflow lets a failed collection fail the job', () => {
  assert.match(attendance, /set -euo pipefail/);
  assert.doesNotMatch(attendance, /continue-on-error:\s*true/);
});
