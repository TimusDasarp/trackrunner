import bcrypt from "bcryptjs";
import { pool } from "./pool";

async function main() {
  const password = await bcrypt.hash("demo1234", 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, role, display_name)
     VALUES ($1,$2,'runner','Demo Runner'),
            ($3,$2,'dispatcher','Demo Dispatcher')
     ON CONFLICT (email) DO NOTHING`,
    ["runner@demo.local", password, "dispatcher@demo.local"]
  );

  // eslint-disable-next-line no-console
  console.log("[seed] users:");
  // eslint-disable-next-line no-console
  console.log("  runner@demo.local / demo1234");
  // eslint-disable-next-line no-console
  console.log("  dispatcher@demo.local / demo1234");
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed:", err);
  process.exit(1);
});
