// Twin Part F4: latency and outcome per AI call in the LLM log. Safe to re-run.
//
//   npx tsx --env-file=.env.dev scripts/migrate-llm-latency.ts     # local
//   npx tsx --env-file=.env     scripts/migrate-llm-latency.ts     # production
import { client } from "../server/db";

async function run(sql: string): Promise<any> {
  const c: any = client;
  if (typeof c.exec === "function") return c.exec(sql);
  return c.query(sql);
}

async function main() {
  await run(`ALTER TABLE llm_call_log ADD COLUMN IF NOT EXISTS latency_ms integer;`);
  await run(`ALTER TABLE llm_call_log ADD COLUMN IF NOT EXISTS outcome text DEFAULT 'ok';`);
  console.log("llm log: latency_ms and outcome ready");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
