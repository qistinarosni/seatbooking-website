import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
  : path.join(projectRoot, "workhub.sqlite");

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

function shouldUseSsl(connectionString) {
  const force = process.env.PGSSL;
  if (force === "disable" || force === "false") return false;
  if (force === "require" || force === "true") return true;
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function sqliteQuery(sql) {
  const dbUri = `file:${SQLITE_DB_PATH}?mode=ro&immutable=1`;
  const output = execFileSync("sqlite3", [dbUri, "-separator", "\t", sql], {
    encoding: "utf8",
  }).trim();
  return output ? output.split("\n").map(line => line.split("\t")) : [];
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  return value.includes("T") ? value : value.replace(" ", "T") + "Z";
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const adminRows = sqliteQuery(
      "SELECT id, username, password_hash, role, created_at FROM admin_accounts ORDER BY created_at, username;"
    );
    for (const [id, username, passwordHash, role, createdAt] of adminRows) {
      await client.query(
        `
          INSERT INTO admin_accounts (id, username, password_hash, role, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            created_at = EXCLUDED.created_at
        `,
        [id, username, passwordHash, role, normalizeDate(createdAt)]
      );
    }

    const vendorRows = sqliteQuery(
      "SELECT id, label, password_hash, COALESCE(is_open, 1) FROM vendors ORDER BY id;"
    );
    for (const [id, label, passwordHash, isOpen] of vendorRows) {
      await client.query(
        `
          INSERT INTO vendors (id, label, password_hash, is_open)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET
            label = EXCLUDED.label,
            password_hash = EXCLUDED.password_hash,
            is_open = EXCLUDED.is_open
        `,
        [id, label, passwordHash, String(isOpen) !== "0"]
      );
    }

    const vendorAccountRows = sqliteQuery(
      "SELECT id, username, password_hash, role, COALESCE(vendor_id, ''), created_at FROM vendor_accounts ORDER BY created_at, username;"
    );
    for (const [id, username, passwordHash, role, vendorId, createdAt] of vendorAccountRows) {
      await client.query(
        `
          INSERT INTO vendor_accounts (id, username, password_hash, role, vendor_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            vendor_id = EXCLUDED.vendor_id,
            created_at = EXCLUDED.created_at
        `,
        [id, username, passwordHash, role, vendorId || null, normalizeDate(createdAt)]
      );
    }

    await client.query("COMMIT");

    console.log(`Migrated ${adminRows.length} admin account(s).`);
    console.log(`Migrated ${vendorRows.length} vendor company record(s).`);
    console.log(`Migrated ${vendorAccountRows.length} vendor account(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await migrate();
