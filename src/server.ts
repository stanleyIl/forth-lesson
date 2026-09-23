import { buildApp } from "./app.js";
import { ConfigurationError, loadConfig } from "./config.js";
import pg from "pg";

try {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const app = buildApp({ config, database: pool });
  app.addHook("onClose", async () => pool.end());
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(error.message);
  } else {
    console.error("CampusClaw failed to start");
  }
  process.exitCode = 1;
}
