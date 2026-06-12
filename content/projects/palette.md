---
title: "Palette"
description: "An AI-powered color scheme generator for designers and developers seeking harmonious color combinations."
purpose: "To eliminate the guesswork from color selection by leveraging color theory principles and machine learning."
challenge: "Training a model to understand the subjective nature of 'aesthetic appeal' across different cultural contexts."
technologies:
  - Python
  - TensorFlow
  - FastAPI
  - Vue.js
category: Color Tooling
role: "Design, ML, frontend"
status: "Shipped"
platform: "Web"
order: 3
liveUrl: "https://palette.design"
sourceUrl: "https://github.com/username/palette"
launchDate: "March 15, 2024"
---

## The Story

Color is deceptively complex. We think we understand it — red is warm, blue is cool — but creating a harmonious palette that works across an entire application? That's an art form most of us haven't mastered.

Palette was my attempt to democratize color expertise.

### The Spark

The idea came from a client project where I spent three days — three full days — picking a color scheme. I tried every tool available. Adobe Color. Coolors. Color Hunt.

They all generated palettes, but none could tell me if a palette would actually work for a dashboard, or a marketing site, or a mobile app. Context matters, and these tools ignored it.

### The Data Challenge

To train a model that understands "good" colors, I needed data. But how do you quantify aesthetic appeal?

My approach:
1. Scraped 50,000+ color palettes from design communities
2. Gathered engagement metrics as a proxy for quality
3. Labeled palettes with their use cases (web, mobile, print, etc.)
4. Conducted user studies to validate the proxy metrics

The data pipeline alone took three months to build.

### The Model

I experimented with several approaches:

**Rule-based systems** worked for basic harmony but couldn't capture the nuance of great palettes. Following color theory rules gives you "correct" colors, not "beautiful" ones.

**GANs (Generative Adversarial Networks)** produced creative results but were inconsistent. Great for exploration, not for reliable generation.

**The final approach** combined a VAE (Variational Autoencoder) for generation with a discriminator trained on the labeled data. The VAE ensures smooth, explorable color spaces; the discriminator ensures quality.

### Making It Usable

A powerful model means nothing if users can't interact with it meaningfully. The interface went through extensive testing:

**Early version**: Slider-based inputs for hue, saturation, brightness. Precise but overwhelming.

**Current version**: Natural language inputs ("create a calm, professional palette for a healthcare app") combined with a grid of generated options. Less precise, far more accessible.

### Cultural Context

One fascinating rabbit hole: color preferences vary dramatically across cultures. Red means luck in China, danger in the West. White means purity in Western weddings, mourning in Eastern funerals.

Palette doesn't fully solve this, but it does allow users to specify cultural context as an input, which biases the generation accordingly.

### What Surprised Me

The model's failures were as interesting as its successes. It struggled with:
- Neon palettes (rare in training data)
- Monochromatic schemes (not enough variation to learn from)
- Accessibility requirements (different objective than aesthetics)

I added post-processing rules for these edge cases. Sometimes ML isn't the answer.

### Impact

Palette is now used by over 5,000 designers monthly. But the metric I'm proudest of: average palette generation time dropped from 45 minutes (with traditional tools) to 3 minutes (with Palette).

That's time designers can spend on work that actually requires human creativity.
