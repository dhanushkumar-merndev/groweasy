# ui
See [ui/taste.md](ui/taste.md)
# architecture
- Only Groq and Command Code service are supported AI providers; remove Google API integration. Confidence: 0.65
# loading-skeletons
- Skeleton loading components must mirror the actual page layout structure they replace — not be generic placeholders. The skeleton should match the real page's card grid, table, chart, navigation, spacing patterns, and container boundaries (e.g., AppShell content area, not full-width when sidebar exists). Confidence: 0.80
- Use component-level skeletons nested inside AppShell/layout rather than Next.js loading.tsx route segment files, which cannot access the shared layout and will render full-width without sidebar/navigation. Confidence: 0.70
