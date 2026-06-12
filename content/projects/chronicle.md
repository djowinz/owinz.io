---
title: "Chronicle"
description: "A personal finance tracker that focuses on trends and patterns rather than transaction-level details."
purpose: "To help users understand their financial habits through visual patterns instead of overwhelming spreadsheets."
challenge: "Creating intuitive data visualizations that reveal insights without requiring financial expertise."
technologies:
  - React
  - D3.js
  - Node.js
  - MongoDB
category: Personal Finance
role: "Design, engineering"
status: "Shipped · v1.3"
platform: "Web"
order: 1
liveUrl: "https://chronicle.finance"
sourceUrl: "https://github.com/username/chronicle"
launchDate: "March 15, 2026"
---

## The Story

I've tried every budgeting app. Mint. YNAB. Personal Capital. Spreadsheets. They all failed me for the same reason: too much detail, not enough insight.

I don't need to know I spent $4.50 on coffee on Tuesday. I need to know if my coffee spending is trending up or down and whether it matters in the context of my overall finances.

Chronicle is the app I built to answer those questions.

### The Problem with Traditional Finance Apps

Most finance apps are glorified transaction lists. They'll tell you exactly where every penny went, but they won't tell you:
- Is this spending pattern sustainable?
- How does this month compare to the same month last year?
- What triggers my spending spikes?

Chronicle flips the paradigm. Transactions are there if you want them, but the default view is trends, patterns, and insights.

### Data Visualization Challenges

The hardest part of Chronicle was visualization design. Financial data is inherently complex, and most visualization approaches either:
- Oversimplify to the point of uselessness
- Overwhelm with too much information

I went through dozens of iterations, testing each with real users. Some findings:

**Pie charts are terrible for budgets.** People think they understand them, but they can't accurately compare slice sizes. I switched to horizontal bar charts — less sexy, far more readable.

**Color matters more than I thought.** Early versions used green for income and red for expenses. Users found this stressful. The current palette uses calming blues and grays, with color highlights only for anomalies.

**Animation should communicate, not decorate.** Every animation in Chronicle serves a purpose: showing temporal progression, indicating change direction, or drawing attention to outliers.

### The Technical Stack

MongoDB might seem like an unusual choice for financial data, but it's perfect for this use case:
- Transactions are stored as documents with flexible schemas
- Aggregation pipelines make trend calculations fast
- Time-series data patterns are well-supported

The D3.js visualizations are rendered on canvas for performance. SVG was beautiful but couldn't handle thousands of data points smoothly.

### Privacy First

Financial data is sensitive. Chronicle's approach:
- All data is encrypted at rest and in transit
- Bank connections use read-only access via Plaid
- We can't see your transactions — they're encrypted with user-specific keys

This added significant complexity, but it's non-negotiable for an app handling financial data.

### What Users Tell Me

The most common feedback: "I finally understand where my money goes."

That sentence makes every late night of debugging D3 transitions worth it.

### Looking Forward

The next major feature is collaborative budgeting for couples and households. The challenge: maintaining privacy while enabling shared visibility. It's harder than it sounds.
