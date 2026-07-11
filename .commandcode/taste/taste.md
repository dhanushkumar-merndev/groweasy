# architecture
- Do not use local file/JSON storage for server state. Use Supabase (PostgreSQL) and Redis for persistent/cache storage, and IndexedDB for client-side state. Serverless platforms like Vercel have ephemeral filesystems. Confidence: 0.80

# logging
- Suppress/hide all logs in production environment. Only log in development. Confidence: 0.70
