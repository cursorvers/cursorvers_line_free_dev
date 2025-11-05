#!/usr/bin/env node
/**
 * Webhook Event Router
 *
 * Routes GitHub webhook events to simple state transitions so that
 * Miyabi's status dashboard reflects the current workflow.
 */

import { Octokit } from '@octokit/rest';

const argv = process.argv.slice(2);

if (argv.length < 2) {
  console.error('Usage: webhook-router.mjs <event-type> <action> [id]');
  process.exit(1);
}

const EVENT_TYPE = argv[0];
const ACTION = argv[1];
const IDENTIFIER = argv[2];

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || process.env.REPOSITORY;

if (!token) {
  console.error('GITHUB_TOKEN is required to route events');
  process.exit(2);
}

if (!repository) {
  console.error('GITHUB_REPOSITORY or REPOSITORY must be set');
  process.exit(3);
}

const [owner, repo] = repository.split('/');
const octokit = new Octokit({ auth: token });

const STATE_LABELS = [
  '📥 state:pending',
  '🔍 state:analyzing',
  '🏗️ state:implementing',
  '👀 state:reviewing',
  '🚫 state:blocked',
  '⏸️ state:paused',
  '✅ state:done',
];

const labelPayload = (() => {
  const raw = process.env.ISSUE_LABELS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed
      .map((entry) => (typeof entry === 'string' ? entry : entry?.name ?? ''))
      .filter(Boolean);
  } catch (error) {
    console.warn('Failed to parse ISSUE_LABELS payload:', error);
    return [];
  }
})();

async function setIssueState(issueNumber, nextState) {
  const { data: issue } = await octokit.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  const currentLabels = issue.labels.map((label) => (typeof label === 'string' ? label : label.name ?? ''));
  const hasState = (state) => currentLabels.includes(state);

  const labelsToRemove = STATE_LABELS.filter((label) => label !== nextState && hasState(label));

  for (const label of labelsToRemove) {
    try {
      await octokit.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: label });
      console.log(`Removed state label: ${label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to remove label ${label}:`, message);
    }
  }

  if (nextState && !hasState(nextState)) {
    await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: [nextState] });
    console.log(`Set issue #${issueNumber} state → ${nextState}`);
  } else if (!nextState) {
    console.log(`Cleared state labels for issue #${issueNumber}`);
  }
}

export function determineStateFromLabels(labels) {
  const priority = [
    '🚫 state:blocked',
    '⏸️ state:paused',
    '🏗️ state:implementing',
    '👀 state:reviewing',
    '🔍 state:analyzing',
    '📥 state:pending',
    '✅ state:done',
  ];

  for (const label of priority) {
    if (labels.includes(label)) {
      return label;
    }
  }

  return null;
}

async function handleIssueEvent() {
  const issueNumber = Number(IDENTIFIER || process.env.ISSUE_NUMBER);
  if (!Number.isFinite(issueNumber)) {
    console.log('Issue event received without an issue number. Skipping.');
    return;
  }

  const labelName = process.env.LABEL_NAME || '';
  console.log(`Handling issue event: action=${ACTION}, issue=${issueNumber}, label=${labelName}`);

  if (ACTION === 'opened' || ACTION === 'reopened') {
    await setIssueState(issueNumber, '📥 state:pending');
    return;
  }

  if (ACTION === 'closed') {
    await setIssueState(issueNumber, '✅ state:done');
    return;
  }

  if (ACTION === 'labeled' || ACTION === 'unlabeled') {
    if (labelName === '🤖agent-execute' && ACTION === 'labeled') {
      const stateLabels = labelPayload.filter((label) => STATE_LABELS.includes(label));
      const hasActiveState = stateLabels.some((label) => label !== '📥 state:pending');
      if (!hasActiveState) {
        await setIssueState(issueNumber, '🔍 state:analyzing');
        return;
      }
    }

    const inferred = determineStateFromLabels(labelPayload);

    if (inferred) {
      await setIssueState(issueNumber, inferred);
    } else if (ACTION === 'unlabeled') {
      // If no state labels remain, default back to pending to keep the dashboard consistent
      await setIssueState(issueNumber, '📥 state:pending');
    }
    return;
  }

  if (ACTION === 'assigned') {
    await setIssueState(issueNumber, '🏗️ state:implementing');
    return;
  }

  console.log(`No routing rules for issue action '${ACTION}'.`);
}

async function handleCommentEvent() {
  const issueNumber = Number(process.env.ISSUE_NUMBER || IDENTIFIER);
  const body = process.env.COMMENT_BODY || '';

  if (!Number.isFinite(issueNumber)) {
    console.log('Comment event without issue context. Skipping.');
    return;
  }

  if (!body.startsWith('/state')) {
    console.log('Comment does not contain a state command. Nothing to do.');
    return;
  }

  const [, requested] = body.split(/\s+/);
  if (!requested) {
    console.log('State command missing argument.');
    return;
  }

  const lower = requested.toLowerCase();
  const mapping = {
    pending: '📥 state:pending',
    analyzing: '🔍 state:analyzing',
    implementing: '🏗️ state:implementing',
    reviewing: '👀 state:reviewing',
    blocked: '🚫 state:blocked',
    paused: '⏸️ state:paused',
    done: '✅ state:done',
  };

  const next = mapping[lower];
  if (!next) {
    console.log(`Unknown state requested: ${requested}`);
    return;
  }

  await setIssueState(issueNumber, next);
  const actor = process.env.COMMENT_AUTHOR ?? 'unknown';

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `State updated to **${next}** by @${actor}`,
  });
}

async function main() {
  try {
    switch (EVENT_TYPE) {
      case 'issue':
        await handleIssueEvent();
        break;
      case 'comment':
        await handleCommentEvent();
        break;
      default:
        console.log(`No actions configured for event type '${EVENT_TYPE}'.`);
    }
  } catch (error) {
    console.error('Router failed:', error);
    process.exitCode = 1;
  }
}

main();
