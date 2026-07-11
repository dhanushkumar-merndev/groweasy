# configuration
- When changing .env values, comment out old configuration lines instead of deleting them. Confidence: 0.70

# typescript
- Use `declaration: false` in tsconfig for Express backends using pnpm to avoid TS2742 type inference errors during build. Confidence: 0.70
