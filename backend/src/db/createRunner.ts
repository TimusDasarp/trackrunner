import bcrypt from "bcryptjs";
import { pool } from "./pool";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: ts-node src/db/createRunner.ts <email> <password> <displayName>");
    process.exit(1);
  }

  const [email, password, displayName] = args;
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role, display_name)
     VALUES ($1, $2, 'runner', $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, passwordHash, displayName]
  );

  if (result.rowCount === 0) {
    console.log(`Runner account already exists: ${email}`);
  } else {
    console.log(`Created runner account: ${email}`);
    console.log(`ID: ${result.rows[0].id}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Failed to create runner:", err);
  process.exit(1);
});
