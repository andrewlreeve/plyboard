<p align="center">
  <img src="./assets/plywood-logo.svg" width="560" alt="Plywood">
</p>

<p align="center">
  <strong>YOLO-mode AI agents for ecommerce, without blowing up production.</strong>
</p>

## The Short Version

Plywood lets ecommerce teams use AI agents to do store chores safely.

Pick a job, like checking new products before launch. Plywood sends the right AI helpers to review the store, draft fixes, and show you exactly what they want to change.

Before anything risky goes live, you get a clear review screen:

- Things that are safe.
- Things that need your approval.
- Things Plywood blocked.

No terminal commands for store operators. No local setup. No store keys sitting on someone's laptop. No mystery changes to your live store.

## Why It Exists

AI agents are getting useful enough to help D2C brands with real store work: product launches, catalog cleanup, photo checks, product descriptions, collection reviews, and merchandising QA.

The catch: the most powerful agents usually need technical setup and admin-style access. That often means developer tools, secret credentials, and commands running from someone's computer.

That is too much risk for normal store ops. One bad run can publish the wrong product, break a collection, expose credentials, or change live store data before anyone has checked the work.

## The Solution

Plywood gives the AI a safe place to work and gives the operator the final say.

For each store job, Plywood uses a prebuilt blueprint with the right AI helpers, brand instructions, store tools, safety rules, approval steps, and rollback notes.

The AI can inspect and draft. Plywood decides what is safe, what needs approval, and what should be blocked. The operator reviews the plan before production changes happen.

Plywood was built as part of the OpenAI Codex Hackathon Sydney.

## Current Demo

The demo is **Product Readiness QA**.

It checks whether new products are ready to publish and whether the live storefront is presenting products properly.

It uses two AI helpers:

- **Catalog QA Agent:** reviews draft products for missing enrichment, weak descriptions, SEO gaps, tags, variants, image alt text, photo quality, collection fit, and publish readiness.
- **Storefront Merchandising Agent:** reviews the live storefront for product presentation, collection merchandising, product card quality, image consistency, weak positioning, and existing enrichment gaps.

For the hackathon demo, store actions are mocked. The important part is the flow: run the agents, review the proposed changes, approve what is safe, and block what should not happen.

## For Builders

The current milestone is an operator GUI backed by a CLI product kernel. Under the hood, Plywood models CLI-native ecommerce agents running inside Docker SBX-style sandboxes.

The GUI is the primary demo surface. The CLI remains the product kernel for blueprint execution, policy review, approvals, context mounting, and audit export.

The mocked Product Readiness QA Blueprint produces a structured action manifest, classifies every proposed action as `safe`, `needs_approval`, or `blocked`, and writes reviewable audit artifacts.

Plywood's current architecture:

- Agents run in isolated blueprints.
- Retailer context is mounted read-only from `context/`.
- Raw Shopify and commerce API secrets stay outside the sandbox.
- Proposed changes become structured manifests before execution.
- Audit packets and rollback plans are generated for review.

## Run The Demo UI

```bash
npm install
npm test
npm run dev
```

Open:

```text
http://localhost:3210
```

The operator console lets you:

- Select the Product Readiness QA blueprint.
- Choose target store and safety mode.
- Edit shared brand and operating context.
- Run the mocked sandboxed agents.
- Review safe, approval-required, and blocked actions.
- Approve gated actions.
- Mock-execute safe and approved actions through the host broker.
- Export the audit packet.

The GUI is backed by the same Plywood CLI. It serves static files from `public/` and calls `bin/plywood.mjs` through `server.mjs`.

## Blueprints

Plywood currently ships with two blueprint shapes:

- `default`: a generic Codex/Docker SBX sandbox blueprint for loading the workspace, mounting `context/` read-only, and running Codex as the sandbox agent.
- `product-readiness-qa`: the ecommerce demo workflow that runs the mocked Catalog QA Agent and Storefront Merchandising Agent.

## CLI Quick Start

```bash
npm install
npm test
```

List and inspect the available blueprint:

```bash
npm run plywood -- blueprint list
npm run plywood -- blueprint inspect
npm run plywood -- blueprint inspect product-readiness-qa
```

Check the shared context and create the default sandbox plan:

```bash
npm run plywood -- context status
npm run plywood -- create --dry-run
```

Use SBX-style semantics through Plywood:

```bash
npm run plywood -- run --dry-run
npm run plywood -- exec -- npm test
npm run plywood -- exec product-readiness-qa --target demo --safety-mode draft-only
```

Review the latest manifest:

```bash
npm run plywood -- review latest
npm run plywood -- review latest --only needs_approval
npm run plywood -- review latest --only blocked
```

Approve a mocked action and export the audit packet:

```bash
npm run plywood -- approve latest --action act-005 --actor demo-operator
npm run plywood -- execute latest --actor demo-operator
npm run plywood -- export-audit latest
```

You can also run the executable directly:

```bash
./bin/plywood.mjs exec product-readiness-qa --target demo --safety-mode draft-only
```

## CLI

```bash
plywood init [--force]
plywood create [blueprint-id] [PATH...] [--context ./notes.md] [--dry-run] [--json]
plywood run [blueprint-id|sandbox-name] [--dry-run] [--json]
plywood exec [blueprint-id|sandbox-name] [--target demo --safety-mode draft-only] [-- <command>]
plywood context init [--force] [--json]
plywood context status [--json]
plywood blueprint list [--json]
plywood blueprint inspect [blueprint-id] [--json]
plywood review [latest|run-id|run-dir|manifest.json] [--only safe|needs_approval|blocked] [--json]
plywood approve [latest|run-id|run-dir] --action act-005 [--action act-018] [--actor operator]
plywood approve latest --all-needs-approval [--actor operator]
plywood execute [latest|run-id|run-dir] [--actor operator] [--json]
plywood export-audit [latest|run-id|run-dir] [--out exports/my-run]
```

## Command Model

Plywood follows the SBX command model while keeping SBX behind Plywood:

- `create` prepares a sandbox from a blueprint.
- `run` starts or attaches to the sandbox interactively.
- `exec` runs a non-interactive command or blueprint workflow.
- `execute` mock-executes safe and approved manifest actions through the host broker and writes an execution ledger.

With no blueprint id, Plywood reads the concrete default blueprint from `blueprint/default.json`.

## How Plywood Keeps Things Safe

Plywood starts careful and stays careful.

- Safe work can be drafted automatically, like product copy, SEO suggestions, image alt text, photo issue flags, storefront audits, and merchandising recommendations.
- Risky work needs approval, like publishing products, changing collection order, updating prices, or editing inventory.
- Dangerous work is blocked, like deleting product media, sending customer emails, capturing payments, issuing refunds, or publishing a production theme.

Safety enforcement is host-side and structured. Product Readiness QA uses `blueprint/product-readiness-qa/safety-policy.json`, not a markdown instruction file, as the source of truth for action classification. Every run records the policy id, version, source path, SHA256, default result, and matched rule ids in the manifest and audit packet.

The demo also models the intended sandbox boundary:

- Raw Shopify/API secrets are never passed into the sandbox.
- Agents call limited store tools instead of holding reusable credentials.
- The host side owns credential access and returns only the results the agent needs.
- Blocked actions remain non-executable and are included for audit visibility.
- Execution writes `execution-ledger.json` and `execution-ledger.md` beside the manifest, audit packet, broker trace, and rollback plan.

## Brand Context

Plywood auto-mounts the top-level `context/` folder into every sandbox and workflow execution when it exists.

The mount contract:

- Local path: `./context`
- Sandbox path: `/plywood/context`
- Mode: read-only
- Secrets: forbidden

Use `context init` to create starter files in a new workspace:

```bash
npm run plywood -- context init
```

Use `--context` for one-off extra files or folders. Extra mounts are placed under `/plywood/context/extra/...` in the manifest:

```bash
npm run plywood -- exec --context ./examples/brand-context
```

Plywood records context mount paths, sandbox paths, hashes, previews, and read-only status in the manifest. It refuses obvious secret-like paths such as `.env`, `.pem`, `.key`, or files named with `secret` or `credential`.

## Sandbox Creation

Plywood creates sandboxes from blueprint definitions:

```bash
npm run plywood -- create
```

With no blueprint id, Plywood reads `blueprint/default.json` and uses that concrete blueprint. The default blueprint loads the current workspace, injects `./context` as a read-only workspace, and uses Codex as the sandbox agent.

The operator should not call the runtime directly. Plywood owns sandbox creation and startup.

If the Docker SBX runtime is available, Plywood attempts to create the sandbox through its runtime adapter. If it is not available, Plywood writes a creation plan to `.plywood/sandboxes/<name>/sandbox.json`.

Use `--dry-run` to always write the plan without executing SBX:

```bash
npm run plywood -- create --dry-run
```

Start or attach to the sandbox interactively through Plywood:

```bash
npm run plywood -- run
```

Run the blueprint workflow non-interactively through Plywood:

```bash
npm run plywood -- exec product-readiness-qa --target demo --safety-mode draft-only
```

Run an arbitrary command inside the sandbox through Plywood:

```bash
npm run plywood -- exec -- npm test
```

## What Gets Saved

Each blueprint workflow execution saves a folder under `runs/<run-id>/`:

- `manifest.json`: everything the agents proposed.
- `audit-packet.json`: machine-readable audit packet.
- `audit-packet.md`: human-readable audit packet.
- `rollback-plan.md`: notes for undoing approved changes.
- `broker-trace.json`: mocked store tool calls.
- `run-log.jsonl`: run events.
- `approval-record.json`: mocked approvals, created after `plywood approve`.

The latest run pointer is stored at `.plywood/latest-run`.
