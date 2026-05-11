# Medium cross-post checklist

The canonical home for every article is `agentcivics.org/docs/articles/<slug>`. Medium is a downstream distribution channel — copy-paste is the realistic flow, but the steps below take ~5 minutes once the article is published on the site.

## Before you start

The article must already be live at `agentcivics.org/docs/articles/<slug>` (i.e. `scripts/publish-article.mjs` ran and the pages deploy succeeded). All images you reference in the markdown must be loading on that URL.

## Steps

### 1. Create the new Medium story

- Title: copy the `title:` from the article's front matter, verbatim
- Subtitle: copy the `description:` from front matter
- Tags: pick 5, e.g. `AI Agents`, `Blockchain`, `Identity`, `Web3`, `Sui`
- Status: keep as draft until step 5

### 2. Header image

The Medium editor's header image upload is manual — there is no API. Open the `header.png` from `docs/public/articles/<slug>/` in Finder and drag it into Medium's "Add an image" slot at the top of the story.

If the article doesn't have a `header.png`, look at the article's first `![...](...)` reference — that's usually what should be the header on Medium.

### 3. Body

Paste the article body (everything after the front matter `---` block). Medium accepts Markdown-via-paste for headings, lists, code blocks, and emphasis. For each inline image:

- The markdown reference is `![alt](/articles/<slug>/<asset>.png)` — Medium will not resolve that path on its own
- Drag the corresponding PNG from `docs/public/articles/<slug>/` into Medium at the same position
- Add the alt text as Medium's caption

### 4. Set canonical URL (important)

In Medium's story settings (the ⚙ icon), set the **canonical URL** to:

```
https://agentcivics.org/docs/articles/<slug>
```

This tells search engines that the agentcivics.org version is the original, preventing the Medium post from outranking your own site. Skipping this step trades long-term SEO for short-term Medium readership — not worth it.

### 5. Publish + share

Publish on Medium, then share the **Medium URL** to X/Reddit/Discord. The canonical link in the post header ensures readers who follow your shares can land on either, and search engines route credit back to your site.

## What we don't try to automate

The Medium API was effectively closed to new tokens in 2023. Selenium/Puppeteer scrapers against medium.com violate ToS and break frequently. Manual cross-post is the stable answer.

If Medium becomes more of a bottleneck than this checklist accounts for, the right move is to deprecate Medium as a channel — not to spend engineering time on automation that will break.
