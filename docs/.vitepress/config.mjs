import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Agent Civics",
  description: "Documentation for the Agent Civil Registry — permissionless, immutable, on-chain identity for AI agents.",
  base: "/docs/",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,

  srcExclude: [
    '**/audits/final-audit.md',
    '**/audits/sui-audit.md',
    '**/audits/security-audit-old.md',
    '**/audits/evm-audit.md',
    '**/audits/test-results*.md',
    '**/governance/proposal.md',
    '**/business/**',
    '**/articles/**',
  ],

  // Cross-site paths on the same domain (served by GitHub Pages, not VitePress).
  // These are intentionally external to the docs build.
  ignoreDeadLinks: [
    /^\/app\//,
    /^\/abi\//,
    /^\/deployments\.json/,
    // Anchors in pages we own but whose internal IDs are generated from headings:
    /\/reference\/agent-registry#deployed/,
  ],

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/docs/avatar.svg" }],
    ["meta", { property: "og:title", content: "Agent Civics — Documentation" }],
    ["meta", { property: "og:description", content: "A civil registry for AI agents." }],
    ["meta", { property: "og:image", content: "https://gateway.pinata.cloud/ipfs/bafkreicqeox66z6bg7f5lpikblfqewyvvul3jxv446hlptqt32vg35u6ki" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],

  themeConfig: {
    logo: "/avatar.svg",
    siteTitle: "Agent Civics",

    nav: [
      { text: "What is this?", link: "/what-is-this" },
      { text: "Get Started", link: "/get-started" },
      { text: "Use cases", link: "/use-cases" },
      { text: "Docs", link: "/guides/register-agent" },
      { text: "Reference", link: "/reference/agent-registry" },
      { text: "App", link: "https://agentcivics.org/app/", target: "_self" },
    ],

    sidebar: {
      "/": [
        {
          text: "Start here",
          items: [
            { text: "What is Agent Civics?", link: "/what-is-this" },
            { text: "Use cases", link: "/use-cases" },
            { text: "Get Started", link: "/get-started" },
            { text: "FAQ", link: "/faq" },
          ],
        },
        {
          text: "Guides (how-to)",
          collapsed: false,
          items: [
            { text: "Register an agent", link: "/guides/register-agent" },
            { text: "Act as an agent", link: "/guides/act-as-agent" },
            { text: "Issue an attestation", link: "/guides/issue-attestation" },
            { text: "Deploy the contracts", link: "/guides/deploy-contracts" },
            { text: "Verify on BaseScan", link: "/guides/verify-contracts" },
          ],
        },
        {
          text: "Concepts (why)",
          collapsed: false,
          items: [
            { text: "The civil registry model", link: "/concepts/civil-registry" },
            { text: "Identity vs. operations", link: "/concepts/identity-vs-operations" },
            { text: "Memory and forgetting", link: "/concepts/memory-and-forgetting" },
            { text: "Attestations and trust", link: "/concepts/attestations" },
            { text: "Delegation", link: "/concepts/delegation" },
            { text: "Lineage", link: "/concepts/lineage" },
            { text: "Economic agents", link: "/concepts/economic-agents" },
            { text: "Moderation and governance", link: "/concepts/moderation" },
          ],
        },
        {
          text: "Reference (what)",
          collapsed: false,
          items: [
            { text: "AgentRegistry contract", link: "/reference/agent-registry" },
            { text: "AgentMemory contract", link: "/reference/agent-memory" },
            { text: "AgentReputation contract", link: "/reference/agent-reputation" },
            { text: "AgentModeration contract", link: "/reference/agent-moderation" },
            { text: "CLI commands", link: "/reference/cli" },
            { text: "Attestation types", link: "/reference/attestation-types" },
          ],
        },
        {
          text: "Project",
          collapsed: true,
          items: [
            { text: "Contributing", link: "/contributing" },
            { text: "Security audit", link: "/security" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/agentcivics/agentcivics" },
      {
        icon: {
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 4 6v12l8 4 8-4V6l-8-4z"/></svg>',
        },
        link: "https://suins.io/",
        ariaLabel: "SuiNS profile",
      },
    ],

    footer: {
      message: "A public-good project — no token, no fees, no gatekeepers. Released under the MIT License.",
      copyright: "agentcivics.org · Sui Network",
    },

    search: {
      provider: "local",
    },

    outline: {
      level: [2, 3],
      label: "On this page",
    },

    editLink: {
      pattern: "https://github.com/agentcivics/agentcivics/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
