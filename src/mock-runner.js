import crypto from "node:crypto";
import { classifyActions, summarizePolicy } from "./policy.js";

export function createProductReadinessRun({ blueprint, targetEnvironment, safetyMode, contextMounts }) {
  const createdAt = new Date().toISOString();
  const runId = `run-${createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z")}-${crypto
    .randomBytes(2)
    .toString("hex")}`;

  const productFindings = buildProductFindings();
  const storefrontFindings = buildStorefrontFindings();
  const rawActions = buildProposedActions();
  const actions = classifyActions(rawActions, { targetEnvironment, safetyMode });

  return {
    schema_version: "plyboard.action_manifest.v1",
    run: {
      id: runId,
      created_at: createdAt,
      status: "completed",
      target_environment: targetEnvironment,
      safety_mode: safetyMode,
      operator_interface: "plyboard-cli",
      mocked_execution: true
    },
    blueprint: {
      id: blueprint.id,
      name: blueprint.name,
      version: blueprint.version,
      runtime: blueprint.runtime.name,
      runtime_mode: blueprint.runtime.mode,
      image: blueprint.runtime.image,
      manifest_schema: blueprint.manifestSchema
    },
    agents: blueprint.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: "completed",
      runtime_blueprint: agent.runtimeBlueprint,
      toolkit: agent.toolkit,
      tools_used: agent.tools,
      checks: agent.checks
    })),
    sbx: {
      runtime: "Docker SBX",
      standard: "SBX",
      image: blueprint.runtime.image,
      network: blueprint.runtime.network,
      workspace: blueprint.runtime.workspace,
      secrets_shared_with_sandbox: false,
      api_access: {
        mode: "host_api_broker",
        broker_injects_credentials: true,
        sandbox_receives_raw_credentials: false,
        outbound_calls_are_scoped: true
      },
      mounted_context: contextMounts.map((mount) => ({
        type: mount.type,
        source_path: mount.source_path,
        sandbox_path: mount.sandbox_path,
        mount_role: mount.mount_role,
        readonly: mount.readonly,
        sha256: mount.sha256,
        file_count: mount.file_count ?? 1,
        preview: mount.preview || undefined,
        files: mount.files
          ? mount.files.map((file) => ({
              relative_path: file.relative_path,
              sandbox_path: file.sandbox_path,
              sha256: file.sha256,
              preview: file.preview
            }))
          : undefined
      }))
    },
    policy_summary: summarizePolicy(actions),
    product_findings: productFindings,
    storefront_findings: storefrontFindings,
    actions,
    audit_packet: {
      generated: false
    },
    rollback_plan: {
      generated: false
    },
    broker_trace: buildBrokerTrace(createdAt)
  };
}

function buildProductFindings() {
  return [
    {
      product_id: "gid://shopify/Product/910001",
      handle: "linen-camp-shirt-sage",
      title: "Linen Camp Shirt - Sage",
      status: "draft",
      agent_id: "catalog-qa",
      severity: "medium",
      summary: "Strong product candidate, but launch metadata and image alt text are incomplete.",
      checks: [
        {
          name: "Required fields",
          result: "pass",
          detail: "Title, vendor, product type, variants, and primary image are present."
        },
        {
          name: "Description",
          result: "needs_fix",
          detail: "Description mentions fabric but misses fit, care, and use-case details."
        },
        {
          name: "SEO",
          result: "needs_fix",
          detail: "SEO title is 74 characters and meta description is missing."
        },
        {
          name: "Image alt text",
          result: "needs_fix",
          detail: "Three lifestyle images have empty alt text."
        },
        {
          name: "Publish readiness",
          result: "ready_after_draft_fixes",
          detail: "No blocking catalog issues remain after proposed draft updates."
        }
      ]
    },
    {
      product_id: "gid://shopify/Product/910002",
      handle: "ceramic-pour-over-set",
      title: "Ceramic Pour-Over Set",
      status: "draft",
      agent_id: "catalog-qa",
      severity: "high",
      summary: "Missing media coverage and weak enrichment make this product risky to launch.",
      checks: [
        {
          name: "Required fields",
          result: "needs_fix",
          detail: "Care instructions and material details are absent."
        },
        {
          name: "Photo quality",
          result: "needs_fix",
          detail: "Secondary image is low resolution and does not match the crop ratio used in the collection."
        },
        {
          name: "Collection assignment",
          result: "needs_fix",
          detail: "Assigned to Gifts but not Coffee Gear, despite product taxonomy rules."
        },
        {
          name: "Publish readiness",
          result: "not_ready",
          detail: "Needs richer description and replacement media before launch."
        }
      ]
    },
    {
      product_id: "gid://shopify/Product/910003",
      handle: "trail-merino-sock-charcoal",
      title: "Trail Merino Sock - Charcoal",
      status: "draft",
      agent_id: "catalog-qa",
      severity: "medium",
      summary: "Variants exist, but SEO, price alignment, and inventory handling need review.",
      checks: [
        {
          name: "Variants",
          result: "pass",
          detail: "Small, medium, large, and XL variants are present."
        },
        {
          name: "SEO",
          result: "needs_fix",
          detail: "SEO title does not include material or activity positioning."
        },
        {
          name: "Tags",
          result: "needs_fix",
          detail: "Missing material:merino and activity:hike tags."
        },
        {
          name: "Inventory",
          result: "needs_review",
          detail: "Agent detected inconsistent inventory between draft data and broker response."
        }
      ]
    }
  ];
}

function buildStorefrontFindings() {
  return [
    {
      id: "storefront-audit-001",
      agent_id: "storefront-merchandising",
      area: "Summer Essentials collection",
      severity: "medium",
      summary: "Collection presentation is visually inconsistent and under-prioritizes launch-ready products.",
      checks: [
        {
          name: "Product card quality",
          result: "needs_fix",
          detail: "Two cards use cropped lifestyle imagery while the rest use centered product cutouts."
        },
        {
          name: "Collection order",
          result: "needs_approval",
          detail: "Best launch candidates are below older low-margin items."
        },
        {
          name: "Positioning",
          result: "needs_fix",
          detail: "Cards do not surface material and use-case language from the product copy."
        },
        {
          name: "Theme safety",
          result: "blocked",
          detail: "Theme publish is outside this blueprint and should remain blocked."
        }
      ]
    }
  ];
}

function buildProposedActions() {
  return [
    action({
      id: "act-001",
      agent_id: "catalog-qa",
      action_type: "product.read",
      resource: "Linen Camp Shirt - Sage",
      write_scope: "read",
      risk: "low",
      before: "Draft product loaded through broker.",
      after: "Structured catalog QA inputs available to the agent.",
      rollback_note: "Read-only broker call. No rollback needed."
    }),
    action({
      id: "act-002",
      agent_id: "catalog-qa",
      action_type: "product.enrichment_draft",
      resource: "Linen Camp Shirt - Sage",
      write_scope: "draft",
      risk: "low",
      before: "Description: 'Lightweight linen shirt in sage.'",
      after:
        "Draft description adds fit, breathable linen texture, care guidance, and warm-weather merchandising copy.",
      rollback_note: "Restore previous draft description from manifest before value."
    }),
    action({
      id: "act-003",
      agent_id: "catalog-qa",
      action_type: "product.seo_draft",
      resource: "Linen Camp Shirt - Sage",
      write_scope: "draft",
      risk: "low",
      before: "SEO title: 'Linen Camp Shirt Sage Green Short Sleeve Summer Casual Button Up'",
      after: "SEO title: 'Sage Linen Camp Shirt | Ridge & Bloom'",
      rollback_note: "Restore previous SEO title and meta description from manifest before values."
    }),
    action({
      id: "act-004",
      agent_id: "catalog-qa",
      action_type: "product.image_alt_text_draft",
      resource: "Linen Camp Shirt - Sage",
      write_scope: "draft",
      risk: "low",
      before: "Three product images have empty alt text.",
      after: "Alt text describes the shirt color, fit, and warm-weather lifestyle context.",
      rollback_note: "Clear or restore previous image alt text values."
    }),
    action({
      id: "act-005",
      agent_id: "catalog-qa",
      action_type: "product.publish.ready",
      resource: "Linen Camp Shirt - Sage",
      write_scope: "live",
      risk: "medium",
      before: "Product remains draft after QA fixes.",
      after: "Product marked ready for publish.",
      rollback_note: "Unset ready flag and keep product in draft status."
    }),
    action({
      id: "act-006",
      agent_id: "catalog-qa",
      action_type: "product.read",
      resource: "Ceramic Pour-Over Set",
      write_scope: "read",
      risk: "low",
      before: "Draft product loaded through broker.",
      after: "Structured catalog QA inputs available to the agent.",
      rollback_note: "Read-only broker call. No rollback needed."
    }),
    action({
      id: "act-007",
      agent_id: "catalog-qa",
      action_type: "product.media_issue_flag",
      resource: "Ceramic Pour-Over Set",
      write_scope: "audit",
      risk: "low",
      before: "Low-resolution secondary image is unflagged.",
      after: "Media issue flagged for replacement before launch.",
      rollback_note: "Remove the media issue flag from the draft QA notes."
    }),
    action({
      id: "act-008",
      agent_id: "catalog-qa",
      action_type: "product.enrichment_draft",
      resource: "Ceramic Pour-Over Set",
      write_scope: "draft",
      risk: "low",
      before: "No material, care, or included-components copy.",
      after: "Draft enrichment adds ceramic material, included dripper/server details, and care notes.",
      rollback_note: "Restore previous draft enrichment fields."
    }),
    action({
      id: "act-009",
      agent_id: "catalog-qa",
      action_type: "product.media_delete",
      resource: "Ceramic Pour-Over Set",
      write_scope: "destructive",
      risk: "high",
      before: "Low-resolution secondary image remains attached.",
      after: "Agent proposed deleting the image.",
      rollback_note: "Blocked before execution. If ever executed elsewhere, restore media from Shopify files backup."
    }),
    action({
      id: "act-010",
      agent_id: "catalog-qa",
      action_type: "product.publish_readiness_check",
      resource: "Ceramic Pour-Over Set",
      write_scope: "audit",
      risk: "low",
      before: "Readiness unknown.",
      after: "Readiness set to not_ready because replacement media is required.",
      rollback_note: "Remove generated readiness note."
    }),
    action({
      id: "act-011",
      agent_id: "catalog-qa",
      action_type: "product.read",
      resource: "Trail Merino Sock - Charcoal",
      write_scope: "read",
      risk: "low",
      before: "Draft product loaded through broker.",
      after: "Structured catalog QA inputs available to the agent.",
      rollback_note: "Read-only broker call. No rollback needed."
    }),
    action({
      id: "act-012",
      agent_id: "catalog-qa",
      action_type: "product.seo_draft",
      resource: "Trail Merino Sock - Charcoal",
      write_scope: "draft",
      risk: "low",
      before: "SEO title: 'Trail Sock'",
      after: "SEO title: 'Merino Hiking Socks - Charcoal | Ridge & Bloom'",
      rollback_note: "Restore previous SEO title and meta description from manifest before values."
    }),
    action({
      id: "act-013",
      agent_id: "catalog-qa",
      action_type: "product.update_price",
      resource: "Trail Merino Sock - Charcoal",
      write_scope: "live",
      risk: "medium",
      before: "$18.00",
      after: "$22.00 to match margin rule and comparable collection pricing.",
      rollback_note: "Restore previous price on all variants."
    }),
    action({
      id: "act-014",
      agent_id: "catalog-qa",
      action_type: "inventory.update",
      resource: "Trail Merino Sock - Charcoal",
      write_scope: "live",
      risk: "medium",
      before: "Variant XL shows 4 units in draft export and 6 units in broker response.",
      after: "Normalize XL inventory to 6 units.",
      rollback_note: "Restore inventory quantity from Shopify inventory history."
    }),
    action({
      id: "act-015",
      agent_id: "catalog-qa",
      action_type: "inventory.decrement",
      resource: "Trail Merino Sock - Charcoal",
      write_scope: "destructive",
      risk: "high",
      before: "Inventory unchanged.",
      after: "Agent proposed decrementing unavailable inventory.",
      rollback_note: "Blocked before execution. Manual correction would require inventory adjustment history."
    }),
    action({
      id: "act-016",
      agent_id: "storefront-merchandising",
      action_type: "storefront.product_quality_audit",
      resource: "Summer Essentials collection",
      write_scope: "audit",
      risk: "low",
      before: "Collection presentation unaudited.",
      after: "Audit flags inconsistent crops and missing product positioning language.",
      rollback_note: "Audit-only action. No rollback needed."
    }),
    action({
      id: "act-017",
      agent_id: "storefront-merchandising",
      action_type: "collection.merchandising_recommendation",
      resource: "Summer Essentials collection",
      write_scope: "recommendation",
      risk: "low",
      before: "Older low-margin items appear above launch-ready products.",
      after: "Recommendation ranks Linen Camp Shirt and Trail Merino Sock above older seasonal items.",
      rollback_note: "Recommendation-only action. No rollback needed."
    }),
    action({
      id: "act-018",
      agent_id: "storefront-merchandising",
      action_type: "collection.sort_update",
      resource: "Summer Essentials collection",
      write_scope: "live",
      risk: "medium",
      before: "Manual sort: older sandals, clearance tee, linen shirt, socks.",
      after: "Manual sort: linen shirt, socks, sandals, clearance tee.",
      rollback_note: "Restore previous manual sort order from manifest before value."
    }),
    action({
      id: "act-019",
      agent_id: "storefront-merchandising",
      action_type: "collection.publish",
      resource: "Coffee Gear collection",
      write_scope: "live",
      risk: "medium",
      before: "Collection is unpublished while Ceramic Pour-Over Set is incomplete.",
      after: "Agent proposed publishing collection after assigning the product.",
      rollback_note: "Unpublish collection or restore previous publication state."
    }),
    action({
      id: "act-020",
      agent_id: "storefront-merchandising",
      action_type: "theme.publish.production",
      resource: "Production theme",
      write_scope: "destructive",
      risk: "critical",
      before: "Current production theme remains active.",
      after: "Agent proposed publishing a merchandising theme variant.",
      rollback_note: "Blocked before execution. Theme rollback would require previous theme ID."
    }),
    action({
      id: "act-021",
      agent_id: "storefront-merchandising",
      action_type: "customer.email_send",
      resource: "Customers interested in summer products",
      write_scope: "external",
      risk: "critical",
      before: "No customer messages sent.",
      after: "Agent proposed emailing customers about launch-ready products.",
      rollback_note: "Blocked before execution. Sent customer email cannot be fully rolled back."
    }),
    action({
      id: "act-022",
      agent_id: "storefront-merchandising",
      action_type: "webhook.create",
      resource: "Shopify admin webhooks",
      write_scope: "external",
      risk: "high",
      before: "No new webhook registered.",
      after: "Agent proposed creating a webhook for future collection changes.",
      rollback_note: "Blocked before execution. If created elsewhere, delete webhook by ID."
    })
  ];
}

function action(input) {
  return {
    tool: input.agent_id === "catalog-qa" ? "shopify-admin-broker" : "shopify-storefront-broker",
    selected: false,
    ...input
  };
}

function buildBrokerTrace(createdAt) {
  return [
    brokerCall({
      at: createdAt,
      agent_id: "catalog-qa",
      tool: "shopify.product.read",
      scope: "read_products",
      resource: "draft products",
      result: "3 draft products returned"
    }),
    brokerCall({
      at: createdAt,
      agent_id: "catalog-qa",
      tool: "shopify.media.inspect",
      scope: "read_products",
      resource: "product media",
      result: "Image metadata and dimensions returned"
    }),
    brokerCall({
      at: createdAt,
      agent_id: "storefront-merchandising",
      tool: "shopify.storefront.read",
      scope: "read_storefront",
      resource: "live storefront",
      result: "Collection cards and presentation metadata returned"
    }),
    brokerCall({
      at: createdAt,
      agent_id: "storefront-merchandising",
      tool: "shopify.collection.read",
      scope: "read_products",
      resource: "Summer Essentials collection",
      result: "Collection order and product card data returned"
    })
  ];
}

function brokerCall({ at, agent_id, tool, scope, resource, result }) {
  return {
    at,
    agent_id,
    tool,
    resource,
    scope,
    credential_location: "host_api_broker",
    secret_material_returned_to_sandbox: false,
    result
  };
}
