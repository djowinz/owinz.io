---
title: "Syntax"
description: "A code snippet manager with intelligent search and organization, built for developers who value their time."
purpose: "To solve the problem of losing valuable code snippets across different projects and platforms."
challenge: "Building a fast, fuzzy search algorithm that could handle thousands of snippets while providing instant results."
technologies:
  - Next.js
  - Prisma
  - PostgreSQL
  - Tailwind CSS
category: Tooling
liveUrl: "https://syntax.dev"
sourceUrl: "https://github.com/username/syntax"
launchDate: "March 15, 2023"
---

## The Story

Every developer has been there: you solved a tricky problem once, you know you wrote code for it somewhere, but you can't find it. Was it in that old project? A GitHub gist? A Stack Overflow answer you bookmarked?

Syntax exists to end that frustration.

### Origin

The idea came during a late-night debugging session. I needed a regex pattern I had written months ago. I knew exactly what it did. I had no idea where it lived.

After 45 minutes of searching through old repositories, I found it. And then I immediately started building Syntax.

### The Search Problem

The core of Syntax is search. But not just any search — it had to be:

- **Fast**: Results in under 100ms, always
- **Fuzzy**: Find snippets even with typos or partial recall
- **Smart**: Understand that "auth" and "authentication" are related

I evaluated several approaches:
- Full-text PostgreSQL search (too slow for fuzzy matching)
- Elasticsearch (overkill for this use case)
- Algolia (great but expensive)

The solution was a custom implementation using trigram indexing in PostgreSQL combined with a client-side pre-filter. The database handles the heavy lifting; the client handles the UI responsiveness.

### Organization Without Friction

Tags and folders are obvious organizational tools, but they require upfront work. Most people (myself included) won't take time to categorize every snippet.

Syntax's approach is different:
1. Auto-extract language from syntax highlighting
2. Suggest tags based on content analysis
3. Allow organization later, when you have more context

The result: capturing a snippet takes 5 seconds. Organizing is optional and can happen anytime.

### The Editor

Choosing the right code editor component was crucial. I evaluated:
- CodeMirror (powerful but heavy)
- Monaco (VS Code's editor, also heavy)
- PrismJS + contenteditable (lightweight but hacky)

I landed on CodeMirror with aggressive lazy loading. The editor only fully initializes when you're actually editing, keeping initial page load fast.

### Lessons Learned

Building Syntax reinforced something I believe deeply: **developer tools should be invisible**. The best tool is one you don't think about. It just works.

I've caught myself using Syntax dozens of times a day without consciously deciding to. That's the goal.

### Future Plans

I'm working on a CLI tool that lets you save snippets without leaving the terminal. Because sometimes even opening a browser is too much friction.
