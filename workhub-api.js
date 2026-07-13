import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const TOKEN_SECRET = process.env.TOKEN_SECRET ?? "change-this-secret-before-production";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const CORS_ALLOWLIST = CORS_ORIGIN.split(",").map(value => value.trim()).filter(Boolean);
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE ?? "Asia/Kuala_Lumpur";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO ?? "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required. This backend now runs on Postgres.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

pool.on("error", error => {
  console.error("Postgres pool error:", error);
});

const POSTGRES_SCHEMA_SQL = readFileSync(new URL("./workhub-schema.postgres.sql", import.meta.url), "utf8");

const ZONES = {
  focus: { label: "Focus Pod" },
  discussion: { label: "Discussion Table" },
  room: { label: "Discussion Room" },
};

const FOCUS_SEAT_IDS = [
  ...Array.from({ length: 4 }, (_, i) => `FL${i + 1}`),
  ...Array.from({ length: 2 }, (_, i) => `FC${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `FR${i + 1}`),
  ...Array.from({ length: 2 }, (_, i) => `L2A${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `L2B${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `L2R${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `PR${i + 1}`),
];
const DISCUSSION_SEAT_IDS = Array.from({ length: 4 }, (_, i) => `D${i + 1}`);
const ROOM_SEAT_ID = "DR";
const VALID_SEAT_IDS = new Set([...FOCUS_SEAT_IDS, ...DISCUSSION_SEAT_IDS, ROOM_SEAT_ID]);
const DISCUSSION_SEAT_RE = /^D[1-4]$/;

const SEAT_CATALOG = [
  ...Array.from({ length: 4 }, (_, i) => ({ id: `FL${i + 1}`, label: `L${i + 1}`, zone: "focus" })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `FC${i + 1}`, label: `C${i + 1}`, zone: "focus" })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `FR${i + 1}`, label: `R${i + 1}`, zone: "focus" })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `L2A${i + 1}`, label: `Ahead ${i + 1}`, zone: "focus" })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `L2B${i + 1}`, label: `Upper ${i + 1}`, zone: "focus" })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `L2R${i + 1}`, label: `Right ${i + 1}`, zone: "focus" })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `PR${i + 1}`, label: `Private ${i + 1}`, zone: "focus" })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `D${i + 1}`, label: `Table ${i + 1}`, zone: "discussion" })),
  { id: ROOM_SEAT_ID, label: "Whole Room", zone: "room" },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function shouldUseSsl(connectionString) {
  const force = process.env.PGSSL;
  if (force === "disable" || force === "false") return false;
  if (force === "require" || force === "true") return true;
  return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
}

function originMatches(rule, origin) {
  if (rule === "*") return true;
  if (!rule.includes("*")) return rule === origin;
  const pattern = new RegExp(`^${rule.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return pattern.test(origin);
}

function resolveCorsOrigin(req) {
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) return CORS_ALLOWLIST[0] ?? "*";
  if (CORS_ALLOWLIST.some(rule => originMatches(rule, requestOrigin))) return requestOrigin;
  return CORS_ALLOWLIST.includes("*") ? "*" : "";
}

function send(req, res, status, body) {
  const allowedOrigin = resolveCorsOrigin(req);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    vary: "Origin",
  };
  if (allowedOrigin) headers["access-control-allow-origin"] = allowedOrigin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 5_000_000) reject(new HttpError(413, "Request body is too large."));
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, "Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${label} is required.`);
  return value.trim();
}

function int(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  }
  return value;
}

function date(value) {
  const result = text(value, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new HttpError(400, "date must use YYYY-MM-DD format.");
  return result;
}

function cents(value) {
  return value / 100;
}

function getPriceCents(zone, duration) {
  if (zone === "focus") return (duration >= 6 ? 333 : duration >= 3 ? 400 : 500) * duration;
  if (zone === "discussion") return 1000 * duration;
  if (zone === "room") return (duration >= 4 ? 2500 : 3500) * duration;
  throw new HttpError(400, "Unknown booking zone.");
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  })).toString("base64url");
  const sig = createHmac("sha256", TOKEN_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) throw new HttpError(401, "Missing or invalid token.");
  const expected = createHmac("sha256", TOKEN_SECRET).update(`${header}.${body}`).digest("base64url");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new HttpError(401, "Missing or invalid token.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new HttpError(401, "Token expired.");
  return payload;
}

function auth(req) {
  const header = req.headers.authorization ?? "";
  return verifyToken(header.startsWith("Bearer ") ? header.slice(7) : "");
}

function canonicalAdminRole(role) {
  if (role === "super") return "superadmin";
  if (role === "reception") return "admin";
  return role;
}

function seatById(seatId) {
  return SEAT_CATALOG.find(item => item.id === seatId) ?? null;
}

function isRollingZone(zone) {
  return zone === "focus" || zone === "discussion";
}

function serializeTimestamp(value) {
  if (!value) return value ?? null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseDbTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function addHours(dateValue, hours) {
  return new Date(dateValue.getTime() + hours * 3600000);
}

function scheduledStartDate(dateValue, startHour) {
  return new Date(`${dateValue}T${String(startHour).padStart(2, "0")}:00:00+08:00`);
}

function bookingStartDate(row) {
  return row.start_at ? parseDbTimestamp(row.start_at) : scheduledStartDate(row.date, row.start_hour);
}

function bookingEndDate(row) {
  return addHours(bookingStartDate(row), row.duration);
}

function formatHour(hour) {
  if (hour === 12) return "12:00 PM";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

function formatClock(value) {
  return value.toLocaleTimeString("en-MY", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  return `RM ${cents(value).toFixed(2)}`;
}

function seatDisplay(seatId) {
  const seat = seatById(seatId);
  if (!seat) return seatId;
  const zone = ZONES[seat.zone]?.label ?? seat.zone;
  return `${zone} - ${seat.label}`;
}

function bookingRow(row) {
  return {
    ref: row.ref,
    seatId: row.seat_id,
    date: row.date,
    startHour: row.start_hour,
    startAt: serializeTimestamp(row.start_at),
    duration: row.duration,
    name: row.name,
    email: row.email,
    phone: row.phone,
    paidAt: serializeTimestamp(row.paid_at),
    status: row.status,
    checkInAt: serializeTimestamp(row.check_in_at),
    subtotal: cents(row.subtotal_cents),
    serviceFee: cents(row.service_fee_cents),
    total: cents(row.total_cents),
  };
}

function activityRow(row) {
  return {
    id: row.id,
    adminId: row.admin_id,
    adminUsername: row.admin_username,
    adminRole: canonicalAdminRole(row.admin_role),
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details_json ? JSON.parse(row.details_json) : {},
    createdAt: serializeTimestamp(row.created_at),
  };
}

function vendorRow(row) {
  return {
    id: row.id,
    label: row.label,
    isOpen: Boolean(row.is_open),
  };
}

function countRowValue(row) {
  return Number(row?.count ?? 0);
}

function normalizeSql(sql, params = []) {
  let nextSql = sql.trim().replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(nextSql)) {
    nextSql = nextSql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i, "INSERT INTO ");
    nextSql = `${nextSql} ON CONFLICT DO NOTHING`;
  }

  const isNamed = params && typeof params === "object" && !Array.isArray(params);
  const values = [];

  if (isNamed) {
    nextSql = nextSql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => {
      if (!(key in params)) throw new Error(`Missing SQL parameter @${key}`);
      values.push(params[key]);
      return `$${values.length}`;
    });
  } else {
    const list = params === undefined ? [] : Array.isArray(params) ? params : [params];
    let index = 0;
    nextSql = nextSql.replace(/\?/g, () => {
      if (index >= list.length) throw new Error("Missing SQL positional parameter.");
      values.push(list[index]);
      index += 1;
      return `$${values.length}`;
    });
  }

  return { text: nextSql, values };
}

async function dbQuery(sql, params = [], client = pool) {
  const statement = normalizeSql(sql, params);
  return client.query(statement.text, statement.values);
}

async function dbGet(sql, params = [], client = pool) {
  const result = await dbQuery(sql, params, client);
  return result.rows[0] ?? null;
}

async function dbAll(sql, params = [], client = pool) {
  const result = await dbQuery(sql, params, client);
  return result.rows;
}

async function dbRun(sql, params = [], client = pool) {
  const result = await dbQuery(sql, params, client);
  return { changes: result.rowCount ?? 0, rows: result.rows };
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function syncSeatCatalog(client = pool) {
  for (const seat of SEAT_CATALOG) {
    await dbRun(
      "INSERT INTO seats (id, label, zone) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING",
      [seat.id, seat.label, seat.zone],
      client
    );
  }
}

async function bootstrapDatabase() {
  await pool.query(POSTGRES_SCHEMA_SQL);
  await seed();
}

async function admin(req, roles = ["superadmin", "admin"]) {
  const payload = auth(req);
  if (payload.type !== "admin") throw new HttpError(403, "Admin access required.");
  const account = await dbGet("SELECT id, username, role FROM admin_accounts WHERE id = ?", [payload.id]);
  if (!account) throw new HttpError(401, "Admin account not found.");
  const normalized = {
    ...payload,
    id: account.id,
    username: account.username,
    role: canonicalAdminRole(account.role),
  };
  if (!roles.map(canonicalAdminRole).includes(normalized.role)) throw new HttpError(403, "Admin access required.");
  return normalized;
}

async function vendor(req, roles = ["superadmin", "vendor"]) {
  const payload = auth(req);
  if (payload.type !== "vendor") throw new HttpError(403, "Vendor access required.");
  const account = await dbGet("SELECT id, username, role, vendor_id FROM vendor_accounts WHERE id = ?", [payload.id]);
  if (!account) throw new HttpError(401, "Vendor account not found.");
  const normalized = {
    ...payload,
    id: account.id,
    username: account.username,
    role: account.role,
    vendor: account.vendor_id ?? null,
  };
  if (!roles.includes(normalized.role)) throw new HttpError(403, "Vendor access required.");
  return normalized;
}

async function vendorLabel(vendorId) {
  const row = await dbGet("SELECT label FROM vendors WHERE id = ?", [vendorId]);
  return row?.label ?? vendorId;
}

async function vendorById(vendorId) {
  const row = await dbGet("SELECT id, label, is_open FROM vendors WHERE id = ?", [vendorId]);
  return row ? vendorRow(row) : null;
}

async function vendorAccountRow(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    vendorId: row.vendor_id ?? null,
    vendorLabel: row.vendor_id ? await vendorLabel(row.vendor_id) : null,
    createdAt: serializeTimestamp(row.created_at),
  };
}

async function menuRow(row) {
  const vendorInfo = await vendorById(row.vendor);
  return {
    id: row.id,
    name: row.name,
    price: cents(row.price_cents),
    vendor: row.vendor,
    vendorLabel: vendorInfo?.label ?? await vendorLabel(row.vendor),
    vendorOpen: vendorInfo?.isOpen ?? true,
    category: row.category,
    description: row.description ?? "",
    available: Boolean(row.available),
    imageUrl: row.image_url ?? "",
  };
}

async function logActivity(actor, action, targetType, targetId, details = {}, client = pool) {
  if (!actor?.id) return;
  await dbRun(`
    INSERT INTO activity_logs (
      admin_id, admin_username, admin_role, action, target_type, target_id, details_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [actor.id, actor.username, canonicalAdminRole(actor.role), action, targetType, targetId, JSON.stringify(details)], client);
}

function bookingEmailContent(row) {
  const seat = seatById(row.seat_id);
  const start = bookingStartDate(row);
  const end = bookingEndDate(row);
  const subject = `Your Quety Study Lounge booking ${row.ref}`;
  const body = [
    `Hi ${row.name},`,
    "",
    "Your booking is confirmed.",
    "",
    `Booking reference / QR code: ${row.ref}`,
    `Seat: ${seatDisplay(row.seat_id)}`,
    `Date: ${row.date}`,
    `Time: ${row.start_at && seat && isRollingZone(seat.zone) ? `${formatClock(start)} - ${formatClock(end)}` : `${formatHour(row.start_hour)} - ${formatHour(row.start_hour + row.duration)}`}`,
    `Duration: ${row.duration}h`,
    `Total paid: ${formatMoney(row.total_cents)}`,
    "",
    "Show this QR code/reference at reception for verification.",
  ].join("\n");
  return { subject, body };
}

async function deliverEmail({ to, subject, body }) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.log(`Mock email prepared for ${to}`);
    console.log(subject);
    console.log(body);
    return { ok: true, mode: "mock", to, subject, sentAt: new Date().toISOString() };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      text: body,
      ...(EMAIL_REPLY_TO ? { reply_to: EMAIL_REPLY_TO } : {}),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Email provider rejected the request.");
  return { ok: true, mode: "resend", to, subject, id: data.id, sentAt: new Date().toISOString() };
}

async function sendBookingConfirmation(row) {
  const content = bookingEmailContent(row);
  try {
    return await deliverEmail({ to: row.email, ...content });
  } catch (error) {
    console.error(`Confirmation email failed for ${row.ref}:`, error.message);
    return { ok: false, mode: RESEND_API_KEY && EMAIL_FROM ? "resend" : "mock", to: row.email, error: error.message };
  }
}

async function expireOldSessions() {
  const now = Date.now();
  const rows = await dbAll(`
    SELECT ref, date, start_hour, start_at, duration, status, check_in_at
    FROM bookings
    WHERE status IN ('paid', 'active', 'payment_pending')
  `);

  for (const row of rows) {
    if (bookingEndDate(row).getTime() > now) continue;
    if (row.check_in_at) {
      await dbRun("UPDATE bookings SET status = 'completed' WHERE ref = ?", [row.ref]);
    } else {
      await dbRun("UPDATE bookings SET status = 'expired' WHERE ref = ?", [row.ref]);
    }
  }
}

async function uniqueRef(prefix, table, column, client = pool) {
  for (let i = 0; i < 20; i += 1) {
    const value = `${prefix}-${randomInt(1000, 9999)}`;
    if (!await dbGet(`SELECT 1 FROM ${table} WHERE ${column} = ?`, [value], client)) return value;
  }
  throw new HttpError(500, "Could not create a unique reference.");
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function requestedWindow(dateValue, startHour, duration) {
  if (startHour === null) {
    const start = new Date();
    return { start, end: addHours(start, duration) };
  }
  const start = scheduledStartDate(dateValue, startHour);
  return { start, end: addHours(start, duration) };
}

async function overlappingSeatIds(window, client = pool) {
  const occupied = new Set();
  const rows = await dbAll(`
    SELECT seat_id, date, start_hour, start_at, duration, status
    FROM bookings
    WHERE status IN ('payment_pending', 'paid', 'active')
  `, [], client);

  for (const row of rows) {
    if (overlaps(bookingStartDate(row), bookingEndDate(row), window.start, window.end)) {
      occupied.add(row.seat_id);
    }
  }
  return occupied;
}

async function bookingConflicts(seatId, window, client = pool) {
  const occupied = await overlappingSeatIds(window, client);
  if (seatId === "DR") return [...occupied].some(id => id === "DR" || DISCUSSION_SEAT_RE.test(id));
  if (DISCUSSION_SEAT_RE.test(seatId)) return occupied.has(seatId) || occupied.has("DR");
  return occupied.has(seatId);
}

function businessNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minute: Number(parts.minute) };
}

function dateOffsetDays(dateValue, todayValue) {
  const target = new Date(`${dateValue}T00:00:00Z`);
  const today = new Date(`${todayValue}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function validateBookingWindow(seat, dateValue, startHour, duration, now) {
  const dayOffset = dateOffsetDays(dateValue, now.date);
  if (seat.zone === "room") {
    if (!Number.isInteger(startHour)) throw new HttpError(400, "Please choose a start time for the whole discussion room.");
    if (startHour <= now.hour && dayOffset === 0) throw new HttpError(400, "Please choose a future time slot.");
    if (dayOffset < 0 || dayOffset > 3) throw new HttpError(400, "The discussion room can only be booked up to 3 days ahead.");
    return;
  }
  if (dayOffset !== 0) throw new HttpError(400, "Focus pods and discussion tables are only available for today.");
  const endHour = now.hour + duration;
  if (endHour > 22 || (endHour === 22 && now.minute > 0)) {
    throw new HttpError(400, "This booking would run past closing time at 10:00 PM.");
  }
}

async function createBooking(body) {
  await syncSeatCatalog();
  const seatId = text(body.seatId, "seatId").toUpperCase();
  if (!VALID_SEAT_IDS.has(seatId)) throw new HttpError(404, "Seat not found.");
  const dateValue = date(body.date);
  const startHour = body.startHour === null || body.startHour === undefined || body.startHour === ""
    ? null
    : int(body.startHour, "startHour", 8, 21);
  const duration = int(body.duration, "duration", 1, 8);
  const name = text(body.name, "name");
  const email = text(body.email, "email").toLowerCase();
  const phone = text(body.phone, "phone");
  if (!email.includes("@")) throw new HttpError(400, "email must be valid.");

  const seat = await dbGet("SELECT * FROM seats WHERE id = ?", [seatId]) ?? seatById(seatId);
  if (!seat) throw new HttpError(404, "Seat not found.");
  const now = businessNow();
  validateBookingWindow(seat, dateValue, startHour, duration, now);
  if (seat.zone === "room" && startHour + duration > 22) throw new HttpError(400, "Booking must end by 10:00 PM.");

  const subtotal = getPriceCents(seat.zone, duration);
  const fee = 0;
  const total = subtotal + fee;
  const effectiveStartHour = seat.zone === "room" ? startHour : now.hour;
  const window = requestedWindow(dateValue, seat.zone === "room" ? startHour : null, duration);

  const ref = await withTransaction(async client => {
    const nextRef = await uniqueRef("CW", "bookings", "ref", client);
    if (await bookingConflicts(seatId, window, client)) {
      throw new HttpError(409, "That seat is already booked for this time.");
    }
    await dbRun(`
      INSERT INTO bookings (ref, seat_id, date, start_hour, start_at, duration, name, email, phone, paid_at, status, subtotal_cents, service_fee_cents, total_cents)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'payment_pending', ?, ?, ?)
    `, [nextRef, seatId, dateValue, effectiveStartHour, duration, name, email, phone, subtotal, fee, total], client);
    return nextRef;
  });

  const saved = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  return bookingRow(saved);
}

async function createMockBooking(body) {
  await syncSeatCatalog();
  const seatId = text(body.seatId, "seatId").toUpperCase();
  if (!VALID_SEAT_IDS.has(seatId)) throw new HttpError(404, "Seat not found.");
  const dateValue = date(body.date);
  const startHour = body.startHour === null || body.startHour === undefined || body.startHour === ""
    ? null
    : int(body.startHour, "startHour", 8, 21);
  const duration = int(body.duration, "duration", 1, 8);
  const name = text(body.name, "name");
  const email = text(body.email, "email").toLowerCase();
  const phone = text(body.phone, "phone");
  const ref = typeof body.ref === "string" && /^CW-\d{4}$/.test(body.ref.toUpperCase())
    ? body.ref.toUpperCase()
    : await uniqueRef("CW", "bookings", "ref");
  if (!email.includes("@")) throw new HttpError(400, "email must be valid.");

  const seat = await dbGet("SELECT * FROM seats WHERE id = ?", [seatId]) ?? seatById(seatId);
  if (!seat) throw new HttpError(404, "Seat not found.");
  const now = businessNow();
  validateBookingWindow(seat, dateValue, startHour, duration, now);
  if (seat.zone === "room" && startHour + duration > 22) throw new HttpError(400, "Booking must end by 10:00 PM.");

  const subtotal = getPriceCents(seat.zone, duration);
  const fee = 0;
  const total = subtotal + fee;
  const effectiveStartHour = seat.zone === "room" ? startHour : now.hour;
  const window = requestedWindow(dateValue, seat.zone === "room" ? startHour : null, duration);

  await withTransaction(async client => {
    const existing = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref], client);
    if (existing) return;
    if (await bookingConflicts(seatId, window, client)) {
      throw new HttpError(409, "That seat is already booked for this time.");
    }
    await dbRun(`
      INSERT INTO bookings (ref, seat_id, date, start_hour, start_at, duration, name, email, phone, paid_at, status, subtotal_cents, service_fee_cents, total_cents)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'payment_pending', ?, ?, ?)
    `, [ref, seatId, dateValue, effectiveStartHour, duration, name, email, phone, subtotal, fee, total], client);
  });

  const saved = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  return bookingRow(saved);
}

async function sendBookingEmail(ref, body) {
  const booking = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  if (!booking) throw new HttpError(404, "Booking not found.");
  const fallback = bookingEmailContent(booking);
  const subject = text(body.subject ?? fallback.subject, "subject");
  const message = text(body.body ?? fallback.body, "body");
  return deliverEmail({ to: booking.email, subject, body: message });
}

async function listBookings(params) {
  await expireOldSessions();
  const filters = [];
  const args = {};
  if (params.get("date")) {
    filters.push("date = @date");
    args.date = params.get("date");
  }
  if (params.get("status")) {
    filters.push("status = @status");
    args.status = params.get("status");
  }
  if (params.get("hour")) {
    filters.push("start_hour = @hour");
    args.hour = Number(params.get("hour"));
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await dbAll(`SELECT * FROM bookings ${where} ORDER BY date DESC, start_hour DESC, ref DESC`, args);
  return rows.map(bookingRow);
}

async function checkIn(ref, actor) {
  await expireOldSessions();
  const found = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  if (!found || ["expired", "completed", "cancelled"].includes(found.status)) throw new HttpError(404, "No valid booking found.");
  if (found.status === "payment_pending") throw new HttpError(409, "Payment has not been verified for this booking yet.");
  const endsAt = bookingEndDate(found);
  if (endsAt.getTime() <= Date.now()) {
    await dbRun("UPDATE bookings SET status = 'expired' WHERE ref = ?", [ref]);
    await logActivity(actor, "check_in_denied", "booking", ref, {
      reason: "expired",
      seatId: found.seat_id,
      customerName: found.name,
      endedAt: endsAt.toISOString(),
    });
    throw new HttpError(409, "This booking is expired.");
  }
  if (found.status === "active" || found.check_in_at) {
    await logActivity(actor, "check_in_denied", "booking", ref, {
      reason: "already_used",
      seatId: found.seat_id,
      customerName: found.name,
    });
    throw new HttpError(409, "This booking has already been checked in and cannot be used again.");
  }
  const startsAt = bookingStartDate(found);
  if (startsAt.getTime() > Date.now()) {
    await logActivity(actor, "check_in_denied", "booking", ref, {
      reason: "too_early",
      seatId: found.seat_id,
      customerName: found.name,
      startsAt: startsAt.toISOString(),
    });
    throw new HttpError(409, "Check-in is only allowed once the booking date and time has started.");
  }
  await dbRun("UPDATE bookings SET status = 'active', check_in_at = CURRENT_TIMESTAMP WHERE ref = ?", [ref]);
  const updated = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  await logActivity(actor, "check_in", "booking", ref, { seatId: updated.seat_id, customerName: updated.name });
  return bookingRow(updated);
}

async function cancelBooking(ref, actor) {
  await expireOldSessions();
  const found = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  if (!found) throw new HttpError(404, "Booking not found.");
  if (["expired", "completed", "cancelled"].includes(found.status)) throw new HttpError(400, "This booking can no longer be cancelled.");
  await dbRun("UPDATE bookings SET status = 'cancelled' WHERE ref = ?", [ref]);
  const updated = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  await logActivity(actor, found.status === "active" ? "cancel_active_booking" : "cancel_booking", "booking", ref, {
    seatId: updated.seat_id,
    customerName: updated.name,
    previousStatus: found.status,
  });
  return bookingRow(updated);
}

async function verifyPayment(ref, actor) {
  await expireOldSessions();
  const found = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  if (!found) throw new HttpError(404, "Booking not found.");
  if (found.status !== "payment_pending") throw new HttpError(400, "This booking is not waiting for payment verification.");
  const seat = seatById(found.seat_id);
  if (!seat) throw new HttpError(404, "Seat not found.");
  if (seat.zone === "room") {
    await dbRun("UPDATE bookings SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE ref = ?", [ref]);
  } else {
    const now = businessNow();
    await dbRun("UPDATE bookings SET status = 'paid', paid_at = CURRENT_TIMESTAMP, start_at = CURRENT_TIMESTAMP, start_hour = ? WHERE ref = ?", [now.hour, ref]);
  }
  const updated = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  const emailStatus = await sendBookingConfirmation(updated);
  await logActivity(actor, "verify_payment", "booking", ref, {
    seatId: updated.seat_id,
    customerName: updated.name,
    amount: cents(updated.total_cents),
  });
  return { ...bookingRow(updated), emailStatus };
}

async function rejectPayment(ref, actor) {
  await expireOldSessions();
  const found = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  if (!found) throw new HttpError(404, "Booking not found.");
  if (found.status !== "payment_pending") throw new HttpError(400, "This booking is not waiting for payment verification.");
  await dbRun("UPDATE bookings SET status = 'cancelled' WHERE ref = ?", [ref]);
  const updated = await dbGet("SELECT * FROM bookings WHERE ref = ?", [ref]);
  await logActivity(actor, "reject_payment", "booking", ref, {
    seatId: updated.seat_id,
    customerName: updated.name,
    amount: cents(updated.total_cents),
  });
  return bookingRow(updated);
}

async function foodOrderRow(id) {
  const order = await dbGet("SELECT * FROM food_orders WHERE id = ?", [id]);
  if (!order) return null;
  const lines = await dbAll("SELECT * FROM food_order_lines WHERE order_id = ?", [id]);
  const label = await vendorLabel(order.vendor);
  return {
    id: order.id,
    bookingRef: order.booking_ref,
    seatId: order.seat_id,
    customerName: order.customer_name,
    delivery: order.delivery,
    subtotal: cents(order.subtotal_cents),
    serviceFee: cents(order.service_fee_cents),
    total: cents(order.total_cents),
    status: order.status,
    placedAt: serializeTimestamp(order.placed_at),
    vendor: order.vendor,
    vendorLabel: label,
    lines: lines.map(line => ({ itemId: line.item_id, name: line.name, price: cents(line.price_cents), qty: line.qty })),
  };
}

async function foodPaymentRequestRow(row) {
  if (!row) return null;
  const payload = row.payload_json ? JSON.parse(row.payload_json) : { items: [] };
  const orderIds = row.order_ids_json ? JSON.parse(row.order_ids_json) : [];
  const orders = await Promise.all(orderIds.map(id => foodOrderRow(id)));
  const items = await Promise.all((payload.items ?? []).map(async item => ({
    vendor: item.vendor,
    vendorLabel: item.vendorLabel ?? await vendorLabel(item.vendor),
    itemId: item.itemId,
    name: item.name,
    price: cents(item.price_cents),
    qty: item.qty,
  })));
  return {
    id: row.id,
    bookingRef: row.booking_ref,
    seatId: row.seat_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone ?? "",
    delivery: row.delivery,
    description: row.description,
    subtotal: cents(row.subtotal_cents),
    total: cents(row.total_cents),
    status: row.status,
    createdAt: serializeTimestamp(row.created_at),
    items,
    orders: orders.filter(Boolean),
  };
}

async function createFoodOrders(body) {
  const bookingRef = text(body.bookingRef, "bookingRef").toUpperCase();
  const delivery = text(body.delivery, "delivery");
  if (!["table", "pickup"].includes(delivery)) throw new HttpError(400, "delivery must be table or pickup.");
  if (!Array.isArray(body.items) || body.items.length === 0) throw new HttpError(400, "items are required.");

  const booking = await dbGet("SELECT * FROM bookings WHERE ref = ? AND status IN ('paid', 'active')", [bookingRef]);
  if (!booking) throw new HttpError(404, "Active or paid booking not found.");

  const groups = new Map();
  for (const raw of body.items) {
    const itemId = text(raw.itemId, "itemId");
    const qty = int(raw.qty, "qty", 1, 99);
    const item = await dbGet("SELECT * FROM menu_items WHERE id = ? AND available = TRUE", [itemId]);
    if (!item) throw new HttpError(404, `Menu item ${itemId} is not available.`);
    const vendorInfo = await vendorById(item.vendor);
    if (!vendorInfo) throw new HttpError(404, "Vendor company not found.");
    if (!vendorInfo.isOpen) throw new HttpError(400, `${vendorInfo.label} is closed right now.`);
    const list = groups.get(item.vendor) ?? [];
    list.push({ item, qty });
    groups.set(item.vendor, list);
  }

  const created = [];
  await withTransaction(async client => {
    for (const [vendorId, lines] of groups.entries()) {
      const subtotal = lines.reduce((sum, line) => sum + line.item.price_cents * line.qty, 0);
      const fee = 0;
      const total = subtotal + fee;
      const id = await uniqueRef("FO", "food_orders", "id", client);
      await dbRun(`
        INSERT INTO food_orders (id, booking_ref, seat_id, customer_name, delivery, subtotal_cents, service_fee_cents, total_cents, status, placed_at, vendor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, ?)
      `, [id, booking.ref, booking.seat_id, booking.name, delivery, subtotal, fee, total, vendorId], client);
      for (const line of lines) {
        await dbRun(`
          INSERT INTO food_order_lines (order_id, item_id, name, price_cents, qty)
          VALUES (?, ?, ?, ?, ?)
        `, [id, line.item.id, line.item.name, line.item.price_cents, line.qty], client);
      }
      created.push(await foodOrderRow(id));
    }
  });
  return created;
}

async function createFoodPaymentRequest(body) {
  const bookingRef = text(body.bookingRef, "bookingRef").toUpperCase();
  const delivery = text(body.delivery, "delivery");
  const description = text(body.description ?? "food orders", "description");
  if (!["table", "pickup"].includes(delivery)) throw new HttpError(400, "delivery must be table or pickup.");
  if (!Array.isArray(body.items) || body.items.length === 0) throw new HttpError(400, "items are required.");

  const booking = await dbGet("SELECT * FROM bookings WHERE ref = ? AND status IN ('paid', 'active')", [bookingRef]);
  if (!booking) throw new HttpError(404, "Active or paid booking not found.");

  const groupedItems = new Map();
  const requestItems = [];
  for (const raw of body.items) {
    const itemId = text(raw.itemId, "itemId");
    const qty = int(raw.qty, "qty", 1, 99);
    const item = await dbGet("SELECT * FROM menu_items WHERE id = ? AND available = TRUE", [itemId]);
    if (!item) throw new HttpError(404, `Menu item ${itemId} is not available.`);
    const vendorInfo = await vendorById(item.vendor);
    if (!vendorInfo) throw new HttpError(404, "Vendor company not found.");
    if (!vendorInfo.isOpen) throw new HttpError(400, `${vendorInfo.label} is closed right now.`);
    const group = groupedItems.get(item.vendor) ?? [];
    group.push({ item, qty, vendorInfo });
    groupedItems.set(item.vendor, group);
    requestItems.push({
      vendor: item.vendor,
      vendorLabel: vendorInfo.label,
      itemId: item.id,
      name: item.name,
      price_cents: item.price_cents,
      qty,
    });
  }

  const subtotal = requestItems.reduce((sum, item) => sum + item.price_cents * item.qty, 0);
  const total = subtotal;
  const id = await uniqueRef("FP", "food_payment_requests", "id");
  const payload = {
    items: requestItems,
    vendorGroups: [...groupedItems.entries()].map(([vendorId, lines]) => ({
      vendorId,
      lines: lines.map(line => ({
        itemId: line.item.id,
        name: line.item.name,
        price_cents: line.item.price_cents,
        qty: line.qty,
      })),
    })),
  };

  await dbRun(`
    INSERT INTO food_payment_requests (
      id, booking_ref, seat_id, customer_name, customer_email, customer_phone, delivery, description,
      subtotal_cents, total_cents, status, payload_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
  `, [id, booking.ref, booking.seat_id, booking.name, booking.email, booking.phone ?? "", delivery, description, subtotal, total, JSON.stringify(payload)]);

  return foodPaymentRequestRow(await dbGet("SELECT * FROM food_payment_requests WHERE id = ?", [id]));
}

async function listFoodPaymentRequests(status = null) {
  const filters = [];
  const args = {};
  if (status) {
    filters.push("status = @status");
    args.status = status;
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await dbAll(`SELECT * FROM food_payment_requests ${where} ORDER BY created_at DESC, id DESC`, args);
  return Promise.all(rows.map(row => foodPaymentRequestRow(row)));
}

async function getFoodPaymentRequest(id) {
  const row = await dbGet("SELECT * FROM food_payment_requests WHERE id = ?", [id]);
  if (!row) throw new HttpError(404, "Food payment request not found.");
  return foodPaymentRequestRow(row);
}

async function verifyFoodPaymentRequest(id, actor) {
  const existing = await dbGet("SELECT * FROM food_payment_requests WHERE id = ?", [id]);
  if (!existing) throw new HttpError(404, "Food payment request not found.");
  if (existing.status !== "pending") throw new HttpError(400, "This food payment request is not waiting for verification.");
  const payload = existing.payload_json ? JSON.parse(existing.payload_json) : { vendorGroups: [] };
  const createdOrderIds = [];

  await withTransaction(async client => {
    for (const group of payload.vendorGroups ?? []) {
      const subtotal = (group.lines ?? []).reduce((sum, line) => sum + line.price_cents * line.qty, 0);
      const total = subtotal;
      const orderId = await uniqueRef("FO", "food_orders", "id", client);
      await dbRun(`
        INSERT INTO food_orders (id, booking_ref, seat_id, customer_name, delivery, subtotal_cents, service_fee_cents, total_cents, status, placed_at, vendor)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'pending', CURRENT_TIMESTAMP, ?)
      `, [orderId, existing.booking_ref, existing.seat_id, existing.customer_name, existing.delivery, subtotal, total, group.vendorId], client);
      for (const line of group.lines ?? []) {
        await dbRun(`
          INSERT INTO food_order_lines (order_id, item_id, name, price_cents, qty)
          VALUES (?, ?, ?, ?, ?)
        `, [orderId, line.itemId, line.name, line.price_cents, line.qty], client);
      }
      createdOrderIds.push(orderId);
    }
    await dbRun(`
      UPDATE food_payment_requests
      SET status = 'approved', order_ids_json = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(createdOrderIds), id], client);
  });

  const updated = await dbGet("SELECT * FROM food_payment_requests WHERE id = ?", [id]);
  await logActivity(actor, "verify_food_payment", "food_payment_request", id, {
    bookingRef: updated.booking_ref,
    amount: cents(updated.total_cents),
    orderIds: createdOrderIds.join(", "),
  });
  return foodPaymentRequestRow(updated);
}

async function rejectFoodPaymentRequest(id, actor) {
  const existing = await dbGet("SELECT * FROM food_payment_requests WHERE id = ?", [id]);
  if (!existing) throw new HttpError(404, "Food payment request not found.");
  if (existing.status !== "pending") throw new HttpError(400, "This food payment request is not waiting for verification.");
  await dbRun("UPDATE food_payment_requests SET status = 'rejected', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  const updated = await dbGet("SELECT * FROM food_payment_requests WHERE id = ?", [id]);
  await logActivity(actor, "reject_food_payment", "food_payment_request", id, {
    bookingRef: updated.booking_ref,
    amount: cents(updated.total_cents),
  });
  return foodPaymentRequestRow(updated);
}

async function listFoodOrders(params, vendorId = null) {
  const filters = [];
  const args = {};
  if (vendorId) {
    filters.push("vendor = @vendor");
    args.vendor = vendorId;
  }
  if (params.get("bookingRef")) {
    filters.push("booking_ref = @bookingRef");
    args.bookingRef = params.get("bookingRef").toUpperCase();
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const ids = await dbAll(`SELECT id FROM food_orders ${where} ORDER BY placed_at DESC, id DESC`, args);
  return Promise.all(ids.map(row => foodOrderRow(row.id)));
}

async function listActivityLogs() {
  const rows = await dbAll("SELECT * FROM activity_logs ORDER BY created_at DESC, id DESC");
  return rows.map(activityRow);
}

async function dashboardSummary() {
  await expireOldSessions();
  const bookings = await dbAll("SELECT * FROM bookings ORDER BY paid_at DESC");
  const foodOrders = await listFoodOrders(new URLSearchParams());
  const now = new Date();
  const bookingRevenue = bookings
    .filter(row => ["paid", "active", "expired", "completed"].includes(row.status))
    .reduce((sum, row) => sum + row.total_cents, 0);
  const foodRevenue = foodOrders.reduce((sum, order) => sum + Math.round(order.total * 100), 0);
  const bookingCounts = {
    total: bookings.length,
    paid: bookings.filter(row => row.status === "paid").length,
    active: bookings.filter(row => row.status === "active").length,
    completed: bookings.filter(row => row.status === "completed").length,
    expired: bookings.filter(row => row.status === "expired").length,
    cancelled: bookings.filter(row => row.status === "cancelled").length,
    future: bookings.filter(row => ["paid", "active"].includes(row.status) && bookingStartDate(row) > now).length,
    past: bookings.filter(row => ["expired", "completed", "cancelled"].includes(row.status) || bookingEndDate(row) <= now).length,
  };
  const vendors = await listVendors();
  const vendorTotals = vendors.map(item => {
    const orders = foodOrders.filter(order => order.vendor === item.id);
    return {
      vendor: item.id,
      label: item.label,
      orders: orders.length,
      revenue: orders.reduce((sum, order) => sum + order.total, 0),
    };
  });
  return {
    bookingRevenue: cents(bookingRevenue),
    foodRevenue: cents(foodRevenue),
    totalRevenue: cents(bookingRevenue + foodRevenue),
    bookingCounts,
    vendorTotals,
  };
}

async function listVendors() {
  const rows = await dbAll("SELECT id, label, is_open FROM vendors ORDER BY label");
  return rows.map(vendorRow);
}

async function createVendorCompany(body) {
  const label = text(body.label, "label");
  const baseId = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "vendor";

  let vendorId = baseId;
  let suffix = 2;
  while (await dbGet("SELECT 1 FROM vendors WHERE id = ?", [vendorId])) {
    vendorId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  await dbRun("INSERT INTO vendors (id, label, password_hash, is_open) VALUES (?, ?, ?, TRUE)", [
    vendorId,
    label,
    hashPassword(randomBytes(12).toString("hex")),
  ]);

  return vendorById(vendorId);
}

async function listVendorAccounts() {
  const rows = await dbAll("SELECT id, username, role, vendor_id, created_at FROM vendor_accounts ORDER BY created_at, username");
  return Promise.all(rows.map(row => vendorAccountRow(row)));
}

async function vendorDashboardSummary(vendorId = null) {
  const orders = await listFoodOrders(new URLSearchParams(), vendorId);
  const revenue = orders.reduce((sum, order) => sum + Math.round(order.total * 100), 0);
  const counts = {
    total: orders.length,
    pending: orders.filter(order => order.status === "pending").length,
    preparing: orders.filter(order => order.status === "preparing").length,
    ready: orders.filter(order => order.status === "ready").length,
    completed: orders.filter(order => order.status === "completed").length,
  };
  const vendors = await listVendors();
  const vendorTotals = vendors.map(item => {
    const vendorOrders = orders.filter(order => order.vendor === item.id);
    return {
      vendor: item.id,
      label: item.label,
      orders: vendorOrders.length,
      revenue: vendorOrders.reduce((sum, order) => sum + order.total, 0),
    };
  }).filter(item => vendorId ? item.vendor === vendorId : true);
  return {
    revenue: cents(revenue),
    orderCounts: counts,
    vendorTotals,
  };
}

async function createVendorAccount(body) {
  const username = text(body.username, "username");
  const password = text(body.password, "password");
  const role = text(body.role, "role");
  const vendorId = body.vendorId === null || body.vendorId === undefined || body.vendorId === "" ? null : text(body.vendorId, "vendorId");
  if (!["superadmin", "vendor"].includes(role)) throw new HttpError(400, "role must be superadmin or vendor.");
  if (role === "vendor" && !vendorId) throw new HttpError(400, "Please choose a company for vendor accounts.");
  if (role === "superadmin" && vendorId) throw new HttpError(400, "Superadmin accounts cannot be tied to one company.");
  if (vendorId && !await dbGet("SELECT 1 FROM vendors WHERE id = ?", [vendorId])) throw new HttpError(404, "Vendor company not found.");
  if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
  const id = `va${Date.now()}`;
  try {
    await dbRun(`
      INSERT INTO vendor_accounts (id, username, password_hash, role, vendor_id, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [id, username, hashPassword(password), role, vendorId]);
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Username already exists.");
    throw error;
  }
  return vendorAccountRow(await dbGet("SELECT id, username, role, vendor_id, created_at FROM vendor_accounts WHERE id = ?", [id]));
}

async function updateVendorAccount(accountId, body) {
  const existing = await dbGet("SELECT id, username, role, vendor_id FROM vendor_accounts WHERE id = ?", [accountId]);
  if (!existing) throw new HttpError(404, "Vendor account not found.");
  const username = body.username === undefined ? existing.username : text(body.username, "username");
  const role = body.role === undefined ? existing.role : text(body.role, "role");
  const nextVendorId = body.vendorId === undefined
    ? existing.vendor_id
    : (body.vendorId === null || body.vendorId === "" ? null : text(body.vendorId, "vendorId"));
  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!["superadmin", "vendor"].includes(role)) throw new HttpError(400, "role must be superadmin or vendor.");
  if (role === "vendor" && !nextVendorId) throw new HttpError(400, "Please choose a company for vendor accounts.");
  if (role === "superadmin" && nextVendorId) throw new HttpError(400, "Superadmin accounts cannot be tied to one company.");
  if (nextVendorId && !await dbGet("SELECT 1 FROM vendors WHERE id = ?", [nextVendorId])) throw new HttpError(404, "Vendor company not found.");
  if (password && password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
  try {
    if (password) {
      await dbRun(`
        UPDATE vendor_accounts
        SET username = ?, role = ?, vendor_id = ?, password_hash = ?
        WHERE id = ?
      `, [username, role, nextVendorId, hashPassword(password), accountId]);
    } else {
      await dbRun(`
        UPDATE vendor_accounts
        SET username = ?, role = ?, vendor_id = ?
        WHERE id = ?
      `, [username, role, nextVendorId, accountId]);
    }
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Username already exists.");
    throw error;
  }
  return vendorAccountRow(await dbGet("SELECT id, username, role, vendor_id, created_at FROM vendor_accounts WHERE id = ?", [accountId]));
}

async function setVendorOpenState(vendorId, isOpen, actor = null) {
  const existing = await vendorById(vendorId);
  if (!existing) throw new HttpError(404, "Vendor company not found.");
  await dbRun("UPDATE vendors SET is_open = ? WHERE id = ?", [isOpen, vendorId]);
  const updated = await vendorById(vendorId);
  if (actor?.type === "admin") {
    await logActivity(actor, updated.isOpen ? "open_vendor_shop" : "close_vendor_shop", "vendor", vendorId, {
      vendorLabel: updated.label,
      previousIsOpen: existing.isOpen,
      isOpen: updated.isOpen,
    });
  }
  return updated;
}

async function updateVendorCompany(vendorId, body) {
  const existing = await vendorById(vendorId);
  if (!existing) throw new HttpError(404, "Vendor company not found.");
  const nextLabel = body.label === undefined ? existing.label : text(body.label, "label");
  await dbRun("UPDATE vendors SET label = ? WHERE id = ?", [nextLabel, vendorId]);
  return vendorById(vendorId);
}

async function updateAdminAccount(accountId, body, actor) {
  const existing = await dbGet("SELECT id, username, role FROM admin_accounts WHERE id = ?", [accountId]);
  if (!existing) throw new HttpError(404, "Admin account not found.");

  const nextUsername = body.username === undefined ? existing.username : text(body.username, "username");
  const nextRole = body.role === undefined ? canonicalAdminRole(existing.role) : text(body.role, "role");
  const nextPassword = typeof body.password === "string" ? body.password.trim() : "";

  if (!["superadmin", "admin"].includes(nextRole)) throw new HttpError(400, "role must be superadmin or admin.");
  if (nextPassword && nextPassword.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");

  try {
    if (nextPassword) {
      await dbRun(`
        UPDATE admin_accounts
        SET username = ?, role = ?, password_hash = ?
        WHERE id = ?
      `, [nextUsername, nextRole, hashPassword(nextPassword), accountId]);
    } else {
      await dbRun(`
        UPDATE admin_accounts
        SET username = ?, role = ?
        WHERE id = ?
      `, [nextUsername, nextRole, accountId]);
    }
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Username already exists.");
    throw error;
  }

  await logActivity(actor, "update_admin_account", "admin_account", accountId, {
    previousUsername: existing.username,
    previousRole: canonicalAdminRole(existing.role),
    username: nextUsername,
    role: nextRole,
    passwordChanged: Boolean(nextPassword),
  });

  const updated = await dbGet("SELECT id, username, role, created_at FROM admin_accounts WHERE id = ?", [accountId]);
  return { id: updated.id, username: updated.username, role: canonicalAdminRole(updated.role), createdAt: serializeTimestamp(updated.created_at) };
}

async function seed() {
  await syncSeatCatalog();

  if (countRowValue(await dbGet("SELECT COUNT(*) count FROM admin_accounts")) === 0) {
    await dbRun("INSERT INTO admin_accounts (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", ["a1", "admin", hashPassword("workhub2024"), "superadmin"]);
    await dbRun("INSERT INTO admin_accounts (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", ["a2", "desk1", hashPassword("desk1234"), "admin"]);
  }

  if (countRowValue(await dbGet("SELECT COUNT(*) count FROM vendors")) === 0) {
    await dbRun("INSERT INTO vendors (id, label, password_hash, is_open) VALUES (?, ?, ?, TRUE)", ["cafe", "Quety Study Lounge Cafe", hashPassword("cafe2024")]);
    await dbRun("INSERT INTO vendors (id, label, password_hash, is_open) VALUES (?, ?, ?, TRUE)", ["pizza", "The Slice Co.", hashPassword("pizza2024")]);
  }

  if (countRowValue(await dbGet("SELECT COUNT(*) count FROM vendor_accounts")) === 0) {
    await dbRun(`
      INSERT INTO vendor_accounts (id, username, password_hash, role, vendor_id, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, ["vs1", "vendoradmin", hashPassword("vendorhub2024"), "superadmin", null]);
    await dbRun(`
      INSERT INTO vendor_accounts (id, username, password_hash, role, vendor_id, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, ["vc1", "cafeadmin", hashPassword("cafe2024"), "vendor", "cafe"]);
    await dbRun(`
      INSERT INTO vendor_accounts (id, username, password_hash, role, vendor_id, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, ["vp1", "sliceadmin", hashPassword("slice2024"), "vendor", "pizza"]);
  }

  if (countRowValue(await dbGet("SELECT COUNT(*) count FROM menu_items")) === 0) {
    const items = [
      ["c1", "Espresso", 350, "cafe", "Coffee", "", true],
      ["c2", "Latte", 450, "cafe", "Coffee", "", true],
      ["c3", "Cappuccino", 450, "cafe", "Coffee", "", true],
      ["c4", "Flat White", 450, "cafe", "Coffee", "", true],
      ["c5", "Green Tea", 300, "cafe", "Drinks", "", true],
      ["c6", "Still Water", 200, "cafe", "Drinks", "", true],
      ["c7", "Chicken Sandwich", 900, "cafe", "Food", "", true],
      ["c8", "Veggie Sandwich", 800, "cafe", "Food", "", true],
      ["c9", "Croissant", 400, "cafe", "Food", "", true],
      ["c10", "Blueberry Muffin", 350, "cafe", "Food", "", true],
      ["c11", "Salad Bowl", 1200, "cafe", "Food", "", false],
      ["p1", "Margherita (S)", 1200, "pizza", "Classic", "", true],
      ["p2", "Margherita (L)", 1800, "pizza", "Classic", "", true],
      ["p3", "Pepperoni (S)", 1400, "pizza", "Classic", "", true],
      ["p4", "Pepperoni (L)", 2000, "pizza", "Classic", "", true],
      ["p5", "Veggie Supreme (S)", 1300, "pizza", "Specialty", "", true],
      ["p6", "Veggie Supreme (L)", 1900, "pizza", "Specialty", "", true],
      ["p7", "BBQ Chicken (S)", 1500, "pizza", "Specialty", "", true],
      ["p8", "BBQ Chicken (L)", 2200, "pizza", "Specialty", "", true],
      ["p9", "Garlic Bread", 600, "pizza", "Sides", "", true],
      ["p10", "Chicken Wings (6pc)", 1000, "pizza", "Sides", "", true],
    ];

    for (const item of items) {
      await dbRun(
        "INSERT INTO menu_items (id, name, price_cents, vendor, category, description, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
        item
      );
    }
  }
}

await bootstrapDatabase();

const routes = [
  ["GET", /^\/api\/health$/, async () => ({ ok: true, service: "quety-study-lounge-api" })],
  ["GET", /^\/api\/seats$/, async (_req, _body, url) => {
    await syncSeatCatalog();
    await expireOldSessions();
    const d = url.searchParams.get("date");
    const rawHour = url.searchParams.get("startHour");
    const h = rawHour === null || rawHour === "" ? null : Number(rawHour);
    const rawDuration = url.searchParams.get("duration");
    const dur = rawDuration === null || rawDuration === "" ? null : Number(rawDuration);
    const now = businessNow();
    const seats = await dbAll("SELECT * FROM seats WHERE zone IN ('focus', 'discussion', 'room') ORDER BY zone, id");
    return seats
      .filter(seat => VALID_SEAT_IDS.has(seat.id))
      .map(async seat => {
        let unavailable = false;
        let occupied = false;
        if (d && Number.isInteger(dur)) {
          if (seat.zone === "room" && !Number.isInteger(h)) {
            occupied = false;
          } else {
            try {
              validateBookingWindow(seat, d, h, dur, now);
            } catch {
              unavailable = true;
            }
            if (!unavailable) occupied = await bookingConflicts(seat.id, requestedWindow(d, seat.zone === "room" ? h : null, dur));
          }
        }
        return {
          id: seat.id,
          label: seat.label,
          zone: seat.zone,
          occupied: unavailable || occupied,
          price: cents(getPriceCents(seat.zone, Number.isInteger(dur) ? dur : 1)),
        };
      })
      .reduce(async (promise, next) => {
        const all = await promise;
        all.push(await next);
        return all;
      }, Promise.resolve([]));
  }],
  ["POST", /^\/api\/bookings$/, async (_req, body) => createBooking(body)],
  ["POST", /^\/api\/mock-bookings$/, async (_req, body) => createMockBooking(body)],
  ["GET", /^\/api\/bookings$/, async req => {
    await admin(req);
    return listBookings(new URL(req.url, "http://localhost").searchParams);
  }],
  ["GET", /^\/api\/admin\/bookings$/, async req => {
    await admin(req);
    return listBookings(new URL(req.url, "http://localhost").searchParams);
  }],
  ["GET", /^\/api\/bookings\/([A-Z]+-\d+)$/, async (_req, _body, _url, match) => {
    await expireOldSessions();
    const booking = await dbGet("SELECT * FROM bookings WHERE ref = ?", [match[1]]);
    if (!booking) throw new HttpError(404, "Booking not found.");
    return bookingRow(booking);
  }],
  ["POST", /^\/api\/bookings\/([A-Z]+-\d+)\/email$/, async (_req, body, _url, match) => sendBookingEmail(match[1], body)],
  ["POST", /^\/api\/bookings\/([A-Z]+-\d+)\/check-in$/, async (req, _body, _url, match) => {
    const actor = await admin(req);
    return checkIn(match[1], actor);
  }],
  ["POST", /^\/api\/admin\/bookings\/([A-Z]+-\d+)\/cancel$/, async (req, _body, _url, match) => {
    const actor = await admin(req);
    return cancelBooking(match[1], actor);
  }],
  ["POST", /^\/api\/admin\/bookings\/([A-Z]+-\d+)\/verify-payment$/, async (req, _body, _url, match) => {
    const actor = await admin(req);
    return verifyPayment(match[1], actor);
  }],
  ["POST", /^\/api\/admin\/bookings\/([A-Z]+-\d+)\/reject-payment$/, async (req, _body, _url, match) => {
    const actor = await admin(req);
    return rejectPayment(match[1], actor);
  }],
  ["GET", /^\/api\/admin\/food-payment-requests$/, async req => {
    await admin(req);
    return listFoodPaymentRequests("pending");
  }],
  ["POST", /^\/api\/admin\/food-payment-requests\/([A-Z]+-\d+)\/verify$/, async (req, _body, _url, match) => {
    const actor = await admin(req);
    return verifyFoodPaymentRequest(match[1], actor);
  }],
  ["POST", /^\/api\/admin\/food-payment-requests\/([A-Z]+-\d+)\/reject$/, async (req, _body, _url, match) => {
    const actor = await admin(req);
    return rejectFoodPaymentRequest(match[1], actor);
  }],
  ["POST", /^\/api\/admin\/login$/, async (_req, body) => {
    const username = text(body.username, "username");
    const password = text(body.password, "password");
    const account = await dbGet("SELECT * FROM admin_accounts WHERE username = ?", [username]);
    if (!account || !verifyPassword(password, account.password_hash)) throw new HttpError(401, "Incorrect username or password.");
    const role = canonicalAdminRole(account.role);
    return {
      token: signToken({ type: "admin", id: account.id, username: account.username, role }),
      account: { id: account.id, username: account.username, role, createdAt: serializeTimestamp(account.created_at) },
    };
  }],
  ["GET", /^\/api\/admin\/accounts$/, async req => {
    await admin(req, ["superadmin"]);
    const rows = await dbAll("SELECT id, username, role, created_at FROM admin_accounts ORDER BY created_at");
    return rows.map(row => ({ id: row.id, username: row.username, role: canonicalAdminRole(row.role), createdAt: serializeTimestamp(row.created_at) }));
  }],
  ["GET", /^\/api\/admin\/dashboard$/, async req => {
    await admin(req, ["superadmin"]);
    return dashboardSummary();
  }],
  ["GET", /^\/api\/admin\/logs$/, async req => {
    await admin(req, ["superadmin"]);
    return listActivityLogs();
  }],
  ["GET", /^\/api\/admin\/orders$/, async req => {
    await admin(req, ["superadmin"]);
    return listFoodOrders(new URL(req.url, "http://localhost").searchParams);
  }],
  ["PATCH", /^\/api\/admin\/vendors\/([^/]+)\/status$/, async (req, body, _url, match) => {
    const actor = await admin(req);
    const isOpen = typeof body.isOpen === "boolean"
      ? body.isOpen
      : (() => { throw new HttpError(400, "isOpen must be true or false."); })();
    return setVendorOpenState(match[1], isOpen, actor);
  }],
  ["POST", /^\/api\/admin\/accounts$/, async (req, body) => {
    const actor = await admin(req, ["superadmin"]);
    const username = text(body.username, "username");
    const password = text(body.password, "password");
    const role = text(body.role, "role");
    if (!["superadmin", "admin"].includes(role)) throw new HttpError(400, "role must be superadmin or admin.");
    if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
    const id = `a${Date.now()}`;
    try {
      await dbRun("INSERT INTO admin_accounts (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)", [
        id,
        username,
        hashPassword(password),
        role,
      ]);
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "Username already exists.");
      throw error;
    }
    await logActivity(actor, "create_admin_account", "admin_account", id, { username, role });
    return { id, username, role, createdAt: new Date().toISOString() };
  }],
  ["PATCH", /^\/api\/admin\/accounts\/([^/]+)$/, async (req, body, _url, match) => {
    const actor = await admin(req, ["superadmin"]);
    return updateAdminAccount(match[1], body, actor);
  }],
  ["DELETE", /^\/api\/admin\/accounts\/([^/]+)$/, async (req, _body, _url, match) => {
    const actor = await admin(req, ["superadmin"]);
    if (match[1] === "a1") throw new HttpError(400, "Primary admin account cannot be deleted.");
    const target = await dbGet("SELECT id, username, role FROM admin_accounts WHERE id = ?", [match[1]]);
    await dbRun("DELETE FROM admin_accounts WHERE id = ?", [match[1]]);
    if (target) await logActivity(actor, "delete_admin_account", "admin_account", match[1], { username: target.username, role: target.role });
    return { ok: true };
  }],
  ["GET", /^\/api\/menu$/, async () => {
    const rows = await dbAll("SELECT * FROM menu_items ORDER BY vendor, category, name");
    return Promise.all(rows.map(row => menuRow(row)));
  }],
  ["POST", /^\/api\/food-orders$/, async (_req, body) => createFoodOrders(body)],
  ["GET", /^\/api\/food-orders$/, async req => listFoodOrders(new URL(req.url, "http://localhost").searchParams)],
  ["POST", /^\/api\/food-payment-requests$/, async (_req, body) => createFoodPaymentRequest(body)],
  ["GET", /^\/api\/food-payment-requests\/([A-Z]+-\d+)$/, async (_req, _body, _url, match) => getFoodPaymentRequest(match[1])],
  ["POST", /^\/api\/vendors\/login$/, async (_req, body) => {
    const username = text(body.username, "username");
    const password = text(body.password, "password");
    const row = await dbGet("SELECT * FROM vendor_accounts WHERE username = ?", [username]);
    if (!row || !verifyPassword(password, row.password_hash)) throw new HttpError(401, "Incorrect username or password.");
    return {
      token: signToken({ type: "vendor", id: row.id, username: row.username, role: row.role, vendor: row.vendor_id ?? null }),
      account: await vendorAccountRow(row),
    };
  }],
  ["GET", /^\/api\/vendors$/, async () => listVendors()],
  ["POST", /^\/api\/vendors$/, async (req, body) => {
    await vendor(req, ["superadmin"]);
    return createVendorCompany(body);
  }],
  ["POST", /^\/api\/vendors\/company$/, async (req, body) => {
    await vendor(req, ["superadmin"]);
    return createVendorCompany(body);
  }],
  ["GET", /^\/api\/vendors\/accounts$/, async req => {
    await vendor(req, ["superadmin"]);
    return listVendorAccounts();
  }],
  ["PATCH", /^\/api\/vendors\/([^/]+)\/status$/, async (req, body, _url, match) => {
    const payload = await vendor(req);
    const isOpen = typeof body.isOpen === "boolean"
      ? body.isOpen
      : (() => { throw new HttpError(400, "isOpen must be true or false."); })();
    const vendorInfo = await vendorById(match[1]);
    if (!vendorInfo) throw new HttpError(404, "Vendor company not found.");
    if (payload.role !== "superadmin" && payload.vendor !== match[1]) {
      throw new HttpError(403, "You can only update your own shop.");
    }
    return setVendorOpenState(match[1], isOpen);
  }],
  ["PATCH", /^\/api\/vendors\/([^/]+)$/, async (req, body, _url, match) => {
    await vendor(req, ["superadmin"]);
    return updateVendorCompany(match[1], body);
  }],
  ["POST", /^\/api\/vendors\/accounts$/, async (req, body) => {
    await vendor(req, ["superadmin"]);
    return createVendorAccount(body);
  }],
  ["PATCH", /^\/api\/vendors\/accounts\/([^/]+)$/, async (req, body, _url, match) => {
    await vendor(req, ["superadmin"]);
    if (match[1] === "vs1" && body.role === "vendor") throw new HttpError(400, "Primary vendor superadmin cannot be downgraded.");
    return updateVendorAccount(match[1], body);
  }],
  ["DELETE", /^\/api\/vendors\/accounts\/([^/]+)$/, async (req, _body, _url, match) => {
    await vendor(req, ["superadmin"]);
    if (match[1] === "vs1") throw new HttpError(400, "Primary vendor superadmin cannot be deleted.");
    const result = await dbRun("DELETE FROM vendor_accounts WHERE id = ?", [match[1]]);
    if (result.changes === 0) throw new HttpError(404, "Vendor account not found.");
    return { ok: true };
  }],
  ["GET", /^\/api\/vendors\/dashboard$/, async req => {
    const payload = await vendor(req);
    return vendorDashboardSummary(payload.role === "superadmin" ? null : payload.vendor);
  }],
  ["GET", /^\/api\/vendors\/orders$/, async req => {
    const payload = await vendor(req);
    return listFoodOrders(new URL(req.url, "http://localhost").searchParams, payload.role === "superadmin" ? null : payload.vendor);
  }],
  ["PATCH", /^\/api\/vendors\/orders\/([^/]+)$/, async (req, body, _url, match) => {
    const payload = await vendor(req);
    const status = text(body.status, "status");
    if (!["pending", "preparing", "ready", "completed"].includes(status)) throw new HttpError(400, "Invalid order status.");
    const order = await dbGet("SELECT vendor FROM food_orders WHERE id = ?", [match[1]]);
    if (!order) throw new HttpError(404, "Order not found.");
    if (payload.role !== "superadmin" && order.vendor !== payload.vendor) throw new HttpError(403, "This order belongs to another vendor.");
    const result = await dbRun("UPDATE food_orders SET status = ? WHERE id = ?", [status, match[1]]);
    if (result.changes === 0) throw new HttpError(404, "Order not found.");
    return foodOrderRow(match[1]);
  }],
  ["PATCH", /^\/api\/vendors\/menu\/([^/]+)$/, async (req, body, _url, match) => {
    const payload = await vendor(req);
    const item = await dbGet("SELECT * FROM menu_items WHERE id = ?", [match[1]]);
    if (!item) throw new HttpError(404, "Menu item not found.");
    if (payload.role !== "superadmin" && item.vendor !== payload.vendor) throw new HttpError(403, "This item belongs to another vendor.");
    const nextName = body.name === undefined ? item.name : text(body.name, "name");
    const nextCategory = body.category === undefined ? item.category : text(body.category, "category");
    const nextDescription = body.description === undefined
      ? (item.description ?? null)
      : (typeof body.description === "string" ? body.description.trim() || null : null);
    const nextPriceCents = body.price === undefined
      ? item.price_cents
      : (() => {
          const price = Number(body.price);
          if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "price must be a positive number.");
          return Math.round(price * 100);
        })();
    const nextImageUrl = body.imageUrl === undefined
      ? item.image_url
      : (typeof body.imageUrl === "string" ? body.imageUrl.trim() || null : null);
    const nextAvailable = body.available === undefined
      ? Boolean(item.available)
      : (typeof body.available === "boolean" ? body.available : (() => { throw new HttpError(400, "available must be true or false."); })());
    await dbRun(`
      UPDATE menu_items
      SET name = ?, category = ?, description = ?, price_cents = ?, image_url = ?, available = ?
      WHERE id = ?
    `, [nextName, nextCategory, nextDescription, nextPriceCents, nextImageUrl, nextAvailable, match[1]]);
    return menuRow(await dbGet("SELECT * FROM menu_items WHERE id = ?", [match[1]]));
  }],
  ["POST", /^\/api\/vendors\/menu$/, async (req, body) => {
    const payload = await vendor(req);
    const name = text(body.name, "name");
    const category = text(body.category, "category");
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const price = Number(body.price);
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const vendorId = payload.role === "superadmin"
      ? text(body.vendor, "vendor")
      : payload.vendor;
    if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "price must be a positive number.");
    if (!vendorId || !await dbGet("SELECT 1 FROM vendors WHERE id = ?", [vendorId])) throw new HttpError(404, "Vendor company not found.");
    const id = `custom-${Date.now()}`;
    await dbRun("INSERT INTO menu_items (id, name, price_cents, vendor, category, description, available, image_url) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)", [
      id,
      name,
      Math.round(price * 100),
      vendorId,
      category,
      description || null,
      imageUrl || null,
    ]);
    return menuRow(await dbGet("SELECT * FROM menu_items WHERE id = ?", [id]));
  }],
];

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(req, res, 204, {});
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const route = routes.find(([method, pattern]) => method === req.method && pattern.test(url.pathname));
    if (!route) throw new HttpError(404, "Route not found.");
    const [, pattern, handler] = route;
    const body = ["POST", "PATCH", "DELETE"].includes(req.method) ? await readJson(req) : {};
    const result = await handler(req, body, url, url.pathname.match(pattern));
    send(req, res, req.method === "POST" ? 201 : 200, result);
  } catch (error) {
    send(req, res, error.status ?? 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Quety Study Lounge API running at http://${HOST}:${PORT}`);
});
