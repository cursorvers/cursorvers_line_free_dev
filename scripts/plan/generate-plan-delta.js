#!/usr/bin/env node
/**
 * Minimal PlanDelta generator for development mode.
 * Reads event + plan and writes a delta file noting receipt.
 */
const fs = require('fs');

function main() {
  const args = process.argv.slice(2);
  const eventArg = args.find((a) => a === '--event');
  const planArg = args.find((a) => a === '--plan');
  const deltaArg = args.find((a) => a === '--delta');

  const eventPath = args[args.indexOf('--event') + 1];
  const planPath = args[args.indexOf('--plan') + 1];
  const deltaPath = args[args.indexOf('--delta') + 1];

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

  const delta = {
    decision: "noop",
    reasons: ["development mode placeholder"],
    echoed_event_type: event?.events?.[0]?.type || "unknown",
    plan_title: plan.title || "unnamed plan",
    simulated_outcomes: []
  };

  fs.writeFileSync(deltaPath, JSON.stringify(delta, null, 2));
  console.log(`Wrote delta to ${deltaPath}`);
}

main();
