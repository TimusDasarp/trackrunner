import bcrypt from "bcryptjs";
import { pool } from "./pool";

interface RunnerSpec {
  email: string;
  password: string;
  displayName: string;
}

const runners: RunnerSpec[] = [
  { email: "runner1@demo.local", password: "demo1234", displayName: "Runner One" },
  { email: "runner2@demo.local", password: "demo1234", displayName: "Runner Two" },
  { email: "runner3@demo.local", password: "demo1234", displayName: "Runner Three" },
];

async function main() {
  const hashedPasswordMap = new Map<string, string>();

  for (const runner of runners) {
    let passwordHash = hashedPasswordMap.get(runner.password);
    if (!passwordHash) {
      passwordHash = await bcrypt.hash(runner.password, 10);
      hashedPasswordMap.set(runner.password, passwordHash);
    }

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1, $2, 'runner', $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [runner.email, passwordHash, runner.displayName]
    );

    if (result.rowCount === 0) {
      console.log(`Runner already exists: ${runner.email}`);
    } else {
      console.log(`Created runner: ${runner.email} (ID ${result.rows[0].id})`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Failed to create runner batch:", err);
  process.exit(1);
});
