import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.MEETINGS_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('app_idea_enrichment','app_idea_enrichment_reference')
     ORDER BY table_name`
  );
  const found = rows.map((r) => r.table_name);
  const expected = ["app_idea_enrichment", "app_idea_enrichment_reference"];
  const missing = expected.filter((t) => !found.includes(t));
  if (missing.length) {
    console.error("MISSING tables:", missing);
    process.exit(1);
  }
  console.log("OK: enrichment tables present:", found.join(", "));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
