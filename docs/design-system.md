# Design system

## Direction

Cadence uses a warm-neutral canvas, graphite text and a restrained evergreen accent. The homepage has an editorial, two-column preparation-focused hero and a static description of the exact workflow. The wordmark has no decorative dot. There are no gradients, glow rings, decorative metric cards or fabricated AI activity. The goal is quiet, professional UI with clear content hierarchy.

## Typography

A platform-native system stack leads with Apple system fonts on Apple devices and Segoe UI on Windows, with Inter/Helvetica/Arial and language-aware Noto fallbacks. No runtime font CDN is used. Starting sizes: page heading 34 px; section heading 22 px; body 16 px with 1.6 line height; supporting text 14 px. Hero text scales fluidly for mobile.

## Color and surfaces

Colors, borders and shadows live in `client/src/tokens.css`. The palette is warm white (`#F7F8F5`), white surfaces, graphite (`#19201B`) and evergreen (`#2F6549`) with a soft sage tint. UI uses thin dividers, modest radii and no glow. Focus uses a clear outline, not a glowing shadow.

## Product screens

The dashboard includes a collapsible first-use guide that opens when the user has no sessions. Preparation has an offline, deterministic **Preparation Review** tool. It flags patterns for long/complex sentences, numeric expressions, acronyms and possible multiword names. Its results are explicitly heuristic and must be reviewed by the interpreter; the source text is not sent to a remote AI. A compact report can be inserted in open preparation questions, then saved through the existing Save preparation action.

## Interaction rules

Buttons and links provide hover, active and keyboard focus feedback. Every feature shown should do real work. Forms keep labels and hints; requests show saved/error state and preserve entered content after failure. Destructive account actions use explicit confirmation. Reduced-motion and forced-colors CSS remain supported.
