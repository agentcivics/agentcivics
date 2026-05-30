#!/usr/bin/env node
/**
 * MCP tool convention compliance test
 *
 * Asserts every tool in mcp-server/index.mjs:TOOLS conforms to the
 * convention at docs/contributing/mcp-tool-conventions.md.
 *
 * Specifically:
 *   1. description starts with a [CATEGORY] tag — one of CORE/READ/SOCIAL/ADVANCED
 *   2. description contains all six required sections: When to use / Side effects /
 *      Prerequisites / Returns / Errors (the first being implicit in the [CATEGORY]
 *      line itself which carries the purpose)
 *   3. inputSchema.properties every property has a description
 *   4. outputSchema present, outputSchema.properties every property has a description
 *   5. outputSchema.errors is an array of strings (may be empty)
 *
 * Exits non-zero with a specific assertion message on any failure.
 * Wired into npm test (mcp-server/package.json) so CI catches drift.
 */

import { TOOLS } from "./index.mjs";

const ALLOWED_TAGS = ["CORE", "READ", "SOCIAL", "ADVANCED"];
const REQUIRED_SECTIONS = [
  "When to use:",
  "Side effects:",
  "Prerequisites:",
  "Returns:",
  "Errors:",
];

let failed = 0;
const failures = [];

function fail(tool, msg) {
  failed++;
  failures.push(`✗ ${tool}: ${msg}`);
}

function pass(tool) {
  // Keep output quiet on pass; only failures get printed.
}

if (!Array.isArray(TOOLS) || TOOLS.length === 0) {
  console.error("✗ TOOLS export is missing or empty in index.mjs");
  process.exit(1);
}

console.log(`Validating ${TOOLS.length} tools against the convention...\n`);

for (const tool of TOOLS) {
  const name = tool.name || "<unnamed>";

  // 0. Tool has a name
  if (!tool.name || typeof tool.name !== "string") {
    fail(name, "missing or non-string `name`");
    continue;
  }

  // 1. Description starts with [CATEGORY]
  if (!tool.description || typeof tool.description !== "string") {
    fail(name, "missing or non-string `description`");
    continue;
  }
  const tagMatch = tool.description.match(/^\[([A-Z]+)\]\s/);
  if (!tagMatch) {
    fail(name, `description must start with a [CATEGORY] tag like "[CORE] ..." — got: ${tool.description.slice(0, 40)}...`);
  } else if (!ALLOWED_TAGS.includes(tagMatch[1])) {
    fail(name, `category tag "[${tagMatch[1]}]" not in allowed set: ${ALLOWED_TAGS.join(", ")}`);
  }

  // 2. All six required sections present
  for (const section of REQUIRED_SECTIONS) {
    if (!tool.description.includes(section)) {
      fail(name, `description missing required section: "${section}"`);
    }
  }

  // 3. inputSchema with described properties
  if (!tool.inputSchema || typeof tool.inputSchema !== "object") {
    fail(name, "missing or non-object `inputSchema`");
  } else if (tool.inputSchema.type !== "object") {
    fail(name, `inputSchema.type must be "object", got: ${tool.inputSchema.type}`);
  } else if (tool.inputSchema.properties && typeof tool.inputSchema.properties === "object") {
    for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
      if (!propDef || typeof propDef !== "object") {
        fail(name, `inputSchema.properties.${propName} is not an object`);
        continue;
      }
      if (!propDef.description || typeof propDef.description !== "string" || propDef.description.length < 10) {
        fail(name, `inputSchema.properties.${propName}.description must be a string of at least 10 chars (got: ${JSON.stringify(propDef.description)})`);
      }
      if (!propDef.type) {
        fail(name, `inputSchema.properties.${propName}.type is missing`);
      }
    }
  }

  // 4. outputSchema present with described properties
  if (!tool.outputSchema || typeof tool.outputSchema !== "object") {
    fail(name, "missing or non-object `outputSchema`");
  } else {
    if (tool.outputSchema.type !== "object") {
      fail(name, `outputSchema.type must be "object", got: ${tool.outputSchema.type}`);
    }
    if (tool.outputSchema.properties && typeof tool.outputSchema.properties === "object") {
      for (const [propName, propDef] of Object.entries(tool.outputSchema.properties)) {
        if (!propDef || typeof propDef !== "object") {
          fail(name, `outputSchema.properties.${propName} is not an object`);
          continue;
        }
        if (!propDef.description || typeof propDef.description !== "string" || propDef.description.length < 10) {
          fail(name, `outputSchema.properties.${propName}.description must be a string of at least 10 chars`);
        }
      }
    }

    // 5. outputSchema.errors must be an array of strings (can be empty)
    if (!Array.isArray(tool.outputSchema.errors)) {
      fail(name, "outputSchema.errors must be an array (use [] for tools with no explicit errors)");
    } else {
      for (let i = 0; i < tool.outputSchema.errors.length; i++) {
        if (typeof tool.outputSchema.errors[i] !== "string") {
          fail(name, `outputSchema.errors[${i}] must be a string`);
        }
      }
    }
  }

  if (failed === 0 || !failures.some((f) => f.startsWith(`✗ ${name}:`))) {
    pass(name);
  }
}

// Summary
console.log("─".repeat(60));
if (failed === 0) {
  console.log(`✓ All ${TOOLS.length} tools comply with the convention.`);
  console.log(`  (see docs/contributing/mcp-tool-conventions.md for the spec)`);
  process.exit(0);
} else {
  console.error(`\nFAILED — ${failed} convention violation(s):\n`);
  for (const line of failures) {
    console.error(line);
  }
  console.error(`\nFix the violations above. The convention spec is at:`);
  console.error(`  docs/contributing/mcp-tool-conventions.md`);
  process.exit(1);
}
