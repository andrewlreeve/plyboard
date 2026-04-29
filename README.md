<p align="center">
  <img src="assets/plyboard-logo.svg" width="560" alt="Plyboard">
</p>

<p align="center">
  <strong>YOLO-mode AI agents for ecommerce, without blowing up production.</strong>
</p>

## The Short Version

Plyboard lets ecommerce teams use AI agents to do store chores safely.

Pick a job, like checking new products before launch. Plyboard sends the right AI helpers to review the store, draft fixes, and show you exactly what they want to change.

Before anything risky goes live, you get a clear review screen:

- Things that are safe.
- Things that need your approval.
- Things Plyboard blocked.

No terminal commands. No local setup. No store keys sitting on someone's laptop. No mystery changes to your live store.

## Why It Exists

AI agents are getting useful enough to help D2C brands with real store work: product launches, catalog cleanup, photo checks, product descriptions, collection reviews, and merchandising QA.

The catch: the most powerful agents usually need technical setup and admin-style access. That often means developer tools, secret credentials, and commands running from someone's computer.

That is too much risk for normal store ops. One bad run can publish the wrong product, break a collection, expose credentials, or change live store data before anyone has checked the work.

## The Solution

Plyboard gives the AI a safe place to work and gives the operator the final say.

For each store job, Plyboard uses a prebuilt playbook with the right AI helpers, brand instructions, store tools, safety rules, approval steps, and rollback notes.

The AI can inspect and draft. Plyboard decides what is safe, what needs approval, and what should be blocked. The operator reviews the plan before production changes happen.

Plyboard was built as part of the OpenAI Codex Hackathon Sydney.

## Current Demo

The demo is **Product Readiness QA**.

It checks whether new products are ready to publish and whether the live storefront is presenting products properly.

It uses two AI helpers:

- **Catalog QA Agent:** reviews draft products for missing enrichment, weak descriptions, SEO gaps, tags, variants, image alt text, photo quality, collection fit, and publish readiness.
- **Storefront Merchandising Agent:** reviews the live storefront for product presentation, collection merchandising, product card quality, image consistency, weak positioning, and existing enrichment gaps.

For the hackathon demo, store actions are mocked. The important part is the flow: run the agents, review the proposed changes, approve what is safe, and block what should not happen.

## For Builders

The current milestone is a CLI product kernel. Under the hood, Plyboard models CLI-native ecommerce agents running inside Docker SBX-style sandboxes.

The mocked Product Readiness QA Blueprint produces a structured action manifest, classifies every proposed action as `safe`, `needs_approval`, or `blocked`, and writes reviewable audit artifacts.

Plyboard's intended architecture:

- Agents run in isolated blueprints.
- Retailer context is mounted read-only through shared `AGENTS.md` files or folders.
- Raw Shopify and commerce API secrets stay outside the sandbox.
- Proposed changes become structured manifests before execution.
- Audit packets and rollback plans are generated for review.

## Quick Start

```bash
npm install
npm test
```

List and inspect the available blueprint:

```bash
npm run plyboard -- blueprint list
npm run plyboard -- blueprint inspect product-readiness-qa
```

Run the demo with shared brand context:

```bash
npm run plyboard -- run product-readiness-qa --target demo --safety-mode draft-only --context ./examples/brand-context
```

Review the latest manifest:

```bash
npm run plyboard -- review latest
npm run plyboard -- review latest --only needs_approval
npm run plyboard -- review latest --only blocked
```

Approve a mocked action and export the audit packet:

```bash
npm run plyboard -- approve latest --action act-005 --actor demo-operator
npm run plyboard -- export-audit latest
```

You can also run the executable directly:

```bash
./bin/plyboard.mjs run product-readiness-qa --target demo --safety-mode draft-only --context ./examples/brand-context
```

## CLI

```bash
plyboard init [--force]
plyboard blueprint list [--json]
plyboard blueprint inspect <blueprint-id> [--json]
plyboard run <blueprint-id> --target demo --safety-mode draft-only [--context ./AGENTS.md]
plyboard review [latest|run-id|run-dir|manifest.json] [--only safe|needs_approval|blocked] [--json]
plyboard approve [latest|run-id|run-dir] --action act-005 [--action act-018] [--actor operator]
plyboard approve latest --all-needs-approval [--actor operator]
plyboard export-audit [latest|run-id|run-dir] [--out exports/my-run]
```

## How Plyboard Keeps Things Safe

Plyboard starts careful and stays careful.

- Safe work can be drafted automatically, like product copy, SEO suggestions, image alt text, photo issue flags, storefront audits, and merchandising recommendations.
- Risky work needs approval, like publishing products, changing collection order, updating prices, or editing inventory.
- Dangerous work is blocked, like deleting product media, sending customer emails, capturing payments, issuing refunds, or publishing a production theme.

The demo also models the intended sandbox boundary:

- Raw Shopify/API secrets are never passed into the sandbox.
- Agents call limited store tools instead of holding reusable credentials.
- The host side owns credential access and returns only the results the agent needs.
- Blocked actions remain non-executable and are included for audit visibility.

## Brand Context

Plyboard can give every run the same brand instructions: tone of voice, product naming rules, SEO guidelines, image standards, merchandising preferences, and approval rules.

Use `--context` to attach a read-only `AGENTS.md` or folder of brand instructions:

```bash
npm run plyboard -- run product-readiness-qa --context ./examples/brand-context
```

Plyboard records which context was used for the run. It also refuses obvious secret-like paths such as `.env`, `.pem`, `.key`, or files named with `secret` or `credential`.

## What Gets Saved

Each run saves a folder under `runs/<run-id>/`:

- `manifest.json`: everything the agents proposed.
- `audit-packet.json`: machine-readable audit packet.
- `audit-packet.md`: human-readable audit packet.
- `rollback-plan.md`: notes for undoing approved changes.
- `broker-trace.json`: mocked store tool calls.
- `run-log.jsonl`: run events.
- `approval-record.json`: mocked approvals, created after `plyboard approve`.

The latest run pointer is stored at `.plyboard/latest-run`.
