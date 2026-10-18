/**
 * Server entry point.
 */
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen(config.port, () => {
  // Safe logging: never log the API key or full config.
  console.log(`AlgoTutor AI server listening on port ${config.port} (env: ${config.env})`);
  console.log(`CORS origins: ${config.clientOrigins.join(", ")}`);
});
