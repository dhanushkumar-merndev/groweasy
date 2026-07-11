# ui
- All buttons must use useTransition hook for loading states, keeping button width stable during loading transitions with the loading animation centered inside the button. Confidence: 0.75
- Use yellow/orange gradient highlight with reduced opacity (not green) for AI-changed cells and description text to indicate higher token usage. Confidence: 0.85
- Use shadcn/ui chart wrapper components (ChartContainer, ChartTooltip, etc. from @/components/ui/chart.tsx) instead of raw Recharts components when building charts. Confidence: 0.70
- Do not nest a Button inside SheetTrigger — both render a <button> element, causing invalid HTML. Use a simple <button> style or pass render prop to avoid nesting. Confidence: 0.70
- For analytics/dashboard sidebar controls, use a Sheet drawer opened from a top-right trigger button (burger menu) rather than a persistent inline sidebar panel. Confidence: 0.65
- Chart card sizes (wide/medium/compact) should be data-driven based on the number of groups, not randomly cycled or hardcoded. Confidence: 0.65
- Chart variants (bar, pie, vertical_bar, horizontal_bar) should be data-driven based on column profile kind (time → vertical_bar, measure → bar, ≤4 groups → pie, else horizontal_bar), not all hardcoded to the same type. Confidence: 0.70
- For login page: Use the two-column layout with LoginShowcase component (60% left showcase, 40% right form), not a simplified single-column centered form. Confidence: 0.75
- Avoid useTransition for navigation-triggering buttons that live inside a Suspense boundary with a dynamic() import — startTransition resets Suspense to its fallback, causing skeleton flicker. Use plain useState for pending/loading state instead. Confidence: 0.70
