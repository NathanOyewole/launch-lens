# Design System: LaunchLens

## Product Identity
- **Product:** LaunchLens — pre-token protocol radar with a value model and costed farm plans
- **Users:** crypto researchers, airdrop farmers, small allocators, launch hunters
- **Core action:** scan the ranked board, open a protocol, follow a costed farm plan
- **Visual direction:** dark, investigative, precise

## Color Tokens
- Background: `#0a0d12`
- Surface: `#121722`
- Surface raised: `#171e2b`
- Border: `#2a3140`
- Text primary: `#e8edf5`
- Text secondary: `#8e9aad`
- Accent: `#f6c85f`
- Accent dim: `#7a5f24`
- Destructive: `#fb7185`
- Success: `#4ade80`

## Typography
- Font family: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
- Scale: 11, 12, 13, 14, 16, 20, 26, 34
- Weights: 400, 500, 600, 700
- Line heights: 1.3 tight, 1.5 normal, 1.7 relaxed

## Spacing Scale
- 4, 8, 12, 16, 24, 32, 48, 64

## Layout
- Max width: 1100px
- Grid: 12 columns, 16px gap
- Breakpoints: 640, 768, 1024

## Border Radius
- sm: 4px, md: 8px, lg: 12px, full: 9999px

## Surface Treatments
- Cards: 1px solid border, no shadow, subtle hover border change to accent
- Board rows: alternating surface, 1px divider, no glow
- Focus: 2px accent ring with 2px offset

## Component Conventions
- Buttons: primary (accent background, dark text), secondary (bordered), ghost
- Inputs: dark surface, 1px border, visible focus ring
- Stat chips: bordered, mono, compact
- Table: header row sticky on desktop, horizontal scroll on mobile

## Animation Principles
- Duration: fast 150ms, normal 250ms
- Easing: ease-out for enter, ease-in-out for state changes
- Reduced motion: respect `prefers-reduced-motion`
- Animate only opacity and transform

## Accessibility
- WCAG AA contrast minimum
- Semantic sections, labelled controls, keyboard navigation
- Focus rings on all interactive elements
- Status region for board updates

## App Icon
- Source of truth: `docs/favicon.svg` — dark rounded square with an amber lens ring and center dot.
- No gradients, no glow, no shadows.

## Anti-Patterns to Avoid
- Generic AI SaaS dashboard
- Gradients, glassmorphism, neon glow
- Decorative icons without purpose
- Fake "alpha" or guaranteed-return claims
- Dense tables without mobile fallbacks
