import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin, Clock, CheckCircle, XCircle, Timer, AlertTriangle,
  ChevronRight, ArrowLeft, Wifi, Zap, Coffee, Lock, Shield,
  ScanLine, RefreshCw, Users, Eye, EyeOff, Building2,
  Sparkles, ArrowRight, QrCode,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type AppView = "landing" | "book" | "pay" | "qr" | "active" | "expired" | "adminLogin" | "admin";
type AdminTab = "scan" | "sessions" | "floor";
type Zone = "hotdesk" | "focus" | "standing" | "private";

interface Seat { id: string; label: string; zone: Zone; }
interface Customer { name: string; email: string; }
interface Booking {
  ref: string; seatId: string; duration: number;
  name: string; email: string; paidAt: Date;
  status: "paid" | "active" | "expired";
  checkInAt?: Date;
}

// ── Zone Meta ─────────────────────────────────────────────────────────────────
const ZONE_META: Record<Zone, { label: string; price: number; hex: string; light: string; icon: React.ReactNode }> = {
  hotdesk:  { label: "Hot Desk",       price: 8,  hex: "#1b4332", light: "#e6ede9", icon: <Wifi     className="w-3 h-3" /> },
  focus:    { label: "Focus Pod",      price: 12, hex: "#4c1d95", light: "#ede9fe", icon: <Zap      className="w-3 h-3" /> },
  standing: { label: "Standing Desk",  price: 8,  hex: "#9d174d", light: "#fce7f3", icon: <Coffee   className="w-3 h-3" /> },
  private:  { label: "Private Office", price: 20, hex: "#92400e", light: "#fef3c7", icon: <Lock     className="w-3 h-3" /> },
};

// ── Seat Data ─────────────────────────────────────────────────────────────────
// Hot desks: 6 tables × 4 seats (A=top-left, B=top-right, C=btm-left, D=btm-right)
const HOT_DESK_SEATS: Seat[] = Array.from({ length: 6 }, (_, t) =>
  ["A", "B", "C", "D"].map(l => ({ id: `H${t + 1}${l}`, label: l, zone: "hotdesk" as Zone }))
).flat();

// Focus pods: 8 seats in ∩ (upside-down U) shape
// F1–F4 = top row, F5/F6 = left/right upper sides, F7/F8 = left/right lower sides
const FOCUS_SEATS: Seat[] = Array.from({ length: 8 }, (_, i) => ({
  id: `F${i + 1}`, label: `F${i + 1}`, zone: "focus" as Zone,
}));

const STANDING_SEATS: Seat[] = Array.from({ length: 4 }, (_, i) => ({
  id: `S${i + 1}`, label: `S${i + 1}`, zone: "standing" as Zone,
}));

const PRIVATE_SEATS: Seat[] = [
  { id: "P1", label: "Office 1", zone: "private" },
  { id: "P2", label: "Office 2", zone: "private" },
];

const SEATS = [...HOT_DESK_SEATS, ...FOCUS_SEATS, ...STANDING_SEATS, ...PRIVATE_SEATS];

const BASE_OCCUPIED = new Set(["H1B", "H3A", "H4C", "H5B", "H6D", "F2", "F6", "P1"]);

const DEMO_SESSIONS: Booking[] = [
  { ref: "CW-7734", seatId: "H1B", duration: 3, name: "Marcus Chen",  email: "m.chen@email.com",    paidAt: new Date(Date.now() - 2 * 3600000),    status: "active", checkInAt: new Date(Date.now() - 2 * 3600000) },
  { ref: "CW-7689", seatId: "F2",  duration: 4, name: "Priya Nair",   email: "p.nair@email.com",    paidAt: new Date(Date.now() - 1.5 * 3600000),  status: "active", checkInAt: new Date(Date.now() - 1.5 * 3600000) },
  { ref: "CW-7701", seatId: "H4C", duration: 2, name: "Tom Walcott",  email: "t.walcott@email.com", paidAt: new Date(Date.now() - 90 * 60000),     status: "active", checkInAt: new Date(Date.now() - 90 * 60000) },
  { ref: "CW-7699", seatId: "H5B", duration: 1, name: "Yuki Tanaka",  email: "y.tanaka@email.com",  paidAt: new Date(Date.now() - 62 * 60000),     status: "active", checkInAt: new Date(Date.now() - 62 * 60000) },
];

const ADMIN_CREDS = { username: "admin", password: "workhub2024" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function genRef() { return `CW-${Math.floor(1000 + Math.random() * 9000)}`; }
function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtHm(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function sessionSecsLeft(b: Booking) {
  if (!b.checkInAt) return b.duration * 3600;
  return Math.max(0, b.duration * 3600 - Math.floor((Date.now() - b.checkInAt.getTime()) / 1000));
}
function seatName(seat: Seat): string {
  if (seat.zone === "hotdesk") {
    const m = seat.id.match(/H(\d+)([A-D])/);
    if (m) return `Table ${m[1]}, Seat ${m[2]}`;
  }
  return seat.label;
}

// ── QR Pattern ────────────────────────────────────────────────────────────────
function QRPattern({ value, faded = false }: { value: string; faded?: boolean }) {
  const SIZE = 21;
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  const finderDark = (r: number, c: number, br: number, bc: number) => {
    const [lr, lc] = [r - br, c - bc];
    return (lr === 0 || lr === 6 || lc === 0 || lc === 6) || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
  };
  const dark = (r: number, c: number): boolean => {
    if (r < 7 && c < 7) return finderDark(r, c, 0, 0);
    if (r < 7 && c >= SIZE - 7) return finderDark(r, c, 0, SIZE - 7);
    if (r >= SIZE - 7 && c < 7) return finderDark(r, c, SIZE - 7, 0);
    if ((r < 8 && c < 8) || (r < 8 && c >= SIZE - 8) || (r >= SIZE - 8 && c < 8)) return false;
    if (r === 6) return c % 2 === 0;
    if (c === 6) return r % 2 === 0;
    return ((hash ^ (r * 127 + c * 31)) >>> 0) % 100 > 42;
  };
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={`w-full h-full ${faded ? "opacity-15 grayscale" : ""}`} shapeRendering="crispEdges">
      {Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) =>
          dark(r, c) ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" /> : null
        )
      )}
    </svg>
  );
}

// ── Timer Ring ────────────────────────────────────────────────────────────────
function TimerRing({ pct, children }: { pct: number; children: React.ReactNode }) {
  const r = 54, circ = 2 * Math.PI * r;
  const color = pct < 0.15 ? "#dc2626" : pct < 0.35 ? "#f59e0b" : "#1b4332";
  return (
    <div className="relative w-44 h-44 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#eae7df" strokeWidth={7} />
        <circle cx={60} cy={60} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s linear, stroke 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ── Seat Button ───────────────────────────────────────────────────────────────
function SeatBtn({ seat, isSelected, isOccupied, onSelect, displayLabel }: {
  seat: Seat; isSelected: boolean; isOccupied: boolean;
  onSelect: (id: string) => void; displayLabel?: string;
}) {
  const meta = ZONE_META[seat.zone];
  return (
    <button
      disabled={isOccupied}
      onClick={() => onSelect(seat.id)}
      title={isOccupied ? "Occupied" : `${seatName(seat)} — $${meta.price}/hr`}
      className={[
        "w-10 h-10 rounded-xl text-[11px] font-mono font-semibold border transition-all duration-150 flex items-center justify-center shrink-0",
        isOccupied  ? "bg-[#ebe8e1] border-[#dedad0] text-[#c4bfb5] cursor-not-allowed"
        : isSelected ? "ring-2 ring-offset-1 shadow-md scale-110 cursor-pointer border-transparent text-white"
                     : "bg-card border-border/70 hover:scale-105 hover:shadow cursor-pointer",
      ].join(" ")}
      style={isSelected ? { backgroundColor: meta.hex } : !isOccupied ? { color: meta.hex } : undefined}
    >
      {displayLabel ?? seat.label}
    </button>
  );
}

// ── Hot Desk Zone — 6 tables in 3×2 grid ──────────────────────────────────────
function HotDeskZone({ occupied, selectedId, onSelect }: {
  occupied: Set<string>; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const tables = Array.from({ length: 6 }, (_, t) => ({
    num: t + 1,
    seats: HOT_DESK_SEATS.slice(t * 4, t * 4 + 4), // A B C D
  }));
  const hex = ZONE_META.hotdesk.hex, light = ZONE_META.hotdesk.light;

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{ color: hex }}><Wifi className="w-3 h-3" /></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: hex }}>Hot Desks</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">$8/hr</span>
      </div>
      {/* 3 columns × 2 rows of tables */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-5">
        {tables.map(({ num, seats: [a, b, c, d] }) => (
          <div key={num} className="flex flex-col items-center gap-[3px]">
            {/* Top seats (A, B) — facing down toward table */}
            <div className="flex gap-1.5">
              <SeatBtn seat={a} isSelected={selectedId === a.id} isOccupied={occupied.has(a.id)} onSelect={onSelect} displayLabel="A" />
              <SeatBtn seat={b} isSelected={selectedId === b.id} isOccupied={occupied.has(b.id)} onSelect={onSelect} displayLabel="B" />
            </div>
            {/* Table surface */}
            <div className="w-full h-7 rounded-lg border flex items-center justify-center"
              style={{ backgroundColor: light, borderColor: `${hex}35` }}>
              <span className="text-[10px] font-semibold" style={{ color: hex }}>Table {num}</span>
            </div>
            {/* Bottom seats (C, D) — facing up toward table */}
            <div className="flex gap-1.5">
              <SeatBtn seat={c} isSelected={selectedId === c.id} isOccupied={occupied.has(c.id)} onSelect={onSelect} displayLabel="C" />
              <SeatBtn seat={d} isSelected={selectedId === d.id} isOccupied={occupied.has(d.id)} onSelect={onSelect} displayLabel="D" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Focus Pod Zone — ∩ (upside-down U) layout ─────────────────────────────────
// Top row: F1 F2 F3 F4
// Side rows (workspace in center): F5 | workspace | F6
//                                  F7 | workspace | F8
function FocusPodZone({ occupied, selectedId, onSelect }: {
  occupied: Set<string>; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const [f1, f2, f3, f4, f5, f6, f7, f8] = FOCUS_SEATS;
  const hex = ZONE_META.focus.hex, light = ZONE_META.focus.light;
  const btn = (s: Seat) => (
    <SeatBtn key={s.id} seat={s} isSelected={selectedId === s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} />
  );
  // Workspace width = 2 inner seats + 1 gap = 2×2.5rem + 0.375rem
  const wsWidth = "calc(2 * 2.5rem + 0.375rem)";

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{ color: hex }}><Zap className="w-3 h-3" /></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: hex }}>Focus Pods</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">$12/hr</span>
      </div>

      {/* ∩ shape — open at bottom */}
      <div className="w-fit mx-auto flex flex-col gap-[3px]">
        {/* Top row: 4 cubicle seats facing inward */}
        <div className="flex gap-1.5">
          {[f1, f2, f3, f4].map(btn)}
        </div>
        {/* Upper side row */}
        <div className="flex gap-1.5 items-center">
          {btn(f5)}
          <div className="h-10 rounded-xl border border-dashed flex items-center justify-center"
            style={{ width: wsWidth, backgroundColor: light, borderColor: `${hex}30` }}>
            <span className="text-[9px] font-mono tracking-[0.18em] font-medium" style={{ color: `${hex}70` }}>WORKSPACE</span>
          </div>
          {btn(f6)}
        </div>
        {/* Lower side row */}
        <div className="flex gap-1.5 items-center">
          {btn(f7)}
          <div className="h-10 rounded-xl border border-dashed"
            style={{ width: wsWidth, backgroundColor: light, borderColor: `${hex}30` }} />
          {btn(f8)}
        </div>
        {/* Open bottom label */}
        <div className="flex justify-center pt-1">
          <span className="text-[9px] text-muted-foreground tracking-wider">↑ ENTRANCE</span>
        </div>
      </div>
    </div>
  );
}

// ── Standing Desk Zone ────────────────────────────────────────────────────────
function StandingDeskZone({ occupied, selectedId, onSelect }: {
  occupied: Set<string>; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const hex = ZONE_META.standing.hex, light = ZONE_META.standing.light;
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{ color: hex }}><Coffee className="w-3 h-3" /></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: hex }}>Standing Desks</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">$8/hr</span>
      </div>
      <div className="flex gap-4 justify-center">
        {STANDING_SEATS.map(s => (
          <div key={s.id} className="flex flex-col items-center gap-1">
            <SeatBtn seat={s} isSelected={selectedId === s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} />
            {/* Desk body */}
            <div className="w-10 rounded-lg border overflow-hidden" style={{ backgroundColor: light, borderColor: `${hex}30` }}>
              <div className="h-1.5 w-full" style={{ backgroundColor: `${hex}25` }} />
              <div className="h-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Private Office Zone ───────────────────────────────────────────────────────
function PrivateOfficeZone({ occupied, selectedId, onSelect }: {
  occupied: Set<string>; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const hex = ZONE_META.private.hex, light = ZONE_META.private.light;
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{ color: hex }}><Lock className="w-3 h-3" /></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: hex }}>Private Offices</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">$20/hr</span>
      </div>
      <div className="flex gap-5 justify-center">
        {PRIVATE_SEATS.map(s => {
          const isSel = selectedId === s.id, isOcc = occupied.has(s.id);
          return (
            <button key={s.id} disabled={isOcc} onClick={() => onSelect(s.id)}
              title={isOcc ? "Occupied" : `${s.label} — $${ZONE_META.private.price}/hr`}
              className={[
                "w-[88px] h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all relative overflow-hidden",
                isOcc  ? "bg-[#ebe8e1] border-[#dedad0] cursor-not-allowed"
                : isSel ? "shadow-lg scale-105 cursor-pointer border-transparent"
                        : "border-dashed hover:scale-105 cursor-pointer",
              ].join(" ")}
              style={isSel ? { backgroundColor: hex, borderColor: hex } : !isOcc ? { backgroundColor: light, borderColor: `${hex}40` } : undefined}
            >
              {/* Door graphic */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-7 h-9 rounded-t-lg border-2"
                style={{ borderColor: isOcc ? "#c4bfb5" : isSel ? "rgba(255,255,255,0.5)" : `${hex}50`, borderBottomWidth: 0 }}>
                <div className="absolute right-1 top-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: isOcc ? "#c4bfb5" : isSel ? "rgba(255,255,255,0.7)" : hex }} />
              </div>
              <Building2 className="w-4 h-4 relative z-10" style={{ color: isOcc ? "#c4bfb5" : isSel ? "white" : hex }} />
              <span className="text-[11px] font-semibold relative z-10" style={{ color: isOcc ? "#c4bfb5" : isSel ? "white" : hex }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Floor Map ─────────────────────────────────────────────────────────────────
function FloorMap({ occupied, selectedId, onSelect, readOnly = false }: {
  occupied: Set<string>; selectedId: string | null;
  onSelect: (id: string) => void; readOnly?: boolean;
}) {
  const sel = readOnly ? null : selectedId;
  const handler = readOnly ? () => {} : onSelect;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <HotDeskZone   occupied={occupied} selectedId={sel} onSelect={handler} />
        <FocusPodZone  occupied={occupied} selectedId={sel} onSelect={handler} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StandingDeskZone  occupied={occupied} selectedId={sel} onSelect={handler} />
        <PrivateOfficeZone occupied={occupied} selectedId={sel} onSelect={handler} />
      </div>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
function LandingPage({ onSignUp, onAdminLogin }: {
  onSignUp: (c: Customer) => void; onAdminLogin: () => void;
}) {
  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError("Please fill in all fields."); return; }
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    onSignUp({ name: name.trim(), email: email.trim() });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-card px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <MapPin className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-serif text-xl">WorkHub</span>
        </div>
        <button onClick={onAdminLogin}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted transition-all">
          <Shield className="w-3.5 h-3.5" />Admin Login
        </button>
      </nav>

      {/* Hero */}
      <section className="px-8 py-16 md:py-20 max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-accent/60 text-primary rounded-full px-3 py-1.5 text-xs font-semibold mb-6">
            <Sparkles className="w-3 h-3" />Now open · City Centre
          </div>
          <h1 className="font-serif text-5xl md:text-[3.5rem] leading-[1.1] mb-5">
            Your space,<br />your hours.
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-8">
            Book a desk in minutes. Choose your zone, pick your hours, and get a QR code to check in instantly. No membership required.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {["Flexible hours", "Instant QR check-in", "4 distinct zones", "City centre location"].map(f => (
              <span key={f} className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />{f}
              </span>
            ))}
          </div>
        </div>

        {/* Sign-up card */}
        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
          <h2 className="font-serif text-2xl mb-0.5">Get started</h2>
          <p className="text-sm text-muted-foreground mb-6">Enter your details to browse and book a seat</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input value={name} onChange={e => { setName(e.target.value); setError(""); }}
              placeholder="Full name"
              className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground" />
            <input value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
              placeholder="Email address" type="email"
              className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground" />
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-red-600">{error}</motion.p>
              )}
            </AnimatePresence>
            <button type="submit"
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-sm">
              Browse Available Seats <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">No account needed. Just your name and email.</p>
        </div>
      </section>

      {/* Zone cards */}
      <section className="bg-card border-y border-border px-8 py-14">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif text-3xl text-center mb-1">Choose your zone</h2>
          <p className="text-muted-foreground text-center text-sm mb-8">All zones include high-speed Wi-Fi and ergonomic furniture</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["hotdesk", "focus", "standing", "private"] as Zone[]).map(z => {
              const m = ZONE_META[z];
              return (
                <div key={z} className="rounded-2xl border p-5" style={{ backgroundColor: m.light, borderColor: `${m.hex}25` }}>
                  <span style={{ color: m.hex }}>{m.icon}</span>
                  <div className="font-semibold mt-2 mb-0.5 text-sm" style={{ color: m.hex }}>{m.label}</div>
                  <div className="font-mono text-2xl font-bold" style={{ color: m.hex }}>
                    ${m.price}<span className="text-sm font-normal font-sans">/hr</span>
                  </div>
                  <div className="text-xs mt-2 leading-relaxed" style={{ color: `${m.hex}99` }}>
                    {z === "hotdesk"  && "Open tables with power & dual monitors"}
                    {z === "focus"    && "Enclosed cubicle booths for deep focus"}
                    {z === "standing" && "Adjustable height, great for posture"}
                    {z === "private"  && "Private room with whiteboard & screen"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-8 py-14 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: <QrCode className="w-5 h-5" />, title: "Instant QR Check-in", desc: "Pay online, receive a QR code. Show it at reception and your session starts immediately — no paperwork." },
            { icon: <Timer className="w-5 h-5" />,  title: "Live Session Timer",  desc: "Track remaining time from your phone. Get a notification when your session is about to end." },
            { icon: <Users className="w-5 h-5" />,  title: "Real-time Availability", desc: "See exactly which seats are open right now before you book. No surprises on arrival." },
          ].map(f => (
            <div key={f.title} className="bg-card rounded-2xl border border-border p-6">
              <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center text-primary mb-3">{f.icon}</div>
              <div className="font-semibold mb-1.5">{f.title}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Admin Login Page ──────────────────────────────────────────────────────────
function AdminLoginPage({ onLogin, onBack }: { onLogin: () => void; onBack: () => void; }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState(false);
  const [loading,  setLoading]  = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (username === ADMIN_CREDS.username && password === ADMIN_CREDS.password) onLogin();
      else setError(true);
    }, 700);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-card px-8 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to site
        </button>
      </nav>
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-serif text-xl leading-tight">WorkHub Admin</div>
              <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Secure Access</div>
            </div>
          </div>

          <div className="bg-card rounded-3xl border border-border p-7 shadow-sm">
            <h1 className="font-serif text-2xl mb-0.5">Sign in</h1>
            <p className="text-sm text-muted-foreground mb-6">Admin and reception staff only</p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Username</label>
                <input value={username} onChange={e => { setUsername(e.target.value); setError(false); }}
                  placeholder="admin" autoComplete="username"
                  className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Password</label>
                <div className="relative">
                  <input value={password} onChange={e => { setPassword(e.target.value); setError(false); }}
                    type={showPw ? "text" : "password"} placeholder="••••••••" autoComplete="current-password"
                    className="w-full bg-background rounded-xl px-4 py-3 pr-10 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden">
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />Incorrect username or password.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button type="submit" disabled={loading || !username || !password}
                className={[
                  "w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                  username && password && !loading
                    ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                ].join(" ")}>
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Verifying…</>
                ) : "Sign in to Admin Panel"}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">Demo credentials</p>
              <p className="text-xs mt-0.5">
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">admin</span>
                {" / "}
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">workhub2024</span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view,       setView]       = useState<AppView>("landing");
  const [adminTab,   setAdminTab]   = useState<AdminTab>("scan");
  const [customer,   setCustomer]   = useState<Customer | null>(null);
  const [adminAuth,  setAdminAuth]  = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [duration,   setDuration]   = useState(2);
  const [booking,    setBooking]    = useState<Booking | null>(null);
  const [secsLeft,   setSecsLeft]   = useState(0);
  const [occupied,   setOccupied]   = useState<Set<string>>(new Set(BASE_OCCUPIED));
  const [scanInput,  setScanInput]  = useState("");
  const [scanState,  setScanState]  = useState<"idle" | "valid" | "invalid" | "checkedIn">("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const seat     = SEATS.find(s => s.id === selectedId) ?? null;
  const meta     = seat ? ZONE_META[seat.zone] : null;
  const subtotal = seat ? ZONE_META[seat.zone].price * duration : 0;
  const fee      = Math.round(subtotal * 0.1);
  const grand    = subtotal + fee;
  const pct      = booking ? secsLeft / (booking.duration * 3600) : 1;
  const warning  = secsLeft > 0 && (pct < 0.2 || secsLeft <= 900);

  useEffect(() => () => { timerRef.current && clearInterval(timerRef.current); }, []);

  const startTimer = useCallback((b: Booking) => {
    const updated = { ...b, status: "active" as const, checkInAt: new Date() };
    setBooking(updated);
    setSecsLeft(b.duration * 3600);
    setView("active");
    timerRef.current = setInterval(() => {
      setSecsLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); setView("expired"); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  function handlePay() {
    if (!seat || !customer) return;
    const b: Booking = {
      ref: genRef(), seatId: seat.id, duration,
      name: customer.name, email: customer.email,
      paidAt: new Date(), status: "paid",
    };
    setBooking(b);
    setOccupied(prev => new Set([...prev, seat.id]));
    setView("qr");
  }

  function handleScan() {
    const code = scanInput.trim().toUpperCase();
    if (!code) return;
    if (booking && code === booking.ref) {
      setScanState(booking.status === "active" ? "checkedIn" : booking.status === "expired" ? "invalid" : "valid");
    } else {
      const found = DEMO_SESSIONS.find(b => b.ref === code);
      setScanState(found ? (found.status === "active" ? "checkedIn" : "valid") : "invalid");
    }
  }

  function handleCheckIn() {
    if (booking && scanInput.trim().toUpperCase() === booking.ref) {
      startTimer(booking);
      setScanInput(""); setScanState("idle");
    }
  }

  // ── LANDING ────────────────────────────────────────────────────────────────
  if (view === "landing") return (
    <LandingPage
      onSignUp={c => { setCustomer(c); setView("book"); }}
      onAdminLogin={() => setView("adminLogin")}
    />
  );

  // ── ADMIN LOGIN ────────────────────────────────────────────────────────────
  if (view === "adminLogin") return (
    <AdminLoginPage
      onLogin={() => { setAdminAuth(true); setView("admin"); }}
      onBack={() => setView(customer ? "book" : "landing")}
    />
  );

  // ── BOOKING ────────────────────────────────────────────────────────────────
  if (view === "book") return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("landing")} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="text-left">
              <div className="font-serif text-xl leading-tight">WorkHub</div>
              <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Coworking Space</div>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {customer && <span className="text-xs text-muted-foreground">Hello, <span className="font-medium text-foreground">{customer.name.split(" ")[0]}</span></span>}
          <button onClick={() => setView("adminLogin")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted transition-all">
            <Shield className="w-3.5 h-3.5" />Admin
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Floor map */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-5">
            <h1 className="font-serif text-2xl mb-0.5">Choose Your Seat</h1>
            <p className="text-sm text-muted-foreground">Select a zone and seat — all include high-speed Wi-Fi</p>
          </div>
          <FloorMap occupied={occupied} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="flex items-center gap-5 mt-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-[#ebe8e1] border border-[#dedad0]" />Occupied</span>
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-card border border-border" />Available</span>
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-primary" />Selected</span>
          </div>
        </div>

        {/* Booking sidebar */}
        <div className="w-[300px] bg-card border-l border-border flex flex-col">
          <div className="px-5 py-5 border-b border-border">
            <h2 className="font-serif text-xl">Your Booking</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedId ? `${seatName(seat!)} selected` : "No seat selected yet"}
            </p>
          </div>
          <div className="flex-1 overflow-auto p-5 space-y-5">
            {seat && meta ? (
              <div className="rounded-xl p-4 border" style={{ backgroundColor: meta.light, borderColor: `${meta.hex}30` }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span style={{ color: meta.hex }}>{meta.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: meta.hex }}>{meta.label}</span>
                </div>
                <div className="font-serif text-2xl" style={{ color: meta.hex }}>{seatName(seat)}</div>
                <div className="text-xs mt-1" style={{ color: `${meta.hex}99` }}>${meta.price} per hour</div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Click any available seat to begin
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Duration</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                  <button key={h} onClick={() => setDuration(h)}
                    className={["rounded-xl py-2 text-sm font-semibold border transition-all",
                      duration === h ? "bg-primary text-primary-foreground border-primary shadow" : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                    ].join(" ")}>{h}h</button>
                ))}
              </div>
            </div>

            {seat && (
              <div className="space-y-2 text-sm border-t border-border pt-4">
                <div className="flex justify-between text-muted-foreground">
                  <span>{meta?.label} × {duration}h</span><span>${subtotal}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Service fee (10%)</span><span>${fee}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-border pt-2.5">
                  <span>Total</span><span className="text-primary">${grand}</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-5 border-t border-border">
            <button disabled={!seat} onClick={() => setView("pay")}
              className={["w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all",
                seat ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm" : "bg-muted text-muted-foreground cursor-not-allowed",
              ].join(" ")}>
              Continue to Payment <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── PAYMENT ────────────────────────────────────────────────────────────────
  if (view === "pay") return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <button onClick={() => setView("book")} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to seat map
        </button>
        <h1 className="font-serif text-3xl mb-0.5">Complete Your Booking</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {seat ? seatName(seat) : ""} · {seat ? ZONE_META[seat.zone].label : ""} · {duration}h
        </p>
        <div className="space-y-3 mb-4">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your Details</p>
            <input value={customer?.name ?? ""} readOnly
              className="w-full bg-muted/50 rounded-xl px-4 py-3 text-sm border border-border text-foreground" />
            <input value={customer?.email ?? ""} readOnly
              className="w-full bg-muted/50 rounded-xl px-4 py-3 text-sm border border-border text-foreground" />
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment</p>
            <input placeholder="Card number" defaultValue="4242 4242 4242 4242"
              className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono placeholder:font-sans transition-colors placeholder:text-muted-foreground" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="MM / YY" defaultValue="08 / 28"
                className="bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono placeholder:font-sans transition-colors placeholder:text-muted-foreground" />
              <input placeholder="CVC" defaultValue="123"
                className="bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono placeholder:font-sans transition-colors placeholder:text-muted-foreground" />
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-1.5"><span>Subtotal</span><span>${subtotal}</span></div>
            <div className="flex justify-between text-sm text-muted-foreground mb-2.5"><span>Service fee (10%)</span><span>${fee}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-border pt-2.5"><span>Total</span><span className="text-primary">${grand}</span></div>
          </div>
        </div>
        <button onClick={handlePay}
          className="w-full rounded-xl py-3.5 text-sm font-semibold bg-primary text-primary-foreground flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow">
          Pay ${grand} & Get QR Code <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );

  // ── QR CODE ────────────────────────────────────────────────────────────────
  if (view === "qr" && booking) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm text-center">
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-5 h-5 text-primary" />
        </div>
        <h1 className="font-serif text-3xl mb-1">Booking Confirmed!</h1>
        <p className="text-sm text-muted-foreground mb-6">Show this QR code at reception to check in and start your session.</p>
        <div className="bg-card rounded-3xl border border-border p-6 mb-3 shadow-sm">
          <div className="w-48 h-48 mx-auto mb-4 p-2.5 bg-background rounded-2xl border border-border text-foreground">
            <QRPattern value={booking.ref} />
          </div>
          <div className="font-mono text-xl font-bold tracking-widest">{booking.ref}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Booking Reference</div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 text-left text-sm space-y-2.5 mb-4">
          {([
            ["Seat",      seat ? seatName(seat) : ""],
            ["Zone",      seat ? ZONE_META[seat.zone].label : ""],
            ["Duration",  `${booking.duration}h`],
            ["Total Paid",`$${grand}`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-3">Your timer starts once reception validates your QR code.</p>
        <button onClick={() => setView("adminLogin")}
          className="text-xs text-primary underline underline-offset-2 hover:opacity-70 transition-opacity">
          → Admin panel to simulate check-in
        </button>
      </motion.div>
    </div>
  );

  // ── ACTIVE SESSION ─────────────────────────────────────────────────────────
  if (view === "active" && booking) {
    const endTime = booking.checkInAt
      ? new Date(booking.checkInAt.getTime() + booking.duration * 3600000)
          .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "--";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-sm">
          <AnimatePresence>
            {warning && (
              <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
                className={["flex items-start gap-2.5 rounded-2xl border px-4 py-3 mb-5 text-sm",
                  secsLeft < 300 ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800",
                ].join(" ")}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{secsLeft < 300 ? "Session ending very soon!" : "Session ending soon"}</div>
                  <div className="text-xs opacity-80 mt-0.5">
                    {secsLeft < 300 ? "Please wrap up and vacate your seat." : "You have less than 15 minutes remaining."}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="bg-card rounded-3xl border border-border p-8 mb-3 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span>Session active</span>
            </div>
            <TimerRing pct={pct}>
              <div>
                <div className="font-mono font-bold text-2xl leading-none">{fmtTime(secsLeft)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">remaining</div>
              </div>
            </TimerRing>
            <div className="grid grid-cols-2 gap-4 text-sm mt-7 pt-5 border-t border-border text-left">
              {([
                ["Seat",       seat ? seatName(seat) : booking.seatId],
                ["Booked for", `${booking.duration}h`],
                ["Checked in", booking.checkInAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ?? "--"],
                ["Ends at",    endTime],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{k}</div>
                  <div className="font-semibold">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Ref <span className="font-mono font-medium text-foreground">{booking.ref}</span></span>
            <span className="text-[10px] bg-accent text-primary rounded-full px-2 py-0.5 font-medium">Active</span>
          </div>
          {secsLeft > 300 && (
            <div className="text-center mt-4">
              <button onClick={() => setSecsLeft(180)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors">
                Demo: skip to last 3 minutes
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // ── EXPIRED ────────────────────────────────────────────────────────────────
  if (view === "expired" && booking) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
          <XCircle className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-serif text-3xl mb-2">Session Ended</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your {booking.duration}-hour session has concluded. This QR code is now invalid.
        </p>
        <div className="bg-card rounded-3xl border border-border p-6 mb-5 shadow-sm">
          <div className="w-40 h-40 mx-auto mb-4 text-foreground"><QRPattern value={booking.ref} faded /></div>
          <div className="font-mono text-base text-muted-foreground line-through tracking-widest">{booking.ref}</div>
          <div className="inline-flex items-center gap-1.5 mt-2.5 bg-red-50 border border-red-100 text-red-600 rounded-full px-3 py-1 text-xs font-semibold">
            <XCircle className="w-3 h-3" />INVALID
          </div>
        </div>
        <button onClick={() => { setBooking(null); setSelectedId(null); setOccupied(new Set(BASE_OCCUPIED)); setView("book"); }}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity shadow">
          Book Another Seat
        </button>
      </motion.div>
    </div>
  );

  // ── ADMIN PANEL ────────────────────────────────────────────────────────────
  if (view === "admin" && adminAuth) return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <div className="font-serif text-xl leading-tight">WorkHub Admin</div>
            <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Reception Panel</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView(booking?.status === "active" ? "active" : booking?.status === "paid" ? "qr" : customer ? "book" : "landing")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border bg-card rounded-lg px-3 py-1.5 hover:bg-muted transition-all">
            <ArrowLeft className="w-3.5 h-3.5" />Customer View
          </button>
          <button onClick={() => { setAdminAuth(false); setView("adminLogin"); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
            Sign out
          </button>
        </div>
      </header>

      <div className="bg-card border-b border-border px-6">
        <div className="flex">
          {([
            { key: "scan",     label: "Scan & Check-in",   icon: <ScanLine className="w-3.5 h-3.5" /> },
            { key: "sessions", label: "Active Sessions",    icon: <Timer    className="w-3.5 h-3.5" /> },
            { key: "floor",    label: "Floor Overview",     icon: <MapPin   className="w-3.5 h-3.5" /> },
          ] as { key: AdminTab; label: string; icon: React.ReactNode }[]).map(t => (
            <button key={t.key} onClick={() => setAdminTab(t.key)}
              className={["flex items-center gap-1.5 px-4 py-3.5 text-sm border-b-2 transition-colors",
                adminTab === t.key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* SCAN */}
        {adminTab === "scan" && (
          <div className="max-w-md mx-auto">
            <h2 className="font-serif text-2xl mb-1">Validate Customer</h2>
            <p className="text-sm text-muted-foreground mb-6">Enter or scan the booking reference to check a customer in and start their timer.</p>
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex gap-2.5">
                <input value={scanInput} onChange={e => { setScanInput(e.target.value.toUpperCase()); setScanState("idle"); }}
                  placeholder="e.g. CW-7734" onKeyDown={e => e.key === "Enter" && handleScan()}
                  className="flex-1 bg-background rounded-xl px-4 py-3 text-sm font-mono tracking-wider border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground" />
                <button onClick={handleScan}
                  className="bg-primary text-primary-foreground px-4 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1.5 text-sm font-medium">
                  <ScanLine className="w-4 h-4" />Scan
                </button>
              </div>

              <AnimatePresence mode="wait">
                {scanState !== "idle" && (
                  <motion.div key={scanState} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    {scanState === "valid" && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm mb-3">
                          <CheckCircle className="w-4 h-4" />Valid booking found
                        </div>
                        {booking && booking.ref === scanInput && (
                          <div className="text-sm space-y-1.5 text-emerald-900/70 mb-4">
                            <div className="flex justify-between"><span>Name</span><span className="font-medium text-emerald-900">{booking.name}</span></div>
                            <div className="flex justify-between"><span>Seat</span><span className="font-medium font-mono text-emerald-900">{booking.seatId}</span></div>
                            <div className="flex justify-between"><span>Duration</span><span className="font-medium text-emerald-900">{booking.duration}h</span></div>
                          </div>
                        )}
                        <button onClick={handleCheckIn}
                          className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4" />Check In & Start Timer
                        </button>
                      </div>
                    )}
                    {scanState === "checkedIn" && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                        <div className="flex items-center gap-2 font-semibold mb-1"><Timer className="w-4 h-4" />Already checked in</div>
                        <p className="text-blue-600/80 text-xs">This customer has an active session in progress.</p>
                      </div>
                    )}
                    {scanState === "invalid" && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <div className="flex items-center gap-2 font-semibold mb-1"><XCircle className="w-4 h-4" />Invalid or expired</div>
                        <p className="text-red-600/80 text-xs">No valid booking found for this reference.</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {booking && booking.status === "paid" && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Pending check-in:{" "}
                    <button onClick={() => { setScanInput(booking.ref); setScanState("idle"); }}
                      className="font-mono text-primary underline underline-offset-2">{booking.ref}</button>
                    {" "}({booking.name})
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Demo references to try:</p>
              <div className="flex flex-wrap gap-2">
                {DEMO_SESSIONS.map(b => (
                  <button key={b.ref} onClick={() => { setScanInput(b.ref); setScanState("idle"); }}
                    className="font-mono text-xs bg-card border border-border rounded-lg px-2.5 py-1 hover:border-primary/50 hover:text-primary transition-colors">
                    {b.ref}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SESSIONS */}
        {adminTab === "sessions" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-serif text-2xl mb-0.5">Active Sessions</h2>
                <p className="text-sm text-muted-foreground">
                  {DEMO_SESSIONS.length + (booking?.status === "active" ? 1 : 0)} customers currently checked in
                </p>
              </div>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:text-foreground bg-card hover:bg-muted transition-all">
                <RefreshCw className="w-3 h-3" />Refresh
              </button>
            </div>
            <div className="space-y-3 max-w-2xl">
              {booking?.status === "active" && (
                <div className="bg-card rounded-2xl border border-primary/30 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-semibold">{booking.name}</span>
                        <span className="text-[10px] bg-accent text-primary rounded-full px-2 py-0.5 font-medium">Just checked in</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{booking.ref}</span><span>·</span>
                        <span>{seat ? seatName(seat) : booking.seatId}</span><span>·</span>
                        <span>{booking.duration}h booked</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-bold text-primary">{fmtTime(secsLeft)}</div>
                      <div className="text-[10px] text-muted-foreground">remaining</div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct * 100}%`, transition: "width 1s linear" }} />
                  </div>
                </div>
              )}
              {DEMO_SESSIONS.map(b => {
                const rem = sessionSecsLeft(b), p = rem / (b.duration * 3600), exp = p < 0.25;
                const bSeat = SEATS.find(s => s.id === b.seatId);
                return (
                  <div key={b.ref} className={["bg-card rounded-2xl border p-4 shadow-sm", exp ? "border-amber-300" : "border-border"].join(" ")}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-semibold">{b.name}</span>
                          {exp && <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium"><AlertTriangle className="w-2.5 h-2.5" />Expiring</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{b.ref}</span><span>·</span>
                          <span>{bSeat ? seatName(bSeat) : b.seatId}</span>
                          {bSeat && <><span>·</span><span>{ZONE_META[bSeat.zone].label}</span></>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={["font-mono text-xl font-bold", exp ? "text-amber-600" : "text-foreground"].join(" ")}>{fmtHm(rem)}</div>
                        <div className="text-[10px] text-muted-foreground">remaining</div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p * 100}%`, backgroundColor: exp ? "#f59e0b" : "#1b4332" }} />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                      <span>Check-in {b.checkInAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{b.duration}h session</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FLOOR */}
        {adminTab === "floor" && (
          <div>
            <h2 className="font-serif text-2xl mb-0.5">Floor Overview</h2>
            <p className="text-sm text-muted-foreground mb-4">Real-time seat availability across all zones</p>
            <div className="flex items-center gap-4 mb-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-[#ebe8e1] border border-[#dedad0]" />{occupied.size} occupied</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-card border border-border" />{SEATS.length - occupied.size} available</span>
              <span className="ml-auto flex items-center gap-1.5 text-primary font-medium">
                <Users className="w-3.5 h-3.5" />{Math.round((occupied.size / SEATS.length) * 100)}% capacity
              </span>
            </div>
            <div className="max-w-2xl">
              <FloorMap occupied={occupied} selectedId={null} onSelect={() => {}} readOnly />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-5 max-w-2xl">
              {(["hotdesk", "focus", "standing", "private"] as Zone[]).map(z => {
                const total = SEATS.filter(s => s.zone === z).length;
                const taken = SEATS.filter(s => s.zone === z && occupied.has(s.id)).length;
                const m = ZONE_META[z];
                return (
                  <div key={z} className="bg-card rounded-xl border border-border p-3.5">
                    <div className="flex items-center gap-1.5 mb-2" style={{ color: m.hex }}>{m.icon}<span className="text-xs font-semibold">{m.label}</span></div>
                    <div className="font-mono text-xl font-bold">{total - taken}<span className="text-sm text-muted-foreground font-sans font-normal">/{total}</span></div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">available</div>
                    <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(taken / total) * 100}%`, backgroundColor: m.hex }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Redirect unauthenticated admin
  if (view === "admin" && !adminAuth) { setView("adminLogin"); return null; }
  return null;
}
