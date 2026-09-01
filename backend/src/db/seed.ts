import bcrypt from "bcryptjs";
import { pool } from "./pool";

async function main() {
  const password = await bcrypt.hash("demo1234", 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, role, display_name, organization_id)
     VALUES ($1,$2,'runner','Demo Runner', (SELECT id FROM organizations WHERE slug = 'default')),
            ($3,$2,'runner','Runner One', (SELECT id FROM organizations WHERE slug = 'default')),
            ($4,$2,'runner','Runner Two', (SELECT id FROM organizations WHERE slug = 'default')),
            ($5,$2,'runner','Runner Three', (SELECT id FROM organizations WHERE slug = 'default')),
            ($6,$2,'dispatcher','Demo Dispatcher', (SELECT id FROM organizations WHERE slug = 'default'))
     ON CONFLICT (email) DO NOTHING`,
    ["runner@demo.local", password, "runner1@demo.local", "runner2@demo.local", "runner3@demo.local", "dispatcher@demo.local"]
  );


  await pool.query(
    `INSERT INTO runner_assignments (dispatcher_id, runner_id, organization_id)
     SELECT dispatcher.id, runner.id, dispatcher.organization_id
     FROM users dispatcher
     JOIN users runner ON runner.organization_id = dispatcher.organization_id
     WHERE dispatcher.email = $1
       AND runner.email = ANY($2)
     ON CONFLICT (dispatcher_id, runner_id) DO UPDATE SET active = true`,
    ["dispatcher@demo.local", ["runner@demo.local", "runner1@demo.local", "runner2@demo.local", "runner3@demo.local"]]
  );

  // eslint-disable-next-line no-console
  console.log("[seed] users:");
  // eslint-disable-next-line no-console
  console.log("  runner@demo.local / demo1234");
  console.log("  runner1@demo.local / demo1234");
  console.log("  runner2@demo.local / demo1234");
  console.log("  runner3@demo.local / demo1234");
  // eslint-disable-next-line no-console
  console.log("  dispatcher@demo.local / demo1234");
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed:", err);
  process.exit(1);
});
