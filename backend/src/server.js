import app from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`WorkforceIQ API listening on http://localhost:${env.port}`);
  console.log(`  ML service:  ${env.mlServiceUrl}`);
  console.log(`  RAG service: ${env.ragServiceUrl}`);
});
