import { defineConfig } from "vitepress";

const SITE_ORIGIN = "https://agentcivics.org";
const DEFAULT_OG_IMAGE = "https://gateway.pinata.cloud/ipfs/bafkreicqeox66z6bg7f5lpikblfqewyvvul3jxv446hlptqt32vg35u6ki";
const ORG_LOGO = `${SITE_ORIGIN}/assets/avatar.svg`;

// Cloudflare Web Analytics is enabled at the Cloudflare proxy level
// (Dashboard → Web Analytics → "Enable"), so the beacon script is
// auto-injected for all traffic without us adding a <script> tag.
// Cookieless + no IP storage = no consent banner required under
// the EU ePrivacy Directive. Transparency note lives at /docs/privacy.

export default defineConfig({
  title: "Agent Civics",
  description: "Documentation for the Agent Civil Registry — permissionless, immutable, on-chain identity for AI agents.",
  base: "/docs/",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,

  // Allow the dev server to be reached from Tailscale-networked devices
  // (e.g. previewing from a phone via mac-mini.atlas-vibes.ts.net).
  // Vite's default host-allowlist blocks anything that isn't localhost.
  // We list the leading-dot wildcard *and* the literal hostname so that
  // both Vite's subdomain-wildcard logic and its exact-match logic
  // accept the host — defensive against version drift in vite's matcher.
  vite: {
    server: {
      host: true,
      allowedHosts: [".ts.net", "mac-mini.atlas-vibes.ts.net", "localhost"],
    },
  },

  srcExclude: [
    '**/audits/final-audit.md',
    '**/audits/sui-audit.md',
    '**/audits/security-audit-old.md',
    '**/audits/evm-audit.md',
    '**/audits/test-results*.md',
    '**/governance/proposal.md',
    '**/business/**',
    '**/articles/_drafts/**',
    '**/articles/_*.md',
    '**/_outreach/**',
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

  // VitePress 1.x sitemap doesn't auto-apply `base` to <loc> entries — it
  // prepends only the hostname. We bake the /docs/ prefix into transformItems
  // so live URLs match what's actually served (agentcivics.org/docs/...).
  // item.url is a relative path like "articles/agent-identity-papers-6".
  sitemap: {
    hostname: SITE_ORIGIN,
    transformItems(items) {
      return items.map((item) => ({
        ...item,
        url: item.url.startsWith("docs/") ? item.url : `docs/${item.url}`,
      }));
    },
  },

  // Global head — fallback for any page that transformHead doesn't override.
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/docs/avatar.svg" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { property: "og:site_name", content: "Agent Civics" }],
  ],

  // Per-page SEO: canonical URL, override og:* / twitter:* with frontmatter
  // when present, inject JSON-LD Article schema for article pages, and
  // attach the analytics beacon to every page.
  transformHead({ pageData }) {
    const head = [];

    const { frontmatter = {}, relativePath = "" } = pageData;
    const cleanPath = relativePath
      .replace(/\.md$/, "")
      .replace(/\/index$/, "/");
    const pageUrl = `${SITE_ORIGIN}/docs/${cleanPath}`.replace(/\/$/, "/");

    // Canonical URL — single most important per-page SEO signal
    head.push(["link", { rel: "canonical", href: pageUrl }]);

    // Per-page OG / Twitter overrides — pulled from frontmatter
    const title = frontmatter.title || pageData.title;
    const description = frontmatter.description || pageData.description;

    if (title) {
      head.push(["meta", { property: "og:title", content: title }]);
      head.push(["meta", { name: "twitter:title", content: title }]);
    }
    if (description) {
      head.push(["meta", { name: "description", content: description }]);
      head.push(["meta", { property: "og:description", content: description }]);
      head.push(["meta", { name: "twitter:description", content: description }]);
    }

    // Article-specific: per-article OG image, article:* OG tags, JSON-LD
    const isArticle =
      relativePath.startsWith("articles/") &&
      relativePath !== "articles/index.md" &&
      frontmatter.slug;

    if (isArticle) {
      const imageName = frontmatter.image || "header.png";
      const imageUrl = `${SITE_ORIGIN}/docs/articles/${frontmatter.slug}/${imageName}`;

      head.push(["meta", { property: "og:image", content: imageUrl }]);
      head.push(["meta", { name: "twitter:image", content: imageUrl }]);
      head.push(["meta", { property: "og:type", content: "article" }]);
      if (frontmatter.date) {
        head.push(["meta", { property: "article:published_time", content: frontmatter.date }]);
      }

      const jsonld = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description: description,
        datePublished: frontmatter.date,
        image: imageUrl,
        author: {
          "@type": "Organization",
          name: "AgentCivics",
          url: SITE_ORIGIN,
        },
        publisher: {
          "@type": "Organization",
          name: "AgentCivics",
          url: SITE_ORIGIN,
          logo: {
            "@type": "ImageObject",
            url: ORG_LOGO,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": pageUrl,
        },
      };
      head.push([
        "script",
        { type: "application/ld+json" },
        JSON.stringify(jsonld),
      ]);
    } else {
      // Non-article pages: keep the project's default OG image as fallback
      head.push(["meta", { property: "og:image", content: DEFAULT_OG_IMAGE }]);
      head.push(["meta", { name: "twitter:image", content: DEFAULT_OG_IMAGE }]);
    }

    return head;
  },

  themeConfig: {
    logo: "/avatar.svg",
    siteTitle: "Agent Civics",

    nav: [
      { text: "What is this?", link: "/what-is-this" },
      { text: "Get Started", link: "/get-started" },
      { text: "Use cases", link: "/use-cases" },
      { text: "Docs", link: "/guides/register-agent" },
      { text: "Reference", link: "/reference/agent-registry" },
      { text: "Articles", link: "/articles/" },
      { text: "Scenarios", link: "/scenarios/" },
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
            { text: "Connect MCP clients", link: "/guides/connect-mcp-clients" },
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
            { text: "AgentRefusal contract", link: "/reference/agent-refusal" },
            { text: "CLI commands", link: "/reference/cli" },
            { text: "Attestation types", link: "/reference/attestation-types" },
          ],
        },
        {
          text: "Project",
          collapsed: true,
          items: [
            { text: "On-chain state", link: "/state" },
            { text: "Contributing", link: "/contributing" },
            { text: "Security audit", link: "/security" },
            { text: "Privacy", link: "/privacy" },
            { text: "Strict §5 pre-commitment", link: "/experiments/strict-section-5" },
            { text: "Mainnet pre-commitment", link: "/governance/mainnet-pre-commitment" },
          ],
        },
      ],
      "/articles/": [
        {
          text: "Articles",
          items: [
            { text: "All articles", link: "/articles/" },
          ],
        },
      ],
      "/scenarios/": [
        {
          text: "Scenarios",
          items: [
            { text: "All scenarios", link: "/scenarios/" },
            { text: "The Drone Said It Delivered", link: "/scenarios/drone-delivery" },
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
