import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle, XCircle, Timer, AlertTriangle,
  ChevronRight, ArrowLeft, Wifi, Zap, Lock, Shield,
  ScanLine, RefreshCw, Users, Eye, EyeOff, Building2,
  Sparkles, ArrowRight, QrCode, Plus, Minus, ShoppingBag,
  Truck, UtensilsCrossed, Filter, Calendar, Clock, Pencil, User, Mail, Phone,
  LogOut, Trash2, UserPlus, ToggleLeft, ToggleRight, Download, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type AppView =
  | "landingPage" | "landing" | "book" | "pay" | "payPending" | "qr" | "food" | "active" | "expired"
  | "adminLogin" | "adminSignup" | "admin"
  | "vendorLogin" | "vendor";
type AdminTab = "payments" | "scan" | "customers" | "availability" | "dashboard" | "orders" | "logs" | "accounts";
type VendorTab = "menu" | "orders" | "dashboard" | "accounts";
type Zone = "focus" | "discussion" | "room";
type VendorType = string;

interface Seat { id: string; label: string; zone: Zone; }
interface Customer { name: string; email: string; phone: string; }
interface VendorCompany { id: VendorType; label: string; isOpen: boolean; }
interface Booking {
  ref: string; seatId: string; date: string; startHour: number; duration: number;
  startAt?: Date;
  name: string; email: string; phone?: string; paidAt: Date;
  status: "payment_pending" | "paid" | "active" | "expired" | "completed" | "cancelled"; checkInAt?: Date;
  subtotal?: number; serviceFee?: number; total?: number;
  emailStatus?: { ok: boolean; mode?: string; error?: string };
}
interface FoodItem { id: string; name: string; price: number; vendor: VendorType; vendorLabel?: string; vendorOpen?: boolean; category: string; description?: string; available: boolean; imageUrl?: string; }
interface CartItem { item: FoodItem; qty: number; }
interface OrderLine { itemId: string; name: string; price: number; qty: number; }
interface FoodOrder {
  id: string; bookingRef: string; seatId: string; customerName: string;
  lines: OrderLine[]; delivery: "table" | "pickup";
  total: number; status: "pending" | "preparing" | "ready" | "completed";
  placedAt: Date; vendor: VendorType; vendorLabel?: string;
}
interface FoodPaymentRequestItem {
  vendor: VendorType;
  vendorLabel: string;
  itemId: string;
  name: string;
  price: number;
  qty: number;
}
interface FoodPaymentRequest {
  id: string;
  bookingRef: string;
  seatId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  delivery: "table" | "pickup";
  description: string;
  subtotal: number;
  total: number;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  items: FoodPaymentRequestItem[];
  orders: FoodOrder[];
}
interface AdminAccount { id: string; username: string; password: string; role: "superadmin" | "admin"; createdAt: Date; }
interface ActivityLog {
  id: number;
  adminId: string;
  adminUsername: string;
  adminRole: "superadmin" | "admin";
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, any>;
  createdAt: Date;
}
interface AdminDashboard {
  bookingRevenue: number;
  foodRevenue: number;
  totalRevenue: number;
  bookingCounts: {
    total: number;
    paid: number;
    active: number;
    completed: number;
    expired: number;
    cancelled: number;
    future: number;
    past: number;
  };
  vendorTotals: Array<{ vendor: VendorType; label: string; orders: number; revenue: number }>;
}
interface VendorAccount {
  id: string;
  username: string;
  role: "superadmin" | "vendor";
  vendorId: VendorType | null;
  vendorLabel: string | null;
  createdAt: Date;
}
interface VendorDashboard {
  revenue: number;
  orderCounts: {
    total: number;
    pending: number;
    preparing: number;
    ready: number;
    completed: number;
  };
  vendorTotals: Array<{ vendor: VendorType; label: string; orders: number; revenue: number }>;
}
interface VendorSession {
  id: string;
  username: string;
  role: "superadmin" | "vendor";
  vendorId: VendorType | null;
  vendorLabel: string | null;
}
type SalesRange = "week" | "month" | "year";

// ── Zone meta ─────────────────────────────────────────────────────────────────
const ZONE_META: Record<Zone, { label: string; price: number; hex: string; light: string; icon: React.ReactNode }> = {
  focus:      { label: "Focus Pod",        price: 5,  hex: "#15345d", light: "#eef3fb", icon: <Wifi className="w-3 h-3" /> },
  discussion: { label: "Discussion Table", price: 10, hex: "#335d8f", light: "#eef4fb", icon: <Users className="w-3 h-3" /> },
  room:       { label: "Discussion Room",  price: 35, hex: "#b8863b", light: "#fbf2e2", icon: <Building2 className="w-3 h-3" /> },
};

// ── Seat data ─────────────────────────────────────────────────────────────────
const FOCUS_SEATS: Seat[] = [
  ...Array.from({ length: 4 }, (_, i) => ({ id: `FL${i + 1}`, label: `L${i + 1}`, zone: "focus" as Zone })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `FC${i + 1}`, label: `C${i + 1}`, zone: "focus" as Zone })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `FR${i + 1}`, label: `R${i + 1}`, zone: "focus" as Zone })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `L2A${i + 1}`, label: `Ahead ${i + 1}`, zone: "focus" as Zone })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `L2B${i + 1}`, label: `Upper ${i + 1}`, zone: "focus" as Zone })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `L2R${i + 1}`, label: `Right ${i + 1}`, zone: "focus" as Zone })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `PR${i + 1}`, label: `Private ${i + 1}`, zone: "focus" as Zone })),
];
const DISCUSSION_SEATS: Seat[] = Array.from({ length: 4 }, (_, i) => ({ id: `D${i + 1}`, label: `Table ${i + 1}`, zone: "discussion" as Zone }));
const ROOM_SEAT: Seat = { id: "DR", label: "Whole Room", zone: "room" };
const SEATS = [...FOCUS_SEATS, ...DISCUSSION_SEATS, ROOM_SEAT];

// ── Food menu ─────────────────────────────────────────────────────────────────
const DEFAULT_MENU: FoodItem[] = [
  { id: "c1",  name: "Espresso",           price: 3.50, vendor: "cafe",  category: "Coffee",         available: true },
  { id: "c2",  name: "Latte",              price: 4.50, vendor: "cafe",  category: "Coffee",         available: true },
  { id: "c3",  name: "Cappuccino",         price: 4.50, vendor: "cafe",  category: "Coffee",         available: true },
  { id: "c4",  name: "Flat White",         price: 4.50, vendor: "cafe",  category: "Coffee",         available: true },
  { id: "c5",  name: "Green Tea",          price: 3.00, vendor: "cafe",  category: "Drinks",         available: true },
  { id: "c6",  name: "Still Water",        price: 2.00, vendor: "cafe",  category: "Drinks",         available: true },
  { id: "c7",  name: "Chicken Sandwich",   price: 9.00, vendor: "cafe",  category: "Food",           available: true },
  { id: "c8",  name: "Veggie Sandwich",    price: 8.00, vendor: "cafe",  category: "Food",           available: true },
  { id: "c9",  name: "Croissant",          price: 4.00, vendor: "cafe",  category: "Food",           available: true },
  { id: "c10", name: "Blueberry Muffin",   price: 3.50, vendor: "cafe",  category: "Food",           available: true },
  { id: "c11", name: "Salad Bowl",         price: 12.00,vendor: "cafe",  category: "Food",           available: false },
  { id: "p1",  name: "Margherita (S)",     price: 12.00,vendor: "pizza", category: "Classic",        available: true },
  { id: "p2",  name: "Margherita (L)",     price: 18.00,vendor: "pizza", category: "Classic",        available: true },
  { id: "p3",  name: "Pepperoni (S)",      price: 14.00,vendor: "pizza", category: "Classic",        available: true },
  { id: "p4",  name: "Pepperoni (L)",      price: 20.00,vendor: "pizza", category: "Classic",        available: true },
  { id: "p5",  name: "Veggie Supreme (S)", price: 13.00,vendor: "pizza", category: "Specialty",      available: true },
  { id: "p6",  name: "Veggie Supreme (L)", price: 19.00,vendor: "pizza", category: "Specialty",      available: true },
  { id: "p7",  name: "BBQ Chicken (S)",    price: 15.00,vendor: "pizza", category: "Specialty",      available: true },
  { id: "p8",  name: "BBQ Chicken (L)",    price: 22.00,vendor: "pizza", category: "Specialty",      available: true },
  { id: "p9",  name: "Garlic Bread",       price: 6.00, vendor: "pizza", category: "Sides",          available: true },
  { id: "p10", name: "Chicken Wings (6pc)",price: 10.00,vendor: "pizza", category: "Sides",          available: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDateStr(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function safeHour(offset: number) { return Math.min(Math.max(8, new Date().getHours() + offset), 19); }
function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function fmtHm(sec: number) { const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; }
function fmtHour(h: number) { if (h===12) return "12:00 PM"; if (h<12) return `${h}:00 AM`; return `${h-12}:00 PM`; }
function fmtMoney(n: number) { return `RM ${n.toFixed(2)}`; }
function getFocusPodTotal(duration: number) {
  if (duration >= 6) return 20 + (duration - 6) * 3.33;
  if (duration >= 3) return duration * 4;
  return duration * 5;
}
function getHourlyRate(zone: Zone, duration: number) {
  if (zone === "focus") return duration >= 6 ? 3.33 : duration >= 3 ? 4 : 5;
  if (zone === "discussion") return 10;
  return duration >= 4 ? 25 : 35;
}
function getBookingSubtotal(zone: Zone, duration: number) {
  if (zone === "focus") return getFocusPodTotal(duration);
  return getHourlyRate(zone, duration) * duration;
}
function getSeatPriceHint(zone: Zone, duration: number) {
  if (zone === "focus" && duration >= 6) return "RM 20.00 for 6h, + RM 3.33/hr after";
  return `${fmtMoney(getHourlyRate(zone, duration))}/hr`;
}
function getBookingPriceSummary(zone: Zone, duration: number) {
  if (zone === "focus" && duration >= 6) return "RM 20.00 for 6h + RM 3.33/hr after";
  return `${fmtMoney(getHourlyRate(zone, duration))}/hr × ${duration}h`;
}
function fmtDateLabel(s: string) {
  const d = new Date(s + "T12:00:00");
  return { day: d.toLocaleDateString("en",{weekday:"short"}), num: d.getDate(), month: d.toLocaleDateString("en",{month:"short"}) };
}
function fmtDateFull(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}
function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
}
function isValidPhone(value: string) {
  const phone = normalizePhone(value);
  return /^(?:\+?60|0)1\d{8,9}$/.test(phone);
}
function seatName(seat: Seat) {
  if (seat.zone === "discussion") return seat.label;
  return seat.label;
}
function seatById(id: string) {
  return SEATS.find(seat => seat.id === id) ?? null;
}
function isRollingZone(zone: Zone) {
  return zone === "focus" || zone === "discussion";
}
function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3600000);
}
function openingTime(base = new Date()) {
  const open = new Date(base);
  open.setHours(7, 0, 0, 0);
  return open;
}
function closingTime(base = new Date()) {
  const close = new Date(base);
  close.setHours(22, 0, 0, 0);
  return close;
}
function rollingDurationFits(hoursToBook: number, base = new Date()) {
  return addHours(base, hoursToBook) <= closingTime(base);
}
function rollingBookingWindowOpen(base = new Date()) {
  return base >= openingTime(base) && base <= new Date(base.getFullYear(), base.getMonth(), base.getDate(), 21, 0, 0, 0);
}
function scheduledStart(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`);
}
function bookingStartDate(booking: Booking) {
  if (booking.startAt) return booking.startAt;
  const seat = seatById(booking.seatId);
  if (booking.status !== "payment_pending" && seat && isRollingZone(seat.zone)) {
    return booking.paidAt;
  }
  return scheduledStart(booking.date, booking.startHour);
}
function bookingEndDate(booking: Booking) {
  return addHours(bookingStartDate(booking), booking.duration);
}
function findCurrentCustomerBooking(bookings: Booking[], customer: Customer | null, now = new Date()) {
  if (!customer) return null;
  const email = customer.email.trim().toLowerCase();
  const phone = customer.phone ? normalizePhone(customer.phone) : "";
  return bookings
    .filter(booking => {
      if (!["paid", "active"].includes(booking.status)) return false;
      const bookingEmail = booking.email.trim().toLowerCase();
      const bookingPhone = booking.phone ? normalizePhone(booking.phone) : "";
      const sameCustomer = bookingEmail === email || (phone && bookingPhone === phone);
      if (!sameCustomer) return false;
      const start = bookingStartDate(booking).getTime();
      const end = bookingEndDate(booking).getTime();
      const current = now.getTime();
      return start <= current && end > current;
    })
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0] ?? null;
}
function fmtClock(value: Date) {
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function bookingTimeLabel(booking: Booking) {
  return `${fmtClock(bookingStartDate(booking))} – ${fmtClock(bookingEndDate(booking))}`;
}
function bookingDisplayDate(booking: Booking) {
  return fmtDateFull(booking.date);
}
function bookingStatusAt(booking: Booking, now = new Date()): Booking["status"] {
  return booking.status;
}
function compareAdminBookingOrder(a: Booking, b: Booking, now = new Date()) {
  const aStart = bookingStartDate(a).getTime();
  const bStart = bookingStartDate(b).getTime();
  const aEnd = bookingEndDate(a).getTime();
  const bEnd = bookingEndDate(b).getTime();
  const aPaid = a.paidAt?.getTime?.() ?? 0;
  const bPaid = b.paidAt?.getTime?.() ?? 0;
  return bStart - aStart || bEnd - aEnd || bPaid - aPaid || b.ref.localeCompare(a.ref);
}
function selectionWindow(date: string, duration: number, startHour: number | null) {
  if (!date) return null;
  if (startHour === null) {
    if (date !== getDateStr(0)) return null;
    const start = new Date();
    return { start, end: addHours(start, duration) };
  }
  const start = scheduledStart(date, startHour);
  return { start, end: addHours(start, duration) };
}
function getOccupied(bookings: Booking[], date: string, duration: number, startHour: number | null): Set<string> {
  const window = selectionWindow(date, duration, startHour);
  if (!window) return new Set<string>();
  const occupied = new Set<string>();
  bookings.filter(b => ["payment_pending", "paid", "active"].includes(b.status)).forEach(b=>{
    const start = bookingStartDate(b);
    const end = bookingEndDate(b);
    if (!(start < window.end && end > window.start)) return;
    occupied.add(b.seatId);
    if (b.seatId === ROOM_SEAT.id) DISCUSSION_SEATS.forEach(s=>occupied.add(s.id));
    if (DISCUSSION_SEATS.some(s=>s.id===b.seatId)) occupied.add(ROOM_SEAT.id);
  });
  return occupied;
}

function liveSeatStatus(bookings: Booking[], seats: Seat[], now = new Date(), opts?: { mapWholeRoomToDiscussion?: boolean }) {
  const seatIds = new Set(seats.map(seat => seat.id));
  const active = new Set<string>();
  const booked = new Set<string>();
  const mapWholeRoom = Boolean(opts?.mapWholeRoomToDiscussion);

  const markSeat = (bucket: Set<string>, seatId: string) => {
    if (seatId === ROOM_SEAT.id && mapWholeRoom) {
      DISCUSSION_SEATS.forEach(seat => bucket.add(seat.id));
      return;
    }
    if (seatIds.has(seatId)) bucket.add(seatId);
  };

  bookings
    .filter(booking => booking.status === "paid" || booking.status === "active")
    .forEach(booking => {
      const start = bookingStartDate(booking);
      const end = bookingEndDate(booking);
      if (start > now || end <= now) return;
      if (booking.status === "active") markSeat(active, booking.seatId);
      if (booking.status === "paid") markSeat(booked, booking.seatId);
    });

  active.forEach(seatId => booked.delete(seatId));

  const activeCount = active.size;
  const bookedCount = booked.size;
  const total = seats.length;
  return {
    total,
    active: activeCount,
    booked: bookedCount,
    vacant: Math.max(total - activeCount - bookedCount, 0),
  };
}

function DonutChart({ slices, size = 144, stroke = 18 }: { slices: Array<{ label: string; value: number; color: string }>; size?: number; stroke?: number; }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#ece7df"
        strokeWidth={stroke}
      />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {slices.map(slice => {
          const length = total > 0 ? (slice.value / total) * circumference : 0;
          const dashOffset = -offset;
          offset += length;
          if (slice.value <= 0) return null;
          return (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
          );
        })}
      </g>
    </svg>
  );
}

function SeatStatusCard({ title, caption, icon, counts, tones }: {
  title: string;
  caption: string;
  icon: React.ReactNode;
  counts: { total: number; booked: number; active: number; vacant: number };
  tones: { primary: string; light: string };
}) {
  const slices = [
    { label: "Booked", value: counts.booked, color: "#d97706" },
    { label: "Active", value: counts.active, color: tones.primary },
    { label: "Vacant", value: counts.vacant, color: "#d6d3d1" },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: tones.primary }}>
            {icon}
            {title}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{caption}</p>
        </div>
        <div className="rounded-xl px-3 py-2 text-right" style={{ backgroundColor: tones.light }}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Seats</div>
          <div className="font-serif text-2xl" style={{ color: tones.primary }}>{counts.total}</div>
        </div>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative mx-auto sm:mx-0">
          <DonutChart slices={slices} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">In Use Now</div>
            <div className="font-serif text-3xl" style={{ color: tones.primary }}>{counts.active + counts.booked}</div>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {slices.map(slice => (
            <div key={slice.label} className="flex items-center justify-between rounded-xl bg-muted/25 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: slice.color }} />
                {slice.label}
              </span>
              <span className="font-semibold">{slice.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function liveSeatEntries(bookings: Booking[], seats: Seat[], now = new Date(), opts?: { mapWholeRoomToDiscussion?: boolean }) {
  const liveBookings = bookings.filter(booking => {
    if (!["paid", "active"].includes(booking.status)) return false;
    const start = bookingStartDate(booking);
    const end = bookingEndDate(booking);
    return start <= now && end > now;
  });
  const roomBooking = opts?.mapWholeRoomToDiscussion ? liveBookings.find(booking => booking.seatId === ROOM_SEAT.id) ?? null : null;

  return seats.map(seat => {
    const booking = roomBooking ?? liveBookings.find(item => item.seatId === seat.id) ?? null;
    if (!booking) {
      return { seat, status: "vacant" as const, booking: null, secsLeft: 0, blockedByRoom: false };
    }
    return {
      seat,
      status: booking.status === "active" ? "active" as const : "booked" as const,
      booking,
      secsLeft: Math.max(0, Math.floor((bookingEndDate(booking).getTime() - now.getTime()) / 1000)),
      blockedByRoom: roomBooking?.ref === booking.ref && booking.seatId === ROOM_SEAT.id,
    };
  });
}

function LiveSeatSection({ title, caption, icon, counts, entries, tones, map }: {
  title: string;
  caption: string;
  icon: React.ReactNode;
  counts: { total: number; booked: number; active: number; vacant: number };
  entries: Array<{ seat: Seat; status: "vacant" | "booked" | "active"; booking: Booking | null; secsLeft: number; blockedByRoom: boolean }>;
  tones: { primary: string; light: string };
  map: React.ReactNode;
}) {
  const statusTone = {
    active: "bg-emerald-100 text-emerald-700",
    booked: "bg-amber-100 text-amber-700",
    vacant: "bg-stone-100 text-stone-600",
  } as const;
  const occupiedEntries = entries.filter(entry => entry.booking);

  return (
    <div className="space-y-4">
      <SeatStatusCard title={title} caption={caption} icon={icon} counts={counts} tones={tones} />
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="mb-4">
          <h3 className="font-semibold">Live Seat Map</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Grey seats are occupied right now. This view updates from the current live booking status.</p>
        </div>
        {map}
      </div>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold">Occupied Now</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Who is currently using each occupied seat and how much time is left.</p>
        </div>
        <div className="divide-y divide-border/70">
          {occupiedEntries.length > 0 ? occupiedEntries.map(entry => (
            <div key={entry.seat.id} className="px-5 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{entry.seat.id}</span>
                  <span className="text-sm text-muted-foreground">{seatName(entry.seat)}</span>
                  <span className={["text-[10px] rounded-full px-2 py-0.5 font-medium uppercase tracking-wide", statusTone[entry.status]].join(" ")}>
                    {entry.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {entry.booking ? (
                    <>
                      {entry.blockedByRoom ? "Blocked by whole-room booking" : entry.booking.name}
                      {" · "}
                      Ends at {fmtClock(bookingEndDate(entry.booking))}
                    </>
                  ) : (
                    "Available now"
                  )}
                </div>
              </div>
              <div className="text-left md:text-right">
                <div className="text-sm font-semibold" style={{ color: entry.status === "vacant" ? "#57534e" : tones.primary }}>
                  {entry.booking ? fmtHm(entry.secsLeft) : "Vacant"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {entry.booking ? "time to finish" : "ready to book"}
                </div>
              </div>
            </div>
          )) : (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No seats are occupied right now.</div>
          )}
        </div>
      </div>
    </div>
  );
}
function sessionSecsLeft(b: Booking) {
  return Math.max(0, Math.floor((bookingEndDate(b).getTime() - Date.now()) / 1000));
}

// ── Initial data ──────────────────────────────────────────────────────────────
const INITIAL_BOOKINGS: Booking[] = [
  { ref:"CW-7734", seatId:"FL2", date:getDateStr(0), startHour:safeHour(-2), duration:3, startAt:new Date(Date.now()-2*3600000),  name:"Marcus Chen", email:"m.chen@email.com",    paidAt:new Date(Date.now()-2*3600000), status:"active",  checkInAt:new Date(Date.now()-110*60000) },
  { ref:"CW-7689", seatId:"D1",  date:getDateStr(0), startHour:safeHour(-1), duration:4, startAt:new Date(Date.now()-70*60000),    name:"Priya Nair",  email:"p.nair@email.com",    paidAt:new Date(Date.now()-70*60000),   status:"active",  checkInAt:new Date(Date.now()-55*60000) },
  { ref:"CW-7701", seatId:"FC1", date:getDateStr(0), startHour:safeHour(0),  duration:2, startAt:new Date(Date.now()-15*60000),    name:"Tom Walcott", email:"t.walcott@email.com", paidAt:new Date(Date.now()-15*60000),   status:"paid" },
  { ref:"CW-7699", seatId:"D3",  date:getDateStr(0), startHour:safeHour(0),  duration:3, startAt:new Date(Date.now()-25*60000),    name:"Yuki Tanaka", email:"y.tanaka@email.com",  paidAt:new Date(Date.now()-25*60000),   status:"paid" },
  { ref:"CW-7820", seatId:"DR",  date:getDateStr(1), startHour:10,           duration:4, name:"Alice Johnson",  email:"a.johnson@email.com", paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7821", seatId:"DR",  date:getDateStr(1), startHour:14,           duration:2, name:"Bob Smith",      email:"b.smith@email.com",   paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7822", seatId:"DR",  date:getDateStr(2), startHour:9,            duration:5, name:"Chen Wei",       email:"c.wei@email.com",     paidAt:new Date(),                    status:"paid" },
];

const INITIAL_FOOD_ORDERS: FoodOrder[] = [
  { id:"FO-201", bookingRef:"CW-7734", seatId:"FL2", customerName:"Marcus Chen", lines:[{itemId:"c1",name:"Espresso",price:3.50,qty:2},{itemId:"c7",name:"Chicken Sandwich",price:9.00,qty:1}], delivery:"table", total:16.00, status:"pending",  placedAt:new Date(Date.now()-15*60000), vendor:"cafe" },
  { id:"FO-202", bookingRef:"CW-7689", seatId:"D1",  customerName:"Priya Nair",  lines:[{itemId:"p3",name:"Pepperoni (S)",price:14.00,qty:1},{itemId:"p9",name:"Garlic Bread",price:6.00,qty:1}],  delivery:"pickup", total:20.00, status:"preparing",placedAt:new Date(Date.now()-8*60000),  vendor:"pizza" },
];

const DEFAULT_ADMIN_ACCOUNTS: AdminAccount[] = [
  { id:"a1", username:"admin", password:"workhub2024", role:"superadmin", createdAt:new Date() },
  { id:"a2", username:"desk1", password:"desk1234",    role:"admin",      createdAt:new Date() },
];

const VENDOR_LABELS: Record<string, string> = {
  cafe: "Quety Study Lounge Cafe",
  pizza: "The Slice Co.",
};

function fallbackVendorLabel(vendorId: string) {
  return VENDOR_LABELS[vendorId] ?? vendorId.replace(/[-_]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const APP_BASE = import.meta.env.BASE_URL ?? "/";
const landingAsset = (file: string) => `${APP_BASE}landing/${file}`;
const BRAND_LOGO_SRC = `${APP_BASE}branding/quety-logo.png`;
const TICKET_LOGO_SRC = `${APP_BASE}branding/quety-ticket-logo.png`;
const PAYMENT_QR_OPTIONS = [
  { src: `${APP_BASE}branding/payment-bank-islam.jpg`, label: "Bank Islam QR" },
  { src: `${APP_BASE}branding/payment-tng.jpg`, label: "Touch 'n Go eWallet QR" },
];
const BRAND_NAVY = "#15345d";
const BRAND_NAVY_DEEP = "#102b4a";
const BRAND_GOLD = "#d0a35c";
const BRAND_GOLD_SOFT = "#f3e4c7";
const BRAND_MUTED = "#69758a";
const BRAND_PANEL = "#fffdf8";
const BRAND_INPUT = "#fffaf1";
const BRAND_BORDER = "rgba(208, 163, 92, 0.34)";
const LANDING_POSTERS = [
  { src: landingAsset("lounge.jpg"), alt: "Students relaxing in the Quety Study Lounge lounge area" },
  { src: landingAsset("features.jpg"), alt: "Quety Lounge feature poster showing study areas and amenities" },
  { src: landingAsset("cubicle.jpg"), alt: "Quety Study Lounge cubicle focus seats poster" },
  { src: landingAsset("discussion-room.jpg"), alt: "Quety Study Lounge discussion room poster" },
  { src: landingAsset("premium-room.jpg"), alt: "Quety Study Lounge premium room poster" },
  { src: landingAsset("pantry.jpg"), alt: "Quety Study Lounge pantry area poster" },
];

function BrandLogo({ className = "", alt = "Quety Study Lounge logo" }: { className?: string; alt?: string }) {
  return <img src={BRAND_LOGO_SRC} alt={alt} className={className} />;
}

function BrandedScreen({ children, contentClassName = "" }: { children: React.ReactNode; contentClassName?: string }) {
  return (
    <div className="landing-theme relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(251,247,239,0.97)_42%,rgba(244,236,221,1)_100%)]" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[26rem] w-[26rem] rounded-full border-[10px] border-[#d6a85f] bg-[#15345d]" />
      <div className="pointer-events-none absolute -bottom-44 -left-44 h-[26rem] w-[26rem] rounded-full border-[10px] border-[#d6a85f] bg-[#15345d]" />
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
}

const brandInputClass = "w-full bg-[#fffaf1] rounded-[22px] px-4 py-3.5 text-sm border border-[#e6d5b5] focus:border-[#d0a35c] focus:outline-none transition-colors placeholder:text-[#8b8478] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";
const brandButtonClass = "bg-[#15345d] text-white rounded-[20px] text-sm font-semibold transition-all hover:opacity-95 shadow-[0_14px_30px_rgba(21,52,93,0.18)]";
const brandCardClass = "bg-card rounded-[30px] border border-[rgba(208,163,92,0.22)] shadow-[0_24px_60px_rgba(21,52,93,0.12)]";

function BrandField({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#c89b4b]">
        {icon}
      </div>
      <input
        {...props}
        className={`${brandInputClass} pl-14 ${props.className ?? ""}`.trim()}
      />
    </div>
  );
}

function portalViewFromLocation(hasAdminAuth = false, hasVendorAuth = false): AppView | null {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  if (params.get("admin") === "1" || hash.includes("admin") || path.endsWith("/admin") || path.endsWith("/admin/")) {
    return hasAdminAuth ? "admin" : "adminLogin";
  }
  if (hash.includes("vendor") || path.endsWith("/vendor") || path.endsWith("/vendor/")) {
    return hasVendorAuth ? "vendor" : "vendorLogin";
  }
  if (hash.includes("landing-page")) {
    return "landingPage";
  }
  return null;
}

function initialView(): AppView {
  return portalViewFromLocation() ?? "landing";
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(`Could not reach the backend at ${API_BASE}. Please make sure the API server is running and this site is connected to the correct backend URL.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The server could not complete that request.");
  return data as T;
}

function bearer(token: string|null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toDate(value?: string|null) {
  if (!value) return undefined;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value);
  return new Date(value.includes("T") ? `${value}Z` : `${value.replace(" ", "T")}Z`);
}

function normalizeDateValue(value: unknown) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : value;
}

function normalizeBooking(b: any): Booking {
  return {
    ...b,
    date: normalizeDateValue(b.date),
    paidAt: toDate(b.paidAt) ?? new Date(),
    startAt: toDate(b.startAt),
    checkInAt: toDate(b.checkInAt),
  };
}

function normalizeFoodOrder(o: any): FoodOrder {
  return { ...o, placedAt: toDate(o.placedAt) ?? new Date(), vendorLabel: o.vendorLabel ?? fallbackVendorLabel(o.vendor) };
}

function normalizeFoodPaymentRequest(request: any): FoodPaymentRequest {
  return {
    ...request,
    customerPhone: request.customerPhone ?? "",
    subtotal: request.subtotal ?? 0,
    total: request.total ?? 0,
    createdAt: toDate(request.createdAt) ?? new Date(),
    items: (request.items ?? []).map((item: any) => ({
      ...item,
      price: item.price ?? 0,
      vendorLabel: item.vendorLabel ?? fallbackVendorLabel(item.vendor),
    })),
    orders: (request.orders ?? []).map((order: any) => normalizeFoodOrder(order)),
  };
}

function normalizeFoodItem(item: any): FoodItem {
  return {
    ...item,
    vendorLabel: item.vendorLabel ?? fallbackVendorLabel(item.vendor),
    vendorOpen: item.vendorOpen ?? true,
    description: item.description ?? "",
    imageUrl: item.imageUrl ?? "",
  };
}

function normalizeAdminAccount(a: any): AdminAccount {
  const role = a.role === "super" ? "superadmin" : a.role === "reception" ? "admin" : a.role;
  return { ...a, role, password: "", createdAt: toDate(a.createdAt) ?? new Date() };
}

function normalizeVendorAccount(a: any): VendorAccount {
  return {
    ...a,
    vendorId: a.vendorId ?? null,
    vendorLabel: a.vendorLabel ?? (a.vendorId ? fallbackVendorLabel(a.vendorId as VendorType) : null),
    createdAt: toDate(a.createdAt) ?? new Date(),
  };
}

function normalizeActivityLog(log: any): ActivityLog {
  return { ...log, createdAt: toDate(log.createdAt) ?? new Date(), details: log.details ?? {} };
}

function adminRoleLabel(role: AdminAccount["role"]) {
  return role === "superadmin" ? "Superadmin" : "Admin";
}

function startOfSalesRange(range: SalesRange, base = new Date()) {
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    return start;
  }
  if (range === "month") {
    start.setDate(1);
    return start;
  }
  start.setMonth(0, 1);
  return start;
}

function inSalesRange(value: Date, range: SalesRange, base = new Date()) {
  return value >= startOfSalesRange(range, base) && value <= base;
}

function salesBucketKey(value: Date, range: SalesRange) {
  if (range === "year") return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  return value.toISOString().slice(0, 10);
}

function salesBucketLabel(key: string, range: SalesRange) {
  if (range === "year") {
    const [year, month] = key.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en", { month: "short", year: "numeric" });
  }
  return fmtDateFull(key);
}

// ── QR Pattern ────────────────────────────────────────────────────────────────
const QR_SIZE = 21;

function qrCellDark(value: string, r: number, c: number) {
  let hash = 5381;
  for (let i=0;i<value.length;i++) hash = ((hash<<5)+hash+value.charCodeAt(i))>>>0;
  const fd=(r:number,c:number,br:number,bc:number)=>{const[lr,lc]=[r-br,c-bc];return(lr===0||lr===6||lc===0||lc===6)||(lr>=2&&lr<=4&&lc>=2&&lc<=4);};
  if(r<7&&c<7)return fd(r,c,0,0);if(r<7&&c>=QR_SIZE-7)return fd(r,c,0,QR_SIZE-7);if(r>=QR_SIZE-7&&c<7)return fd(r,c,QR_SIZE-7,0);
  if((r<8&&c<8)||(r<8&&c>=QR_SIZE-8)||(r>=QR_SIZE-8&&c<8))return false;
  if(r===6)return c%2===0;if(c===6)return r%2===0;return((hash^(r*127+c*31))>>>0)%100>42;
}

function QRPattern({ value, faded=false }: { value: string; faded?: boolean }) {
  return (
    <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className={`w-full h-full ${faded?"opacity-15 grayscale":""}`} shapeRendering="crispEdges">
      {Array.from({length:QR_SIZE},(_,r)=>Array.from({length:QR_SIZE},(_,c)=>qrCellDark(value,r,c)?<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor"/>:null))}
    </svg>
  );
}

// ── Timer Ring ────────────────────────────────────────────────────────────────
function TimerRing({ pct, children }: { pct: number; children: React.ReactNode }) {
  const r=54,circ=2*Math.PI*r;
  const color=pct<0.15?"#dc2626":pct<0.35?"#f59e0b":"#1b4332";
  return (
    <div className="relative w-44 h-44 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#eae7df" strokeWidth={7}/>
        <circle cx={60} cy={60} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${circ*pct} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 1s linear,stroke 0.6s ease"}}/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ── Slide to complete ─────────────────────────────────────────────────────────
function SlideComplete({ onComplete, label="Slide to complete" }: { onComplete: () => void; label?: string }) {
  const [offset, setOffset] = useState(0);
  const [done, setDone] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const maxOff = () => (trackRef.current?.offsetWidth ?? 220) - 56;

  if (done) return (
    <div className="h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-2 text-emerald-700 text-sm font-semibold">
      <CheckCircle className="w-4 h-4"/>Completed
    </div>
  );

  const pct = maxOff()>0 ? offset/maxOff() : 0;
  return (
    <div ref={trackRef} className="relative h-14 bg-muted rounded-2xl overflow-hidden select-none">
      <div className="absolute inset-y-0 left-0 bg-primary/15 rounded-2xl" style={{width:`${pct*100}%`}}/>
      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">{label}</div>
      <div className="absolute top-1 left-1 w-12 h-12 rounded-xl bg-primary flex items-center justify-center cursor-grab active:cursor-grabbing touch-none z-10"
        style={{transform:`translateX(${offset}px)`,transition:dragging.current?"none":"transform 0.2s ease"}}
        onPointerDown={e=>{dragging.current=true;startX.current=e.clientX-offset;e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(!dragging.current)return;setOffset(Math.max(0,Math.min(e.clientX-startX.current,maxOff())));}}
        onPointerUp={()=>{dragging.current=false;if(offset>=maxOff()*0.82){setDone(true);onComplete();}else setOffset(0);}}>
        <ChevronRight className="w-5 h-5 text-primary-foreground"/>
      </div>
    </div>
  );
}

// ── Seat Button ───────────────────────────────────────────────────────────────
function SeatBtn({ seat, isSelected, isOccupied, onSelect, displayLabel, duration, className="", readOnly=false }: {
  seat: Seat; isSelected: boolean; isOccupied: boolean; onSelect: (id:string)=>void; displayLabel?: string; duration: number; className?: string; readOnly?: boolean;
}) {
  const meta = ZONE_META[seat.zone];
  const priceHint = getSeatPriceHint(seat.zone, duration);
  const isDisabled = isOccupied || readOnly;
  return (
    <button disabled={isDisabled} onClick={()=>onSelect(seat.id)}
      title={isOccupied?"Occupied":`${seatName(seat)} - ${priceHint}`}
      className={["w-10 h-10 rounded-xl text-[11px] font-mono font-semibold border transition-all duration-150 flex items-center justify-center shrink-0",
        isOccupied  ?"bg-[#ebe8e1] border-[#dedad0] text-[#c4bfb5] cursor-not-allowed"
        :readOnly   ?"bg-card border-border/70 text-current cursor-default"
        :isSelected ?"ring-2 ring-offset-1 shadow-md scale-110 cursor-pointer border-transparent text-white"
                    :"bg-card border-border/70 hover:scale-105 hover:shadow cursor-pointer",
        className,
      ].join(" ")}
      style={isSelected?{backgroundColor:meta.hex}:!isOccupied?{color:meta.hex}:undefined}>
      {displayLabel ?? seat.label}
    </button>
  );
}

function FocusPodZone({ occupied, selectedId, onSelect, duration, readOnly=false, showPrice=true }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; duration:number; readOnly?:boolean; showPrice?:boolean; }) {
  const [level, setLevel] = useState<1|2>(1);
  const hex=ZONE_META.focus.hex, light=ZONE_META.focus.light;
  const left = FOCUS_SEATS.filter(s=>s.id.startsWith("FL"));
  const centre = FOCUS_SEATS.filter(s=>s.id.startsWith("FC"));
  const right = FOCUS_SEATS.filter(s=>s.id.startsWith("FR"));
  const level2Ahead = FOCUS_SEATS.filter(s=>s.id.startsWith("L2A"));
  const level2Upper = FOCUS_SEATS.filter(s=>s.id.startsWith("L2B"));
  const level2Right = FOCUS_SEATS.filter(s=>s.id.startsWith("L2R"));
  const privateRoom = FOCUS_SEATS.filter(s=>s.id.startsWith("PR"));
  const btn=(s:Seat)=><SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} duration={duration} readOnly={readOnly}/>;
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span style={{color:hex}}><Wifi className="w-3 h-3"/></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{color:hex}}>Focus Pods</span>
        {showPrice && <span className="ml-auto text-xs text-muted-foreground font-mono">{getSeatPriceHint("focus", duration)}</span>}
      </div>
      <div className="flex gap-1.5 mb-4">
        {([1,2] as (1|2)[]).map(l=>(
          <button key={l} onClick={()=>setLevel(l)}
            className={["flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all",
              level===l?"text-white border-transparent":"bg-background border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
            style={level===l?{backgroundColor:hex}:undefined}>
            Level {l}
          </button>
        ))}
      </div>

      {level===1 ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{color:hex}}>Level 1</span>
          </div>
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider text-center mb-2">Centre</div>
            <div className="flex justify-center gap-2">{centre.map(btn)}</div>
          </div>
          <div className="grid grid-cols-[1fr_1.25fr_1fr] gap-4 items-start">
            <div className="flex flex-col items-center gap-2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider text-center">Left wall</div>
              {left.map(btn)}
            </div>
            <div className="space-y-3 pt-5">
              <div className="h-32 rounded-xl border border-dashed flex items-center justify-center" style={{backgroundColor:light,borderColor:`${hex}35`}}>
                <span className="text-[10px] font-semibold tracking-[0.18em]" style={{color:`${hex}90`}}>CENTRE AISLE</span>
              </div>
              <div className="flex justify-center"><span className="text-[9px] text-muted-foreground tracking-wider">ENTRANCE</span></div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider text-center">Right wall</div>
              {right.map(btn)}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{color:hex}}>Level 2</span>
          </div>
          <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="min-h-[22rem] min-w-[34rem] p-2 sm:min-w-0 sm:p-4 flex flex-col justify-between gap-4">
              <div className="grid grid-cols-[0.95fr_1.05fr] sm:grid-cols-[1fr_1.05fr] gap-3 sm:gap-6 items-start">
                <div className="flex justify-center gap-4 sm:gap-8 pt-2">
                  <div className="flex gap-2">
                    {level2Ahead.map(s=>(
                      <SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} displayLabel={s.id.replace("L2","")} duration={duration}/>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {level2Upper.map(s=>(
                      <SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} displayLabel={s.id.replace("L2","")} duration={duration}/>
                    ))}
                  </div>
                </div>
                <div className="border rounded-xl min-h-32 sm:min-h-36 p-2 sm:p-3 overflow-visible sm:overflow-hidden" style={{backgroundColor:light,borderColor:`${hex}70`}}>
                  <div className="flex items-start gap-2 sm:gap-4">
                    <div className="flex flex-col gap-1.5 sm:gap-2 shrink-0">
                      {privateRoom.slice(0, 3).map(s=>(
                        <SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} displayLabel={s.id} duration={duration} className="w-8 h-8 text-[10px] rounded-lg sm:w-10 sm:h-10 sm:text-[11px] sm:rounded-xl"/>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0 text-center pt-2">
                      <div className="text-[9px] sm:text-[10px] font-semibold tracking-[0.14em] sm:tracking-[0.18em] uppercase leading-relaxed break-words" style={{color:`${hex}90`}}>Private<br/>room</div>
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-1">5 seats</div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1.5 sm:gap-2">
                    {privateRoom.slice(3).map(s=>(
                      <SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} displayLabel={s.id} duration={duration} className="w-8 h-8 text-[10px] rounded-lg sm:w-10 sm:h-10 sm:text-[11px] sm:rounded-xl"/>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[0.72fr_1.28fr] sm:grid-cols-[0.78fr_1.42fr] gap-0 items-end">
                <div className="h-32 sm:h-40 max-w-[180px] sm:max-w-[210px] rounded-xl border border-dashed flex items-center justify-center bg-background" style={{borderColor:`${hex}35`}}>
                  <span className="text-[10px] font-semibold tracking-[0.18em]" style={{color:`${hex}90`}}>STAIRS</span>
                </div>
                <div className="flex gap-2 sm:gap-3 ml-4 sm:ml-3 pb-2 w-fit">
                  <div className="flex flex-col gap-2">
                    {level2Right.slice(0, 3).map(s=>(
                      <SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} displayLabel={s.id.replace("L2","")} duration={duration}/>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    {level2Right.slice(3).map(s=>(
                      <SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect} displayLabel={s.id.replace("L2","")} duration={duration}/>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscussionDeskZone({ occupied, selectedId, onSelect, duration, readOnly=false, showPrice=true }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; duration:number; readOnly?:boolean; showPrice?:boolean; }) {
  const hex=ZONE_META.discussion.hex, light=ZONE_META.discussion.light;
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{color:hex}}><Users className="w-3 h-3"/></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{color:hex}}>Discussion Tables</span>
        {showPrice && <span className="ml-auto text-xs text-muted-foreground font-mono">{fmtMoney(getHourlyRate("discussion",duration))}/hr</span>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {DISCUSSION_SEATS.map(table=>(
          <button key={table.id} disabled={occupied.has(table.id) || readOnly} onClick={()=>onSelect(table.id)}
            title={occupied.has(table.id) ? "Occupied" : `${table.label} - ${fmtMoney(getHourlyRate("discussion",duration))}/hr`}
            className={["h-28 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all",
              occupied.has(table.id) ?"bg-[#ebe8e1] border-[#dedad0] text-[#c4bfb5] cursor-not-allowed"
              :readOnly               ?"cursor-default"
              :selectedId===table.id ?"shadow-lg scale-[1.02] cursor-pointer border-transparent text-white"
                                  :"hover:scale-[1.02] cursor-pointer",
            ].join(" ")}
            style={selectedId===table.id?{backgroundColor:hex}:!occupied.has(table.id)?{backgroundColor:light,borderColor:`${hex}35`,color:hex}:undefined}>
            <Users className="w-5 h-5"/>
            <span className="text-sm font-semibold">{table.label}</span>
            <span className="text-[10px] opacity-75">Whole 4-seat table</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DiscussionRoomZone({ occupied, selectedId, onSelect, duration, readOnly=false, showPrice=true }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; duration:number; readOnly?:boolean; showPrice?:boolean; }) {
  const hex=ZONE_META.room.hex, light=ZONE_META.room.light;
  const isSel=selectedId===ROOM_SEAT.id, isOcc=occupied.has(ROOM_SEAT.id);
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{color:hex}}><Building2 className="w-3 h-3"/></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{color:hex}}>Whole Discussion Room</span>
        {showPrice && <span className="ml-auto text-xs text-muted-foreground font-mono">{fmtMoney(getHourlyRate("room",duration))}/hr</span>}
      </div>
      <button disabled={isOcc || readOnly} onClick={()=>onSelect(ROOM_SEAT.id)}
        className={["w-full h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all",
          isOcc?"bg-[#ebe8e1] border-[#dedad0] cursor-not-allowed":readOnly?"cursor-default":isSel?"shadow-lg scale-[1.01] cursor-pointer border-transparent text-white":"border-dashed hover:scale-[1.01] cursor-pointer",
        ].join(" ")}
        style={isSel?{backgroundColor:hex,borderColor:hex}:!isOcc?{backgroundColor:light,borderColor:`${hex}40`,color:hex}:undefined}>
        <Building2 className="w-5 h-5"/>
        <span className="text-sm font-semibold">Book Whole Discussion Room</span>
        <span className="text-xs opacity-75">Available up to 3 days ahead</span>
      </button>
    </div>
  );
}

// ── Floor Map ─────────────────────────────────────────────────────────────────
function FloorMap({ occupied, selectedId, onSelect, duration, readOnly=false, roomOnly=false, mobileStack=false }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; duration:number; readOnly?:boolean; roomOnly?:boolean; mobileStack?:boolean; }) {
  const sel=readOnly?null:selectedId, handler=readOnly?()=>{}:onSelect;
  const focusCard = <FocusPodZone occupied={occupied} selectedId={sel} onSelect={handler} duration={duration} readOnly={readOnly}/>;
  const discussionCard = <DiscussionDeskZone occupied={occupied} selectedId={sel} onSelect={handler} duration={duration} readOnly={readOnly}/>;
  const roomCard = <DiscussionRoomZone occupied={occupied} selectedId={sel} onSelect={handler} duration={duration} readOnly={readOnly}/>;

  if (mobileStack) {
    return (
      <div className="space-y-3">
          {!roomOnly&&(
            <>
              <div>
                {focusCard}
              </div>
              <div>
                {discussionCard}
              </div>
            </>
          )}
          <div>
            {roomCard}
          </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!roomOnly&&(
        <div className="grid grid-cols-2 gap-3">
          {focusCard}
          {discussionCard}
        </div>
      )}
      {roomCard}
    </div>
  );
}

function BookingDetailsPanel({ selectedDate, selectedHour, duration, seat, meta, today, showCustomerBookingUI, needsScheduledTime, showRollingBookingDetails, isTodaySelection, hourlyRate, subtotal, fee, grand, onDateChange, onHourChange, onDurationChange }: {
  selectedDate:string;
  selectedHour:number|null;
  duration:number;
  seat: Seat | null;
  meta: { label: string; price: number; hex: string; light: string; icon: React.ReactNode } | null;
  today:string;
  showCustomerBookingUI:boolean;
  needsScheduledTime:boolean;
  showRollingBookingDetails:boolean;
  isTodaySelection:boolean;
  hourlyRate:number;
  subtotal:number;
  fee:number;
  grand:number;
  onDateChange:(d:string)=>void;
  onHourChange:(h:number|null)=>void;
  onDurationChange:(n:number)=>void;
}) {
  return (
    <div className="space-y-5">
      <DateTimePicker
        selectedDate={selectedDate} selectedHour={selectedHour} duration={duration} selectedSeat={seat}
        onDateChange={onDateChange}
        onHourChange={onHourChange}
        onDurationChange={onDurationChange}
      />

      {showCustomerBookingUI && selectedDate&&(!needsScheduledTime||selectedHour!==null)&&(
        <>
          {seat&&meta ? (
            <div className="rounded-xl p-4 border" style={{backgroundColor:meta.light,borderColor:`${meta.hex}30`}}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span style={{color:meta.hex}}>{meta.icon}</span>
                <span className="text-xs font-semibold" style={{color:meta.hex}}>{meta.label}</span>
              </div>
              <div className="font-serif text-xl" style={{color:meta.hex}}>{seatName(seat)}</div>
              {showRollingBookingDetails && (
                <div className="text-xs mt-1" style={{color:`${meta.hex}99`}}>
                  {selectionTimeLabelForPanel(seat, selectedDate, duration, selectedHour, isTodaySelection)}
                </div>
              )}
              {!showRollingBookingDetails && isRollingZone(seat.zone) && isTodaySelection && (
                <div className="mt-2 text-[11px] font-medium text-amber-700">
                  Quety Study Lounge is closed for now, come again tomorrow.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              Click any available seat on the map
            </div>
          )}

          {seat&&showRollingBookingDetails&&(
            <div className="space-y-2 text-sm border-t border-border pt-4">
              <div className="flex justify-between text-muted-foreground"><span>{meta?.label} · {getBookingPriceSummary(seat.zone, duration)}</span><span>{fmtMoney(subtotal)}</span></div>
              <div className="flex justify-between font-bold text-base border-t border-border pt-2.5"><span>Total</span><span className="text-primary">{fmtMoney(grand)}</span></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function selectionTimeLabelForPanel(seat: Seat | null, selectedDate: string, duration: number, selectedHour: number | null, isTodaySelection: boolean) {
  if (!seat || !selectedDate) return "";
  if (isRollingZone(seat.zone) && isTodaySelection) {
    return `Starts immediately after payment`;
  }
  if (selectedHour === null) return "";
  return `${fmtHour(selectedHour)} – ${fmtHour(selectedHour + duration)} · ${duration}h`;
}

function ContinueToPaymentBar({ canProceedToPayment, onContinue }: { canProceedToPayment:boolean; onContinue:()=>void; }) {
  return (
    <button disabled={!canProceedToPayment} onClick={onContinue}
      className={["w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all",
        canProceedToPayment?"bg-[#15345d] text-white hover:opacity-90 shadow-[0_14px_30px_rgba(21,52,93,0.18)]":"bg-muted text-muted-foreground cursor-not-allowed",
      ].join(" ")}>
      Continue to Payment <ChevronRight className="w-4 h-4"/>
    </button>
  );
}

function MobileBookingFooter({ selectedDate, selectedHour, duration, seat, meta, isTodaySelection, showRollingBookingDetails, hourlyRate, subtotal, fee, grand }: {
  selectedDate:string;
  selectedHour:number|null;
  duration:number;
  seat: Seat | null;
  meta: { label: string; price: number; hex: string; light: string; icon: React.ReactNode } | null;
  isTodaySelection:boolean;
  showRollingBookingDetails:boolean;
  hourlyRate:number;
  subtotal:number;
  fee:number;
  grand:number;
}) {
  if (!seat || !meta || !selectedDate) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-foreground">
        Click any available seat on the map
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 border" style={{backgroundColor:meta.light,borderColor:`${meta.hex}30`}}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span style={{color:meta.hex}}>{meta.icon}</span>
          <span className="text-xs font-semibold" style={{color:meta.hex}}>{meta.label}</span>
        </div>
        <div className="font-serif text-xl" style={{color:meta.hex}}>{seatName(seat)}</div>
        {showRollingBookingDetails && (
          <div className="text-xs mt-1" style={{color:`${meta.hex}99`}}>
            {selectionTimeLabelForPanel(seat, selectedDate, duration, selectedHour, isTodaySelection)}
          </div>
        )}
      </div>

      {showRollingBookingDetails && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>{meta.label} · {getBookingPriceSummary(seat.zone, duration)}</span><span>{fmtMoney(subtotal)}</span></div>
          <div className="flex justify-between font-bold text-base border-t border-border pt-2.5"><span>Total</span><span className="text-primary">{fmtMoney(grand)}</span></div>
        </div>
      )}
    </div>
  );
}

// ── Date Time Picker (inline sidebar) ─────────────────────────────────────────
function DateTimePicker({ selectedDate, selectedHour, duration, selectedSeat, onDateChange, onHourChange, onDurationChange, mobileCompact=false }: {
  selectedDate:string; selectedHour:number|null; duration:number; selectedSeat: Seat | null;
  onDateChange:(d:string)=>void; onHourChange:(h:number|null)=>void; onDurationChange:(n:number)=>void;
  mobileCompact?: boolean;
}) {
  const today = getDateStr(0);
  const now = new Date();
  const curHour = now.getHours();
  const dates = Array.from({length:4},(_,i)=>getDateStr(i));
  const hours = Array.from({length:14},(_,i)=>i+8);
  const isHourOk = (h:number) => selectedDate!==today || h>curHour;
  const needsScheduledTime = selectedDate !== today || selectedSeat?.zone === "room";
  const rollingOpenNow = rollingBookingWindowOpen(now);
  const rollingClosedToday = selectedDate===today && (!rollingOpenNow || !rollingDurationFits(1, now));
  const hasRollingOption = [1,2,3,4,5,6,7,8].some(h => rollingDurationFits(h, now));

  return (
    <div className="space-y-4">
      {/* Date */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Date</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{scrollbarWidth:"none"}}>
          {dates.map(d=>{
            const {day,num,month}=fmtDateLabel(d), isSel=d===selectedDate, isToday=d===today;
            return (
              <button key={d} onClick={()=>{onDateChange(d);onHourChange(null);}}
                className={["shrink-0 flex flex-col items-center rounded-xl px-2.5 py-2 text-xs transition-all border",
                  isSel?"bg-[#15345d] text-white border-[#15345d] shadow-[0_14px_30px_rgba(21,52,93,0.18)]":"bg-background border-border hover:border-primary/50",
                ].join(" ")}>
                <span className="font-medium opacity-80">{day}</span>
                <span className="text-base font-bold leading-tight">{num}</span>
                <span className="opacity-70 text-[10px]">{month}</span>
                {isToday&&!isSel&&<span className="text-[9px] text-primary font-semibold mt-0.5">Today</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate===today && !needsScheduledTime && !rollingClosedToday && (!rollingOpenNow || !hasRollingOption) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
          Quety Study Lounge is closed for now, come again tomorrow.
        </div>
      )}

      {/* Time — only when a scheduled room booking is needed */}
      {selectedDate && needsScheduledTime && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Start Time</p>
          {selectedDate===today&&hours.every(h=>!isHourOk(h))&&<p className="text-xs text-muted-foreground mb-2">Bookings are closed for today.</p>}
          <div
            className={mobileCompact
              ? "flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
              : "grid grid-cols-2 gap-1"}
            style={mobileCompact ? { scrollbarWidth:"none" } : undefined}
          >
            {hours.map(h=>{
              const ok=isHourOk(h), isSel=selectedHour===h;
              return (
                <button key={h} disabled={!ok} onClick={()=>onHourChange(h)}
                  className={[
                    mobileCompact
                      ? "shrink-0 min-w-[4.15rem] rounded-lg px-2.5 py-1.5 text-[11px] leading-none"
                      : "rounded-lg py-1.5 text-xs",
                    "font-mono font-medium border transition-all",
                    !ok?"bg-muted/30 border-border/30 text-muted-foreground/40 cursor-not-allowed"
                    :isSel?"bg-[#15345d] text-white border-[#15345d] shadow-[0_14px_30px_rgba(21,52,93,0.18)]"
                          :"bg-background border-border hover:border-primary/50",
                  ].join(" ")}>
                  {fmtHour(h)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Duration */}
      {selectedDate && (!needsScheduledTime || selectedHour !== null) && (needsScheduledTime || rollingOpenNow) && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Duration</p>
          <div
            className={mobileCompact
              ? "flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
              : "grid grid-cols-4 gap-1.5"}
            style={mobileCompact ? { scrollbarWidth:"none" } : undefined}
          >
            {[1,2,3,4,5,6,7,8].map(h=>{
              const fits = needsScheduledTime
                ? (selectedHour !== null && selectedHour + h <= 22)
                : rollingDurationFits(h, now);
              return (
                <button key={h} disabled={!fits} onClick={()=>onDurationChange(h)}
                  className={[
                    mobileCompact
                      ? "shrink-0 min-w-[3.6rem] rounded-xl px-3 py-1.5 text-xs leading-none"
                      : "rounded-xl py-2 text-sm",
                    "font-semibold border transition-all",
                    !fits?"bg-muted/30 border-border/30 text-muted-foreground/40 cursor-not-allowed"
                    :duration===h?"bg-[#15345d] text-white border-[#15345d] shadow-[0_14px_30px_rgba(21,52,93,0.18)]"
                               :"bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                  ].join(" ")}>{h}h</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
function LandingShowcasePage({ onBookNow }: {
  onBookNow: () => void;
}) {
  return (
    <BrandedScreen contentClassName="min-h-screen text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="h-10 w-10 rounded-xl object-cover" />
            <div>
              <div className="font-serif text-xl">Quety Study Lounge</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Study Space · Booking Portal</div>
            </div>
          </div>
          <button
            onClick={onBookNow}
            className="rounded-xl bg-[#15345d] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-[0_14px_30px_rgba(21,52,93,0.18)]"
          >
            Book Your Seat Now
          </button>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-border bg-card shadow-[0_24px_60px_rgba(21,52,93,0.08)]">
        <img
          src={landingAsset("lounge.jpg")}
          alt="Quety Study Lounge hero background"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(251,247,239,0.96)_0%,rgba(251,247,239,0.9)_42%,rgba(21,52,93,0.18)_100%)]" />
        <div className="relative mx-auto flex min-h-[82svh] max-w-6xl items-end px-5 py-16 sm:px-8 md:min-h-[88svh] md:items-center md:py-20">
          <div className="max-w-2xl">
            <h1 className="max-w-xl font-serif text-5xl leading-[1.02] text-[#15345d] sm:text-6xl md:text-7xl">
              Find your calm study space.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#4e5d75] sm:text-lg">
              Browse focus cubicles, discussion rooms, pantry space, and premium rooms before heading straight into the booking site.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={onBookNow}
                className="rounded-xl bg-[#15345d] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-[0_14px_30px_rgba(21,52,93,0.18)]"
              >
                Book Your Seat Now
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background px-5 py-14 sm:px-8 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-serif text-3xl sm:text-4xl">Explore the space</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              A quick look at the different zones, rooms, and amenities customers can enjoy before making a booking.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {LANDING_POSTERS.map((image, index) => (
              <article key={image.src} className={["overflow-hidden border border-border bg-card shadow-sm",
                index === 0 ? "md:col-span-2 xl:col-span-2" : "",
              ].join(" ")} style={{ borderRadius: 8 }}>
                <img
                  src={image.src}
                  alt={image.alt}
                  className="h-full w-full object-cover"
                />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-card px-5 py-14 sm:px-8 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {[
            { title: "Focus Cubicles", note: "Quiet individual study seats for deep work and revision." },
            { title: "Discussion Rooms", note: "Tables and private group areas for collaborative sessions." },
            { title: "Pantry & Lounge", note: "Comfortable spaces to recharge, eat, and reset between sessions." },
          ].map(item => (
            <div key={item.title} className="border border-border bg-background px-5 py-6" style={{ borderRadius: 8 }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{item.title}</div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-16 text-center sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-serif text-4xl sm:text-5xl">Ready to book your spot?</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Head straight to the customer booking site and choose your seat, date, and session.
          </p>
          <button
            onClick={onBookNow}
            className="mt-8 rounded-xl bg-[#15345d] px-6 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-[0_14px_30px_rgba(21,52,93,0.18)]"
          >
            Book Your Seat Now
          </button>
        </div>
      </section>
    </BrandedScreen>
  );
}

// ── Booking Entry Page ───────────────────────────────────────────────────────
function LandingPage({ onSignUp }: {
  onSignUp:(c:Customer)=>void;
}) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [err, setErr] = useState("");
  function submit(e:React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = normalizePhone(phone);
    if (!cleanName||!cleanEmail||!cleanPhone){setErr("Please fill in all fields.");return;}
    if (!isValidEmail(cleanEmail)){setErr("Please enter a valid email address.");return;}
    if (!isValidPhone(cleanPhone)){setErr("Please enter a valid Malaysian mobile number, e.g. 0123456789 or +60123456789.");return;}
    onSignUp({name:cleanName,email:cleanEmail,phone:cleanPhone});
  }
  return (
    <BrandedScreen contentClassName="min-h-screen">
      <nav className="border-b border-border bg-card/95 px-8 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <BrandLogo className="h-12 w-12 rounded-full object-cover border border-[#d0a35c]/60 shadow-[0_8px_22px_rgba(21,52,93,0.14)]" />
          <span className="font-serif text-[2rem] leading-none text-primary">Quety Study Lounge</span>
        </div>
        <div className="flex items-center gap-2"/>
      </nav>

      <section className="px-8 py-16 md:py-20 max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d0a35c]/40 bg-[#15345d] px-4 py-2 text-xs font-semibold text-[#f1c979] shadow-[0_12px_24px_rgba(21,52,93,0.14)] mb-6">
            <Sparkles className="w-3.5 h-3.5"/>Now open · Kuala Terengganu
          </div>
          <h1 className="font-serif text-5xl md:text-[3.5rem] leading-[1.04] mb-5 text-[#15345d]">Your space,<br/>your hours.</h1>
          <div className="mb-7 flex items-center gap-4 text-[#c89b4b]">
            <span className="h-px w-24 bg-[#c89b4b]/80" />
            <BrandLogo className="h-10 w-10 rounded-full object-cover" />
            <span className="h-px w-24 bg-[#c89b4b]/80" />
          </div>
          <p className="text-[#5f6878] text-lg leading-relaxed mb-8 max-w-xl">Book a desk in minutes. Pick your date, time, and zone — get a QR code to check in instantly. Food ordering included.</p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {["Flexible hours","Instant QR check-in","2 hot desk levels","Café & pizza ordering"].map(f=>(
              <span key={f} className="flex items-center gap-2.5 text-[1.02rem] text-[#243041]">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#15345d] text-[#d4a85d] shadow-[0_12px_24px_rgba(21,52,93,0.16)]">
                  <CheckCircle className="w-4 h-4 shrink-0"/>
                </span>
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className={`${brandCardClass} p-8 md:p-10`}>
          <h2 className="font-serif text-[3rem] leading-none mb-2 text-[#15345d]">Get started</h2>
          <p className="text-[1.05rem] text-[#6d7280] mb-9">Enter your details to browse and book a seat</p>
          <form onSubmit={submit} className="space-y-3">
            <BrandField
              value={name}
              onChange={e=>{setName(e.target.value);setErr("");}}
              placeholder="Full name"
              icon={<User className="w-5 h-5" />}
            />
            <BrandField
              value={email}
              onChange={e=>{setEmail(e.target.value);setErr("");}}
              placeholder="Email address"
              type="email"
              icon={<Mail className="w-5 h-5" />}
            />
            <BrandField
              value={phone}
              onChange={e=>{setPhone(e.target.value);setErr("");}}
              placeholder="Phone number, e.g. 0123456789"
              type="tel"
              icon={<Phone className="w-5 h-5" />}
            />
            <AnimatePresence>
              {err&&<motion.p initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="text-xs text-red-600">{err}</motion.p>}
            </AnimatePresence>
            <button type="submit" className={`w-full py-4 text-[1.02rem] flex items-center justify-center gap-3 ${brandButtonClass}`}>
              Browse Available Seats <ArrowRight className="w-5 h-5 text-[#f1c979]"/>
            </button>
          </form>
          <p className="text-sm text-[#6d7280] text-center mt-8">No account needed. Just your contact details.</p>
        </div>
      </section>

      <section className="bg-card border-y border-border px-8 py-14">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif text-3xl text-center mb-1">Choose your zone</h2>
          <p className="text-muted-foreground text-center text-sm mb-8">All zones include high-speed Wi-Fi</p>
          <div className="grid grid-cols-3 gap-4">
            {(["focus","discussion","room"] as Zone[]).map(z=>{
              const m=ZONE_META[z];
              const priceLabel = z==="focus" ? "From RM 3/hr" : z==="discussion" ? "RM 10/hr" : "From RM 25/hr";
              return (
                <div key={z} className="rounded-2xl border p-5" style={{backgroundColor:m.light,borderColor:`${m.hex}25`}}>
                  <span style={{color:m.hex}}>{m.icon}</span>
                  <div className="font-semibold mt-2 mb-0.5 text-sm" style={{color:m.hex}}>{m.label}</div>
                  <div className="font-mono text-2xl font-bold" style={{color:m.hex}}>{priceLabel}</div>
                  <div className="text-xs mt-2 leading-relaxed" style={{color:`${m.hex}99`}}>
                    {z==="focus"&&"Individual focus seats, including Level 2 seats and the private room"}
                    {z==="discussion"&&"Round discussion tables for group study sessions"}
                    {z==="room"&&"Book the whole discussion room up to 3 days ahead"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-8 py-14 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {icon:<QrCode className="w-5 h-5"/>,title:"Instant QR Check-in",desc:"Pay online, receive a QR code. Show it at reception and your session starts immediately."},
            {icon:<UtensilsCrossed className="w-5 h-5"/>,title:"Order Food & Drinks",desc:"Order from our café or pizza vendor straight to your desk — or pick it up at the counter."},
            {icon:<Timer className="w-5 h-5"/>,title:"Comfortable Study Environment",desc:"Study in a quiet, comfortable space with reliable Wi-Fi, charging points and ergonomic seating."},
          ].map(f=>(
            <div key={f.title} className="bg-card rounded-2xl border border-border p-6">
              <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center text-primary mb-3">{f.icon}</div>
              <div className="font-semibold mb-1.5">{f.title}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </BrandedScreen>
  );
}

// ── Auth page shell ───────────────────────────────────────────────────────────
function AuthShell({ title, subtitle, onBack, children }: { title:string; subtitle:string; onBack:()=>void; children:React.ReactNode; }) {
  return (
    <div className="portal-theme min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-card px-8 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4"/>Back
        </button>
      </nav>
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <BrandLogo className="h-11 w-11 rounded-xl object-cover" />
            <div>
              <div className="font-serif text-xl leading-tight">{title}</div>
              <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">{subtitle}</div>
            </div>
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

// ── Admin Login ───────────────────────────────────────────────────────────────
function AdminLoginPage({ onLogin, onBack }: { onLogin:(username:string,password:string)=>Promise<string|null>; onBack:()=>void; }) {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [showP,setShowP]=useState(false); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      const message=await onLogin(u,p);
      setErr(message ?? "");
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell title="Quety Study Lounge Admin" subtitle="Secure Access" onBack={onBack}>
      <div className="bg-card rounded-3xl border border-border p-7 shadow-sm">
        <h1 className="font-serif text-2xl mb-0.5">Sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">Admin access only</p>
        <form onSubmit={submit} className="space-y-3">
          <input value={u} onChange={e=>{setU(e.target.value);setErr("");}} placeholder="Username" autoComplete="username"
            className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
          <div className="relative">
            <input value={p} onChange={e=>{setP(e.target.value);setErr("");}} type={showP?"text":"password"} placeholder="••••••••"
              className="w-full bg-background rounded-xl px-4 py-3 pr-10 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
            <button type="button" onClick={()=>setShowP(!showP)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showP?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
            </button>
          </div>
          <AnimatePresence>
            {err&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 shrink-0"/>{err}
              </div>
            </motion.div>}
          </AnimatePresence>
          <button type="submit" disabled={loading||!u||!p}
            className={["w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
              u&&p&&!loading?"bg-[#15345d] text-white hover:opacity-90 shadow-[0_14px_30px_rgba(21,52,93,0.18)]":"bg-muted text-muted-foreground cursor-not-allowed",
            ].join(" ")}>
            {loading?<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>Verifying…</>:"Sign in to Admin Panel"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

// ── Admin Signup ──────────────────────────────────────────────────────────────
function AdminSignupPage({ onCreated, onBack }: { onCreated:(a:{username:string;password:string;role:"superadmin"|"admin"})=>Promise<boolean>; onBack:()=>void; }) {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [p2,setP2]=useState(""); const [role,setRole]=useState<"superadmin"|"admin">("admin"); const [err,setErr]=useState("");
  async function submit(e:React.FormEvent) {
    e.preventDefault();
    if(!u.trim()||!p.trim()){setErr("All fields are required.");return;}
    if(p!==p2){setErr("Passwords do not match.");return;}
    if(p.length<6){setErr("Password must be at least 6 characters.");return;}
    const ok=await onCreated({username:u.trim(),password:p,role});
    if(!ok)setErr("Could not create this account. Sign in as Superadmin first.");
  }
  return (
    <AuthShell title="Create Account" subtitle="Admin Registration" onBack={onBack}>
      <div className="bg-card rounded-3xl border border-border p-7 shadow-sm">
        <h1 className="font-serif text-2xl mb-0.5">New admin account</h1>
        <p className="text-sm text-muted-foreground mb-6">Set up access for a new team member</p>
        <form onSubmit={submit} className="space-y-3">
          <input value={u} onChange={e=>{setU(e.target.value);setErr("");}} placeholder="Username"
            className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
          <input value={p} onChange={e=>{setP(e.target.value);setErr("");}} type="password" placeholder="Password"
            className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
          <input value={p2} onChange={e=>{setP2(e.target.value);setErr("");}} type="password" placeholder="Confirm password"
            className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Role</p>
            <div className="flex gap-2">
              {([["admin","Admin"],["superadmin","Superadmin"]] as [typeof role, string][]).map(([r,l])=>(
                <button key={r} type="button" onClick={()=>setRole(r)}
                  className={["flex-1 py-2 rounded-xl text-sm border font-medium transition-all",
                    role===r?"bg-primary text-primary-foreground border-primary":"bg-background border-border text-muted-foreground hover:text-foreground",
                  ].join(" ")}>{l}</button>
              ))}
            </div>
          </div>
          <AnimatePresence>
            {err&&<motion.p initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="text-xs text-red-600">{err}</motion.p>}
          </AnimatePresence>
          <button type="submit" className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm">
            Create Account
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

// ── Vendor Login ──────────────────────────────────────────────────────────────
function VendorLoginPage({ onLogin, onBack }: { onLogin:(username:string,password:string)=>Promise<string|null>; onBack:()=>void; }) {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [showP,setShowP]=useState(false); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      const message=await onLogin(u,p);
      setErr(message ?? "");
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell title="Vendor Portal" subtitle="Partner Access" onBack={onBack}>
      <div className="bg-card rounded-3xl border border-border p-7 shadow-sm">
        <h1 className="font-serif text-2xl mb-0.5">Vendor sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">Vendor and superadmin access only</p>
        <form onSubmit={submit} className="space-y-3">
          <input value={u} onChange={e=>{setU(e.target.value);setErr("");}} placeholder="Username"
            className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
          <div className="relative">
            <input value={p} onChange={e=>{setP(e.target.value);setErr("");}} type={showP?"text":"password"} placeholder="Password"
              className="w-full bg-background rounded-xl px-4 py-3 pr-10 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
            <button type="button" onClick={()=>setShowP(!showP)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showP?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
            </button>
          </div>
          <AnimatePresence>
            {err&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2"><XCircle className="w-3.5 h-3.5 shrink-0"/>{err}</div>
            </motion.div>}
          </AnimatePresence>
          <button type="submit" disabled={loading||!u||!p}
            className={["w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
              u&&p&&!loading?"bg-primary text-primary-foreground hover:opacity-90":"bg-muted text-muted-foreground cursor-not-allowed",
            ].join(" ")}>
            {loading?<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>Verifying…</>:"Sign In"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

// ── Food Menu Page ────────────────────────────────────────────────────────────
function FoodMenuPage({ booking, menuItems, vendorCompanies, cart, onCartChange, onCheckout, onBack }: {
  booking: Booking|null; menuItems: FoodItem[]; vendorCompanies: VendorCompany[]; cart: CartItem[];
  onCartChange:(item:FoodItem,delta:number)=>void; onCheckout:()=>void; onBack:()=>void;
}) {
  const visibleVendors = vendorCompanies.length
    ? vendorCompanies
    : [...new Set(menuItems.map(item => item.vendor))].map(vendorId => ({
        id: vendorId,
        label: fallbackVendorLabel(vendorId),
        isOpen: true,
      }));
  const [activeVendor, setActiveVendor] = useState<VendorType>(visibleVendors[0]?.id ?? "cafe");
  useEffect(() => {
    if (!visibleVendors.some(company => company.id === activeVendor)) {
      setActiveVendor(visibleVendors[0]?.id ?? "cafe");
    }
  }, [visibleVendors, activeVendor]);
  const activeVendorInfo = visibleVendors.find(company => company.id === activeVendor) ?? null;
  const vendorItems = menuItems.filter(i=>i.vendor===activeVendor&&i.available);
  const categories = [...new Set(vendorItems.map(i=>i.category))];
  const cartTotal = cart.reduce((s,c)=>s+c.item.price*c.qty,0);
  const cartCount = cart.reduce((s,c)=>s+c.qty,0);
  const closedCartVendors = [...new Set(
    cart
      .map(entry => visibleVendors.find(company => company.id === entry.item.vendor))
      .filter((company): company is VendorCompany => Boolean(company && !company.isOpen))
      .map(company => company.label)
  )];
  const orderPanelContent = (
    <>
      <div className="px-5 py-5 border-b border-border">
        <h2 className="font-serif text-xl flex items-center gap-2">
          <ShoppingBag className="w-4 h-4"/>Your Order
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">{cartCount===0?"Nothing added yet":`${cartCount} item${cartCount!==1?"s":""}`}</p>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {cart.length===0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <UtensilsCrossed className="w-8 h-8 text-muted-foreground/40"/>
            <p className="text-sm text-muted-foreground">Add items from the menu to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {cart.map(c=>(
                <motion.div key={c.item.id} layout initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}}
                  className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{c.item.name}</div>
                    <div className="text-xs text-muted-foreground">{fmtMoney(c.item.price)} × {c.qty}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={()=>onCartChange(c.item,-1)} className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center"><Minus className="w-3 h-3"/></button>
                    <span className="font-mono text-xs w-3 text-center">{c.qty}</span>
                    <button onClick={()=>onCartChange(c.item,1)} className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Plus className="w-3 h-3"/></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {cart.length>0&&(
        <div className="p-5 border-t border-border space-y-3">
          {closedCartVendors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {closedCartVendors.join(", ")} {closedCartVendors.length === 1 ? "is" : "are"} closed right now. Please remove those items before checkout.
            </div>
          )}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmtMoney(cartTotal)}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-2"><span>Total</span><span className="text-primary">{fmtMoney(cartTotal)}</span></div>
          </div>
          <button disabled={closedCartVendors.length > 0} onClick={onCheckout} className={["w-full rounded-xl py-3 text-sm font-semibold transition-opacity",
            closedCartVendors.length === 0 ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed",
          ].join(" ")}>
            Checkout →
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="portal-theme min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4"/>Back
        </button>
        <div className="text-center">
          <div className="font-serif text-lg">Order Food & Drinks</div>
          {booking&&<div className="text-xs text-muted-foreground">Seat {booking.seatId} · Ref {booking.ref}</div>}
        </div>
        <div className="w-20"/>
      </header>

      <div className="flex flex-1 min-h-0 lg:flex-row">
        {/* Menu */}
        <div className="flex-1 overflow-auto p-6 pb-[22rem] sm:pb-[24rem] lg:pb-6">
          {/* Vendor tabs */}
          <div className="flex gap-2 mb-6">
            {visibleVendors.map(company=>(
              <button key={company.id} onClick={()=>setActiveVendor(company.id)}
                className={["flex-1 max-w-[200px] py-2.5 rounded-xl text-sm font-semibold border transition-all",
                  activeVendor===company.id?"bg-primary text-primary-foreground border-primary shadow":"bg-card border-border hover:border-primary/40",
                ].join(" ")}>
                <div>{company.label}</div>
                <div className={["text-[10px] mt-1",activeVendor===company.id?"text-primary-foreground/80":"text-muted-foreground"].join(" ")}>
                  {company.isOpen ? "Open" : "Closed"}
                </div>
              </button>
            ))}
          </div>

          {activeVendorInfo && !activeVendorInfo.isOpen && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {activeVendorInfo.label} is closed right now. You can still browse the menu, but new orders are paused.
            </div>
          )}

          {categories.map(cat=>(
            <div key={cat} className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{cat}</h3>
              <div className="space-y-2">
                {vendorItems.filter(i=>i.category===cat).map(item=>{
                  const inCart=cart.find(c=>c.item.id===item.id);
                  return (
                    <div key={item.id} className="bg-card rounded-xl border border-border p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-2xl object-cover border border-border shrink-0"/>
                          : <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-[10px] text-muted-foreground border border-border shrink-0">No image</div>}
                        <div>
                          <div className="font-medium text-sm">{item.name}</div>
                          {item.description && <div className="text-xs text-muted-foreground mt-1 max-w-md">{item.description}</div>}
                          <div className="text-primary font-mono text-sm font-semibold mt-0.5">{fmtMoney(item.price)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {inCart ? (
                          <>
                            <button onClick={()=>onCartChange(item,-1)} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"><Minus className="w-3.5 h-3.5"/></button>
                            <span className="font-mono font-semibold text-sm w-4 text-center">{inCart.qty}</span>
                            <button disabled={!activeVendorInfo?.isOpen} onClick={()=>onCartChange(item,1)} className={["w-7 h-7 rounded-lg flex items-center justify-center transition-opacity",
                              activeVendorInfo?.isOpen ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed",
                            ].join(" ")}><Plus className="w-3.5 h-3.5"/></button>
                          </>
                        ) : (
                          <button disabled={!activeVendorInfo?.isOpen} onClick={()=>onCartChange(item,1)} className={["flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity",
                            activeVendorInfo?.isOpen ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed",
                          ].join(" ")}>
                            <Plus className="w-3 h-3"/>Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Cart sidebar */}
        <div className="hidden lg:flex w-72 bg-card border-l border-border flex-col">
          {orderPanelContent}
        </div>
      </div>

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 shadow-[0_-10px_30px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex max-h-[50vh] w-full max-w-3xl flex-col">
          {orderPanelContent}
        </div>
      </div>
    </div>
  );
}

// ── Food Checkout (delivery prompt + pay) ─────────────────────────────────────
function FoodCheckoutPage({ booking, cart, onConfirm, onBack }: {
  booking:Booking|null; cart:CartItem[]; onConfirm:(delivery:"table"|"pickup")=>void; onBack:()=>void;
}) {
  const [delivery, setDelivery] = useState<"table"|"pickup"|null>(null);
  const cartTotal = cart.reduce((s,c)=>s+c.item.price*c.qty,0);

  return (
    <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4"/>Back to menu
        </button>
        <h1 className="font-serif text-3xl mb-1">Complete Order</h1>
        <p className="text-sm text-muted-foreground mb-6">How would you like to receive your order?</p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {([
            ["table","Deliver to my seat",<Truck className="w-6 h-6"/>,`We'll bring it to ${booking?.seatId??"your seat"}`],
            ["pickup","I'll pick it up",<ShoppingBag className="w-6 h-6"/>,"Collect from the counter when ready"],
          ] as [typeof delivery, string, React.ReactNode, string][]).map(([v,label,icon,desc])=>{
            const isSel=delivery===v;
            return (
              <button key={v!} onClick={()=>setDelivery(v)}
                className={["rounded-2xl border-2 p-5 text-left transition-all",
                  isSel?"border-primary bg-accent/40":"border-border hover:border-primary/40 bg-card",
                ].join(" ")}>
                <div className={["mb-2",isSel?"text-primary":"text-muted-foreground"].join(" ")}>{icon}</div>
                <div className="font-semibold text-sm mb-0.5">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </button>
            );
          })}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 mb-5 space-y-2 text-sm">
          {cart.map(c=>(
            <div key={c.item.id} className="flex justify-between text-muted-foreground">
              <span>{c.item.name} × {c.qty}</span><span>{fmtMoney(c.item.price*c.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-border pt-2"><span>Total</span><span className="text-primary">{fmtMoney(cartTotal)}</span></div>
        </div>

        <button disabled={!delivery} onClick={()=>delivery&&onConfirm(delivery)}
          className={["w-full rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
            delivery?"bg-primary text-primary-foreground hover:opacity-90 shadow":"bg-muted text-muted-foreground cursor-not-allowed",
          ].join(" ")}>
          Continue to Payment <ChevronRight className="w-4 h-4"/>
        </button>
      </motion.div>
    </div>
  );
}

function PaymentQrGallery({ amount, description }: { amount: number; description: string; }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {PAYMENT_QR_OPTIONS.map(option => (
          <div key={option.src} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <img src={option.src} alt={option.label} className="w-full object-cover" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm">
        <div className="flex justify-between gap-3"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-primary">{fmtMoney(amount)}</span></div>
        <div className="mt-3 flex justify-between gap-3 border-t border-border pt-3"><span className="text-muted-foreground">Description</span><span className="font-medium text-right">{description}</span></div>
      </div>
    </div>
  );
}

function FoodPaymentPage({ booking, cart, request, delivery, onPay, onBack }: {
  booking: Booking | null;
  cart: CartItem[];
  request: FoodPaymentRequest | null;
  delivery: "table" | "pickup" | null;
  onPay: ()=>void;
  onBack: ()=>void;
}) {
  const cartTotal = cart.reduce((sum, item) => sum + item.item.price * item.qty, 0);
  const amount = request?.total ?? cartTotal;

  return (
    <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-3xl">
        {request?.status !== "pending" && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4"/>Back to checkout
          </button>
        )}
        {request?.status === "pending" ? (
          <div className="max-w-md mx-auto text-center">
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-5 h-5 text-primary animate-spin"/>
            </div>
            <h1 className="font-serif text-3xl mb-1">Waiting for Food Payment Verification</h1>
            <p className="text-sm text-muted-foreground mb-6">Your food payment is waiting for reception approval. Once verified, this page will move to your food receipt automatically.</p>
            <PaymentQrGallery amount={amount} description="food orders" />
            <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-left text-sm space-y-2">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Request</span><span className="font-mono font-medium">{request.id}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Booking</span><span className="font-mono font-medium">{request.bookingRef}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Delivery</span><span className="font-medium capitalize">{request.delivery}</span></div>
            </div>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-3xl mb-1">Pay for Food Orders</h1>
            <p className="text-sm text-muted-foreground mb-6">Scan either QR, pay the exact amount, and use <span className="font-semibold text-foreground">food orders</span> as the description.</p>
            <PaymentQrGallery amount={amount} description="food orders" />
            <div className="mt-4 bg-card rounded-2xl border border-border p-5 space-y-2 text-sm">
              {cart.map(c=>(
                <div key={c.item.id} className="flex justify-between gap-3 text-muted-foreground">
                  <span>{c.item.name} × {c.qty}</span><span>{fmtMoney(c.item.price * c.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-border pt-3 font-semibold">
                <span>Total</span><span className="text-primary">{fmtMoney(amount)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {booking && `Seat ${booking.seatId} · Ref ${booking.ref}`}
                {delivery && ` · ${delivery === "table" ? "Deliver to seat" : "Pickup"}`}
              </div>
            </div>
            <button onClick={onPay} className="mt-5 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 shadow">
              I Have Paid
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

function FoodReceiptPage({ booking, orders, onDownload, onBack }: {
  booking: Booking | null;
  orders: FoodOrder[];
  onDownload: ()=>void;
  onBack: ()=>void;
}) {
  const grandTotal = orders.reduce((sum, order) => sum + order.total, 0);
  const orderIdsLabel = orders.map(order => order.id).join(", ");

  return (
    <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-2xl">
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-6 border-b border-border text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 mb-3">
              <CheckCircle className="w-7 h-7"/>
            </div>
            <h1 className="font-serif text-3xl mb-1">Food Order Confirmed</h1>
            <p className="text-sm text-muted-foreground">
              Your order receipt is ready.
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Booking Reference</div>
                <div className="font-mono text-sm font-semibold">{booking?.ref ?? "—"}</div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{orders.length === 1 ? "Order ID" : "Order IDs"}</div>
                <div className="font-mono text-sm font-semibold break-words">{orderIdsLabel || "—"}</div>
              </div>
            </div>

            <div className="space-y-3">
              {orders.map(order=>(
                <div key={order.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="font-semibold">{order.vendorLabel ?? fallbackVendorLabel(order.vendor)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span className="font-mono">{order.id}</span>
                        {" · "}
                        {order.delivery === "table" ? `Deliver to ${order.seatId}` : "Pickup"}
                      </div>
                    </div>
                    <div className="font-semibold text-primary">{fmtMoney(order.total)}</div>
                  </div>
                  <div className="space-y-1.5">
                    {order.lines.map((line, index)=>(
                      <div key={`${order.id}-${line.itemId}-${index}`} className="flex justify-between gap-3 text-sm text-muted-foreground">
                        <span>{line.name} × {line.qty}</span>
                        <span>{fmtMoney(line.price * line.qty)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 px-4 py-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Paid</div>
                <div className="text-sm text-muted-foreground">{orders.length} {orders.length === 1 ? "order" : "orders"}</div>
              </div>
              <div className="font-serif text-2xl text-primary">{fmtMoney(grandTotal)}</div>
            </div>
          </div>

          <div className="px-6 py-5 border-t border-border bg-muted/10 flex flex-col sm:flex-row gap-3">
            <button onClick={onDownload} className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Download className="w-4 h-4"/>Download Receipt
            </button>
            <button onClick={onBack} className="flex-1 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Back to Booking Confirmation
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Vendor Portal ─────────────────────────────────────────────────────────────
function VendorPortal({ session, vendorCompanies, vendorAccounts, menuItems, foodOrders, vendorDashboard, onMenuChange, onMenuUpdate, onOrderComplete, onAddItem, onCreateAccount, onUpdateAccount, onDeleteAccount, onAddCompany, onRenameCompany, onToggleVendorOpen, onLogout }: {
  session:VendorSession;
  vendorCompanies:VendorCompany[];
  vendorAccounts:VendorAccount[];
  menuItems:FoodItem[];
  foodOrders:FoodOrder[];
  vendorDashboard:VendorDashboard|null;
  onMenuChange:(id:string,available:boolean)=>void;
  onMenuUpdate:(id:string,input:{name:string;category:string;description:string;price:number;imageUrl:string;available:boolean})=>Promise<boolean>;
  onOrderComplete:(id:string)=>void;
  onAddItem:(item:Omit<FoodItem,"id">)=>void;
  onCreateAccount:(input:{username:string;password:string;role:"superadmin"|"vendor";vendorId:VendorType|null})=>Promise<boolean>;
  onUpdateAccount:(accountId:string,input:{username:string;password:string;role:"superadmin"|"vendor";vendorId:VendorType|null})=>Promise<boolean>;
  onDeleteAccount:(accountId:string)=>Promise<void>;
  onAddCompany:(label:string)=>Promise<boolean>;
  onRenameCompany:(vendorId:string,label:string)=>Promise<boolean>;
  onToggleVendorOpen:(vendorId:string,isOpen:boolean)=>Promise<void>;
  onLogout:()=>void;
}) {
  const [tab, setTab] = useState<VendorTab>("menu");
  const isSuperadmin = session.role === "superadmin";
  const [menuVendor, setMenuVendor] = useState<VendorType>(session.vendorId ?? vendorCompanies[0]?.id ?? "cafe");
  const [salesRange, setSalesRange] = useState<SalesRange>("week");
  const [newName,setNewName]=useState(""); const [newCat,setNewCat]=useState(""); const [newDescription,setNewDescription]=useState(""); const [newPrice,setNewPrice]=useState(""); const [newImageUrl,setNewImageUrl]=useState(""); const [adding,setAdding]=useState(false);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<{username:string;password:string;role:"superadmin"|"vendor";vendorId:VendorType|null}>({ username: "", password: "", role: "vendor", vendorId: vendorCompanies[0]?.id ?? "cafe" });
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const [newCompanyName, setNewCompanyName] = useState("");

  const visibleOrders = foodOrders.filter(order=>isSuperadmin ? true : order.vendor===session.vendorId);
  const visibleItems = menuItems.filter(item=>isSuperadmin ? item.vendor===menuVendor : item.vendor===session.vendorId);
  const pendingCount = visibleOrders.filter(order=>order.status==="pending"||order.status==="preparing").length;
  const categories = [...new Set(visibleItems.map(item=>item.category))];
  const vendorLabelForId = (vendorId: string, explicitLabel?: string | null) =>
    explicitLabel ?? vendorCompanies.find(company=>company.id===vendorId)?.label ?? fallbackVendorLabel(vendorId);
  const filteredSalesOrders = visibleOrders.filter(order=>inSalesRange(order.placedAt, salesRange));
  const salesBreakdownRows = useMemo(() => {
    return filteredSalesOrders
      .flatMap(order =>
        order.lines.map((line, index) => ({
          key: `${order.id}-${line.itemId}-${index}`,
          date: order.placedAt,
          orderId: order.id,
          vendor: order.vendor,
          vendorLabel: vendorLabelForId(order.vendor, order.vendorLabel),
          itemName: line.name,
          quantity: line.qty,
          sales: line.price * line.qty,
        }))
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredSalesOrders, vendorLabelForId]);
  const topSellingItem = useMemo(()=>{
    const itemMap = new Map<string, { name: string; qty: number }>();
    for (const order of filteredSalesOrders) {
      for (const line of order.lines) {
        const bucket = itemMap.get(line.itemId) ?? { name: line.name, qty: 0 };
        bucket.qty += line.qty;
        itemMap.set(line.itemId, bucket);
      }
    }
    return [...itemMap.values()].sort((a,b)=>b.qty-a.qty)[0] ?? null;
  },[filteredSalesOrders]);
  const managedVendorId = isSuperadmin ? menuVendor : (session.vendorId ?? menuVendor);
  const managedVendor = vendorCompanies.find(company => company.id === managedVendorId) ?? null;
  const itemSalesRows = useMemo(() => {
    const map = new Map<string, { vendor: string; vendorLabel: string; name: string; qty: number; sales: number }>();
    for (const order of filteredSalesOrders) {
      for (const line of order.lines) {
        const key = `${order.vendor}:${line.itemId}`;
        const bucket = map.get(key) ?? {
          vendor: order.vendor,
          vendorLabel: vendorLabelForId(order.vendor, order.vendorLabel),
          name: line.name,
          qty: 0,
          sales: 0,
        };
        bucket.qty += line.qty;
        bucket.sales += line.price * line.qty;
        map.set(key, bucket);
      }
    }
    return [...map.values()].sort((a, b) => (b.sales - a.sales) || (b.qty - a.qty) || a.name.localeCompare(b.name));
  }, [filteredSalesOrders, vendorLabelForId]);

  useEffect(() => {
    setCompanyNames(Object.fromEntries(vendorCompanies.map(company => [company.id, company.label])));
  }, [vendorCompanies]);

  function resetAccountForm() {
    setEditingVendorId(null);
    setShowAccountForm(false);
    setAccountForm({ username: "", password: "", role: "vendor", vendorId: vendorCompanies[0]?.id ?? "cafe" });
  }

  function addItem(e:React.FormEvent) {
    e.preventDefault();
    if(!newName.trim()||!newCat.trim()||!newPrice)return;
    if (editingMenuId) {
      void onMenuUpdate(editingMenuId, {
        name:newName.trim(),
        category:newCat.trim(),
        description:newDescription.trim(),
        price:parseFloat(newPrice),
        imageUrl:newImageUrl,
        available:visibleItems.find(item=>item.id===editingMenuId)?.available ?? true,
      }).then(ok=>{
        if (ok) {
          setEditingMenuId(null);
          setNewName("");setNewCat("");setNewDescription("");setNewPrice("");setNewImageUrl("");setAdding(false);
        }
      });
      return;
    }
    onAddItem({
      name:newName.trim(),
      category:newCat.trim(),
      description:newDescription.trim(),
      price:parseFloat(newPrice),
      vendor:isSuperadmin ? menuVendor : (session.vendorId ?? "cafe"),
      available:true,
      imageUrl:newImageUrl,
    });
    setNewName("");setNewCat("");setNewDescription("");setNewPrice("");setNewImageUrl("");setAdding(false);
  }

  const statusColor:Record<string,string>={pending:"bg-amber-100 text-amber-700",preparing:"bg-blue-100 text-blue-700",ready:"bg-emerald-100 text-emerald-700",completed:"bg-gray-100 text-gray-500"};

  return (
    <div className="portal-theme min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-9 w-9 rounded-xl object-cover" />
          <div>
            <div className="font-serif text-xl leading-tight">{session.vendorLabel ?? "Vendor Control"}</div>
            <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">{isSuperadmin ? `Vendor Superadmin · ${session.username}` : `${session.vendorLabel} · ${session.username}`}</div>
          </div>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted transition-all">
          <LogOut className="w-3.5 h-3.5"/>Sign out
        </button>
      </header>

      <div className="bg-card border-b border-border px-6">
        <div className="flex overflow-x-auto" style={{scrollbarWidth:"none"}}>
          {([
            {key:"menu",label:"Menu Management"},
            {key:"orders",label:`Incoming Orders${pendingCount>0?` (${pendingCount})`:""}`},
            {key:"dashboard",label:"Sales"},
            ...(isSuperadmin ? [{key:"accounts" as VendorTab,label:"Accounts"}] : []),
          ] as {key:VendorTab;label:string}[]).map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={["shrink-0 px-4 py-3.5 text-sm border-b-2 transition-colors",
                tab===t.key?"border-primary text-primary font-medium":"border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab==="menu"&&(
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
              <div>
                <h2 className="font-serif text-2xl mb-0.5">Menu Items</h2>
                <p className="text-sm text-muted-foreground">{visibleItems.filter(item=>item.available).length} of {visibleItems.length} items available</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {managedVendor && (
                  <button
                    onClick={()=>void onToggleVendorOpen(managedVendor.id, !managedVendor.isOpen)}
                    className={["flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
                      managedVendor.isOpen
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                        : "border-red-200 bg-red-50 text-red-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700",
                    ].join(" ")}
                  >
                    {managedVendor.isOpen ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {managedVendor.isOpen ? "Shop Open" : "Shop Closed"}
                  </button>
                )}
                <button onClick={()=>{
                  if (adding) {
                    setAdding(false);
                    setEditingMenuId(null);
                    setNewName("");setNewCat("");setNewDescription("");setNewPrice("");setNewImageUrl("");
                    return;
                  }
                  if (!editingMenuId) {
                    setNewName("");setNewCat("");setNewDescription("");setNewPrice("");setNewImageUrl("");
                  }
                  setEditingMenuId(null);
                  setAdding(true);
                }} className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
                  <Plus className="w-4 h-4"/>{adding ? "Close" : "Add Item"}
                </button>
              </div>
            </div>

            {isSuperadmin&&(
              <div className="flex gap-2 mb-4">
                {vendorCompanies.map(company=>(
                  <button key={company.id} onClick={()=>setMenuVendor(company.id)}
                    className={["px-4 py-2 rounded-xl text-sm border font-medium transition-all",
                      menuVendor===company.id?"bg-primary text-primary-foreground border-primary":"bg-card border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}>{company.label}</button>
                ))}
              </div>
            )}

            <AnimatePresence>
              {adding&&(
                <motion.form onSubmit={addItem} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                  className="bg-card rounded-2xl border border-primary/30 p-5 mb-5 space-y-3">
                  <h3 className="font-semibold text-sm">{editingMenuId ? "Edit Menu Item" : "New Menu Item"}</h3>
                  <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Item name"
                    className="w-full bg-background rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Category (e.g. Coffee)"
                      className="bg-background rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
                    <input value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="Price (e.g. 4.50)" type="number" step="0.50" min="0"
                      className="bg-background rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono transition-colors placeholder:font-sans placeholder:text-muted-foreground"/>
                  </div>
                  <textarea
                    value={newDescription}
                    onChange={e=>setNewDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={3}
                    className="w-full resize-y bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"
                  />
                  <div className="space-y-2">
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Menu Photo</label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={e=>{
                        const file = e.target.files?.[0];
                        if(!file){setNewImageUrl("");return;}
                        const reader = new FileReader();
                        reader.onload = () => setNewImageUrl(typeof reader.result==="string" ? reader.result : "");
                        reader.readAsDataURL(file);
                      }}
                      className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
                    />
                    {newImageUrl&&<img src={newImageUrl} alt={newName || "Menu preview"} className="h-40 w-full rounded-xl object-cover border border-border"/>}
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-primary text-primary-foreground rounded-xl py-2 text-sm font-semibold hover:opacity-90 transition-opacity">{editingMenuId ? "Save Changes" : "Save Item"}</button>
                    <button type="button" onClick={()=>{
                      setAdding(false);
                      setEditingMenuId(null);
                      setNewName("");setNewCat("");setNewDescription("");setNewPrice("");setNewImageUrl("");
                    }} className="px-4 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {categories.map(cat=>(
              <div key={cat} className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</h3>
                <div className="space-y-2">
                  {visibleItems.filter(item=>item.category===cat).map(item=>(
                    <div key={item.id} className="bg-card rounded-xl border border-border p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-2xl object-cover border border-border shrink-0"/>
                          : <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-[10px] text-muted-foreground border border-border shrink-0">No image</div>}
                        <div>
                          {isSuperadmin&&<div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{vendorLabelForId(item.vendor)}</div>}
                          <div className={["font-medium text-sm",!item.available?"line-through text-muted-foreground":""].join(" ")}>{item.name}</div>
                          {item.description && <div className="text-xs text-muted-foreground mt-1 max-w-md">{item.description}</div>}
                          <div className="font-mono text-xs text-muted-foreground mt-0.5">{fmtMoney(item.price)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={()=>{
                            setAdding(true);
                            setEditingMenuId(item.id);
                            setNewName(item.name);
                            setNewCat(item.category);
                            setNewDescription(item.description ?? "");
                            setNewPrice(item.price.toFixed(2));
                            setNewImageUrl(item.imageUrl ?? "");
                          }}
                          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-blue-100 hover:text-blue-700 transition-colors"
                          title="Edit menu item"
                        >
                          <Pencil className="w-3.5 h-3.5"/>
                        </button>
                        <button onClick={()=>onMenuChange(item.id,!item.available)}
                          className={["flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all shrink-0",
                            item.available?"bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                                          :"bg-red-50 border-red-200 text-red-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700",
                          ].join(" ")}>
                          {item.available?<ToggleRight className="w-3.5 h-3.5"/>:<ToggleLeft className="w-3.5 h-3.5"/>}
                          {item.available?"Available":"Unavailable"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==="orders"&&(
          <div className="max-w-3xl">
            <h2 className="font-serif text-2xl mb-1">Incoming Orders</h2>
            <p className="text-sm text-muted-foreground mb-5">{visibleOrders.length} orders in this portal</p>
            {visibleOrders.length===0?(
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <ShoppingBag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3"/>
                <p className="text-muted-foreground text-sm">No orders yet. They'll appear here when customers order.</p>
              </div>
            ):(
              <div className="space-y-4">
                {[...visibleOrders].sort((a,b)=>b.placedAt.getTime()-a.placedAt.getTime()).map(order=>{
                  const mins=Math.floor((Date.now()-order.placedAt.getTime())/60000);
                  return (
                    <div key={order.id} className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold">{order.customerName}</span>
                            <span className={["text-[10px] rounded-full px-2 py-0.5 font-medium capitalize",statusColor[order.status]??"bg-gray-100 text-gray-500"].join(" ")}>{order.status}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span className="font-mono">{order.id}</span>
                            <span>·</span>
                            <span>Seat {order.seatId}</span>
                            <span>·</span>
                            <span>{vendorLabelForId(order.vendor, order.vendorLabel)}</span>
                            <span>·</span>
                            <span>{order.delivery==="table"?"Deliver to seat":"Pickup"}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-primary">{fmtMoney(order.total)}</div>
                          <div className="text-[10px] text-muted-foreground">{mins}m ago</div>
                        </div>
                      </div>
                      <div className="space-y-1 mb-4">
                        {order.lines.map(line=>(
                          <div key={line.itemId} className="flex justify-between text-sm text-muted-foreground">
                            <span>{line.name} × {line.qty}</span>
                            <span>{fmtMoney(line.price*line.qty)}</span>
                          </div>
                        ))}
                      </div>
                      {order.status!=="completed"?(
                        <SlideComplete
                          label={order.delivery==="table"?"Slide to mark delivered →":"Slide to mark ready for pickup →"}
                          onComplete={()=>onOrderComplete(order.id)}
                        />
                      ):(
                        <div className="h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center gap-2 text-gray-500 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5"/>Order completed
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab==="dashboard"&&(
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-serif text-2xl mb-0.5">Sales Dashboard</h2>
                <p className="text-sm text-muted-foreground">Order sales for the selected {salesRange}.</p>
              </div>
              <div className="flex gap-2">
                {(["week","month","year"] as SalesRange[]).map(range=>(
                  <button key={range} onClick={()=>setSalesRange(range)}
                    className={["px-3 py-2 rounded-xl text-sm border font-medium transition-all capitalize",
                      salesRange===range?"bg-primary text-primary-foreground border-primary":"bg-card border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}>{range}</button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Sales</p>
                <div className="font-serif text-3xl text-primary">{fmtMoney(filteredSalesOrders.reduce((sum, order)=>sum + order.total, 0))}</div>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Orders</p>
                <div className="font-serif text-3xl">{filteredSalesOrders.length}</div>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Completed</p>
                <div className="font-serif text-3xl">{filteredSalesOrders.filter(order=>order.status==="completed").length}</div>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Top Item</p>
                <div className="font-serif text-2xl leading-tight">{topSellingItem?.name ?? "No sales yet"}</div>
                <div className="text-sm text-muted-foreground mt-1">{topSellingItem ? `${topSellingItem.qty} sold` : "Waiting for first order"}</div>
              </div>
            </div>

            {isSuperadmin&&vendorDashboard&&(
              <div className="bg-card rounded-2xl border border-border p-5">
                <h3 className="font-semibold text-sm mb-3">Company overview</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {vendorDashboard.vendorTotals.map(company=>(
                    <div key={company.vendor} className="rounded-xl border border-border bg-muted/20 px-4 py-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{company.label}</div>
                        <div className="text-xs text-muted-foreground">{company.orders} orders</div>
                      </div>
                      <div className="font-semibold text-primary">{fmtMoney(company.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-sm">Sales breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-muted/20 text-left">
                    <tr>
                      {[
                        "Date",
                        ...(isSuperadmin ? ["Company"] : []),
                        "Item Sold",
                        "Quantity",
                        "Order Number",
                        "Sales",
                      ].map(header => (
                        <th key={header} className="px-4 py-3 text-xs font-medium text-muted-foreground">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {salesBreakdownRows.map((row,i)=>(
                      <tr key={row.key} className={["border-t border-border/50",i%2===0?"":"bg-muted/10"].join(" ")}>
                        <td className="px-4 py-3 text-xs">{row.date.toLocaleString()}</td>
                        {isSuperadmin && <td className="px-4 py-3 text-xs">{row.vendorLabel}</td>}
                        <td className="px-4 py-3 text-xs">{row.itemName}</td>
                        <td className="px-4 py-3 text-xs">{row.quantity}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.orderId}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-primary">{fmtMoney(row.sales)}</td>
                      </tr>
                    ))}
                    {salesBreakdownRows.length===0&&(
                      <tr><td colSpan={isSuperadmin ? 6 : 5} className="px-4 py-10 text-center text-sm text-muted-foreground">No sales recorded in this period yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-sm">Items Sold</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="bg-muted/20 text-left">
                    <tr>
                      {[
                        ...(isSuperadmin ? ["Company"] : []),
                        "Item",
                        "Qty Sold",
                        "Sales",
                      ].map(header=>(
                        <th key={header} className="px-4 py-3 text-xs font-medium text-muted-foreground">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemSalesRows.map((row, index)=>(
                      <tr key={`${row.vendor}-${row.name}`} className={["border-t border-border/50",index%2===0?"":"bg-muted/10"].join(" ")}>
                        {isSuperadmin && <td className="px-4 py-3 text-xs">{row.vendorLabel}</td>}
                        <td className="px-4 py-3 text-xs">{row.name}</td>
                        <td className="px-4 py-3 text-xs">{row.qty}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-primary">{fmtMoney(row.sales)}</td>
                      </tr>
                    ))}
                    {itemSalesRows.length===0&&(
                      <tr><td colSpan={isSuperadmin ? 4 : 3} className="px-4 py-10 text-center text-sm text-muted-foreground">No item sales recorded in this period yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab==="accounts"&&isSuperadmin&&(
          <div className="max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <div><h2 className="font-serif text-2xl mb-0.5">Vendor Accounts</h2><p className="text-sm text-muted-foreground">{vendorAccounts.length} accounts</p></div>
              <button onClick={()=>{
                if (editingVendorId) resetAccountForm();
                else setShowAccountForm(open=>!open);
              }} className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
                <UserPlus className="w-4 h-4"/>New Account
              </button>
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 mb-4 space-y-3">
              <div>
                <h3 className="font-semibold text-sm">Vendor Companies</h3>
                <p className="text-xs text-muted-foreground">Add new companies and rename the ones that appear across the vendor portal.</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  value={newCompanyName}
                  onChange={e=>setNewCompanyName(e.target.value)}
                  placeholder="New company name"
                  className="flex-1 bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"
                />
                <button
                  onClick={async()=>{
                    const ok = await onAddCompany(newCompanyName);
                    if (ok) setNewCompanyName("");
                  }}
                  className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Add Company
                </button>
              </div>
              <div className="space-y-3">
                {vendorCompanies.map(company=>(
                  <div key={company.id} className="flex items-center gap-3">
                    <input
                      value={companyNames[company.id] ?? company.label}
                      onChange={e=>setCompanyNames(prev=>({ ...prev, [company.id]: e.target.value }))}
                      className="flex-1 bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors"
                    />
                    <button
                      onClick={async()=>{
                        const ok = await onRenameCompany(company.id, companyNames[company.id] ?? company.label);
                        if (!ok) {
                          setCompanyNames(prev=>({ ...prev, [company.id]: company.label }));
                        }
                      }}
                      className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      Save
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {(showAccountForm||editingVendorId)&&(
              <div className="bg-card rounded-2xl border border-primary/30 p-5 mb-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-sm">{editingVendorId ? "Edit account" : "Create account"}</h3>
                    <p className="text-xs text-muted-foreground">{editingVendorId ? "Leave password blank to keep it unchanged." : "Set up a vendor or vendor superadmin account."}</p>
                  </div>
                  <button onClick={resetAccountForm} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Close</button>
                </div>
                <input value={accountForm.username} onChange={e=>setAccountForm(form=>({ ...form, username: e.target.value }))}
                  placeholder="Username"
                  className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
                <input value={accountForm.password} onChange={e=>setAccountForm(form=>({ ...form, password: e.target.value }))}
                  type="password" placeholder={editingVendorId ? "New password" : "Password"}
                  className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
                <div className="flex gap-2">
                  {([["vendor","Vendor"],["superadmin","Superadmin"]] as [VendorAccount["role"], string][]).map(([role,label])=>(
                    <button key={role} type="button" onClick={()=>setAccountForm(form=>({ ...form, role, vendorId: role==="superadmin" ? null : (form.vendorId ?? vendorCompanies[0]?.id ?? "cafe") }))}
                      className={["flex-1 py-2 rounded-xl text-sm border font-medium transition-all",
                        accountForm.role===role?"bg-primary text-primary-foreground border-primary":"bg-background border-border text-muted-foreground hover:text-foreground",
                      ].join(" ")}>{label}</button>
                  ))}
                </div>
                {accountForm.role==="vendor"&&(
                  <select
                    value={accountForm.vendorId ?? ""}
                    onChange={e=>setAccountForm(form=>({ ...form, vendorId: e.target.value as VendorType }))}
                    className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors"
                  >
                    {vendorCompanies.map(company=>(
                      <option key={company.id} value={company.id}>{company.label}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={async()=>{
                    const input = { ...accountForm, vendorId: accountForm.role==="superadmin" ? null : accountForm.vendorId };
                    const ok = editingVendorId
                      ? await onUpdateAccount(editingVendorId, input)
                      : await onCreateAccount(input);
                    if (ok) resetAccountForm();
                  }}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                >
                  {editingVendorId ? "Save Changes" : "Create Account"}
                </button>
              </div>
            )}

            <div className="space-y-2">
              {vendorAccounts.map(account=>(
                <div key={account.id} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{account.username}</span>
                      <span className={["text-[10px] rounded-full px-2 py-0.5 font-medium",account.role==="superadmin"?"bg-amber-100 text-amber-700":"bg-blue-100 text-blue-700"].join(" ")}>
                        {account.role==="superadmin"?"Superadmin":"Vendor"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{account.vendorLabel ?? "All companies"} · Created {account.createdAt.toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={()=>{
                      setEditingVendorId(account.id);
                      setShowAccountForm(false);
                      setAccountForm({ username: account.username, password: "", role: account.role, vendorId: account.vendorId });
                    }} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-blue-100 hover:text-blue-700 transition-colors">
                      <Pencil className="w-3.5 h-3.5"/>
                    </button>
                    {account.id!=="vs1"&&(
                      <button onClick={()=>void onDeleteAccount(account.id)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5"/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── App Header (reusable) ─────────────────────────────────────────────────────
function AppHeader({ customer, hasActiveSession, onOpenActiveSession, onBack }: {
  customer:Customer|null;
  hasActiveSession:boolean;
  onOpenActiveSession:()=>void;
  onBack:()=>void;
}) {
  return (
    <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
      <button onClick={onBack} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
        <BrandLogo className="h-9 w-9 rounded-xl object-cover" />
        <div className="text-left">
          <div className="font-serif text-xl leading-tight">Quety Study Lounge</div>
          <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Study Space</div>
        </div>
      </button>
      <div className="flex items-center gap-3">
        {hasActiveSession && (
          <button
            onClick={onOpenActiveSession}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Active session
          </button>
        )}
        {customer&&<span className="text-xs text-muted-foreground">Hello, <span className="font-medium text-foreground">{customer.name.split(" ")[0]}</span></span>}
      </div>
    </header>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // ── View & auth ──
  const [view,      setView]      = useState<AppView>(initialView);
  const [adminTab,  setAdminTab]  = useState<AdminTab>("scan");
  const [customer,  setCustomer]  = useState<Customer|null>(null);
  const [adminAuth, setAdminAuth] = useState<AdminAccount|null>(null);
  const [adminToken,setAdminToken]= useState<string|null>(null);
  const [vendorAuth,setVendorAuth]= useState<VendorSession|null>(null);
  const [vendorToken,setVendorToken]= useState<string|null>(null);

  // ── Booking selection ──
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedHour, setSelectedHour] = useState<number|null>(null);
  const [selectedId,   setSelectedId]   = useState<string|null>(null);
  const [duration,     setDuration]     = useState(2);
  const [paymentBusy,  setPaymentBusy]  = useState(false);

  // ── Bookings ──
  const [booking,     setBooking]     = useState<Booking|null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [secsLeft,    setSecsLeft]    = useState(0);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailDraftUrl, setEmailDraftUrl] = useState("");

  // ── Food ──
  const [menuItems,  setMenuItems]  = useState<FoodItem[]>(DEFAULT_MENU);
  const [cart,       setCart]       = useState<CartItem[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>([]);
  const [foodView,   setFoodView]   = useState<"menu"|"checkout"|"payment"|"receipt">("menu");
  const [latestFoodReceipt, setLatestFoodReceipt] = useState<FoodOrder[]>([]);
  const [foodDeliveryChoice, setFoodDeliveryChoice] = useState<"table"|"pickup"|null>(null);
  const [pendingFoodPayment, setPendingFoodPayment] = useState<FoodPaymentRequest | null>(null);
  const [foodPaymentRequests, setFoodPaymentRequests] = useState<FoodPaymentRequest[]>([]);
  const [vendorAccounts, setVendorAccounts] = useState<VendorAccount[]>([]);
  const [vendorDashboard, setVendorDashboard] = useState<VendorDashboard | null>(null);
  const [vendorCompanies, setVendorCompanies] = useState<VendorCompany[]>([
    { id: "cafe", label: VENDOR_LABELS.cafe, isOpen: true },
    { id: "pizza", label: VENDOR_LABELS.pizza, isOpen: true },
  ]);

  // ── Admin ──
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>(DEFAULT_ADMIN_ACCOUNTS);
  const [adminLogs, setAdminLogs] = useState<ActivityLog[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboard | null>(null);
  const [adminOrders, setAdminOrders] = useState<FoodOrder[]>([]);
  const [pendingBookingPayments, setPendingBookingPayments] = useState<Booking[]>([]);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminEditForm, setAdminEditForm] = useState({ username: "", password: "", role: "admin" as AdminAccount["role"] });
  const [salesRange, setSalesRange] = useState<SalesRange>("week");
  const [vendorSalesRange, setVendorSalesRange] = useState<SalesRange>("week");
  const [custFilter,    setCustFilter]    = useState({date:"",hour:"",status:"",ref:""});
  // ── Scan ──
  const [scanInput, setScanInput] = useState("");
  const [scanState, setScanState] = useState<"idle"|"valid"|"invalid"|"checkedIn">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [serverOccupied, setServerOccupied] = useState<Set<string>|null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Derived ──
  const seat    = SEATS.find(s=>s.id===selectedId)??null;
  const meta    = seat?ZONE_META[seat.zone]:null;
  const today   = getDateStr(0);
  const now     = new Date();
  const isTodaySelection = selectedDate === today;
  const rollingWindowOpenNow = rollingBookingWindowOpen(now);
  const rollingBookingClosedToday = isTodaySelection && (!rollingWindowOpenNow || !rollingDurationFits(1, now));
  const needsScheduledTime = selectedDate !== today || seat?.zone === "room";
  const rollingBookingValid = !selectedDate || !seat || !isTodaySelection || !isRollingZone(seat.zone) || (rollingWindowOpenNow && rollingDurationFits(duration, now));
  const showRollingBookingDetails = !selectedDate || !seat || !isTodaySelection || !isRollingZone(seat.zone) || rollingWindowOpenNow;
  const customerSearchHour = !selectedDate
    ? null
    : selectedDate !== today
      ? selectedHour
      : seat?.zone === "room" && selectedHour !== null
        ? selectedHour
        : null;
  const canProceedToPayment = Boolean(seat && selectedDate && (!needsScheduledTime || selectedHour !== null) && rollingBookingValid);
  const showCustomerBookingUI = !selectedDate || selectedDate !== today || !rollingBookingClosedToday;
  const hourlyRate = seat ? getHourlyRate(seat.zone,duration) : 0;
  const subtotal= seat ? getBookingSubtotal(seat.zone, duration) : 0;
  const fee     = 0;
  const grand   = subtotal;
  const pct     = booking?secsLeft/(booking.duration*3600):1;
  const warning = secsLeft>0&&(pct<0.2||secsLeft<=900);
  const customerActiveBooking = useMemo(
    () => findCurrentCustomerBooking(allBookings, customer, new Date()),
    [allBookings, customer]
  );
  const pendingPaymentBookings = useMemo(
    () => [...pendingBookingPayments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()),
    [pendingBookingPayments]
  );
  const pendingFoodPayments = useMemo(
    () => foodPaymentRequests
      .filter(request => request.status === "pending")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [foodPaymentRequests]
  );
  const pendingCheckIns = useMemo(
    () => allBookings.filter(booking => booking.status === "paid" && !booking.checkInAt).length,
    [allBookings]
  );
  const verifyPaymentsCount = pendingPaymentBookings.length + pendingFoodPayments.length;

  function selectionTimeLabel() {
    if (!seat || !selectedDate) return "";
    if (isRollingZone(seat.zone) && isTodaySelection) {
      return `Starts immediately after payment`;
    }
    if (selectedHour === null) return "";
    return `${fmtHour(selectedHour)} – ${fmtHour(selectedHour + duration)} · ${duration}h`;
  }

  function buildConfirmationEmail(b: Booking) {
    const bSeat = seatById(b.seatId);
    const seatLabel = bSeat ? `${ZONE_META[bSeat.zone].label} - ${seatName(bSeat)}` : b.seatId;
    const totalPaid = b.total ?? grand;
    const subject = `Your Quety Study Lounge booking ${b.ref}`;
    const body = [
      `Hi ${b.name},`,
      "",
      "Your booking is confirmed.",
      "",
      `Booking reference / QR code: ${b.ref}`,
      `Seat: ${seatLabel}`,
      `Date: ${bookingDisplayDate(b)}`,
      `Time: ${bookingTimeLabel(b)}`,
      `Duration: ${b.duration}h`,
      `Total paid: ${fmtMoney(totalPaid)}`,
      "",
      "Show this QR code/reference at reception for verification.",
    ].join("\n");
    return {
      subject,
      body,
      mailto: `mailto:${encodeURIComponent(b.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    };
  }

  function prepareConfirmationEmailNotice(b: Booking) {
    const email = buildConfirmationEmail(b);
    setEmailDraftUrl(email.mailto);
    if (b.emailStatus?.ok && b.emailStatus.mode === "resend") {
      setEmailNotice(`Confirmation email sent to ${b.email}.`);
    } else if (b.emailStatus?.ok) {
      setEmailNotice(`Confirmation email sent to ${b.email}.`);
    } else if (b.emailStatus?.error) {
      setEmailNotice(`Booking confirmed. Email could not be sent automatically, but this pass is ready to download.`);
    } else {
      setEmailNotice(`Confirmation email sent to ${b.email}.`);
    }
  }

  function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawQrOnCanvas(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
    const cell = size / QR_SIZE;
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, x - 18, y - 18, size + 36, size + 36, 28);
    ctx.fill();
    ctx.fillStyle = "#1f2933";
    for (let r = 0; r < QR_SIZE; r++) {
      for (let c = 0; c < QR_SIZE; c++) {
        if (qrCellDark(value, r, c)) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  function loadCanvasImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load logo image."));
      image.src = src;
    });
  }

  async function downloadBookingImage(b: Booking) {
    const bSeat = seatById(b.seatId);
    const seatLabel = bSeat ? `${ZONE_META[bSeat.zone].label} - ${seatName(bSeat)}` : b.seatId;
    const totalPaid = b.total ?? grand;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1580;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const logoImage = await loadCanvasImage(TICKET_LOGO_SRC).catch(() => null);

    ctx.fillStyle = "#f7f5ee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, 110, 90, 860, 1410, 48);
    ctx.fill();
    ctx.strokeStyle = "#e5e0d8";
    ctx.lineWidth = 3;
    ctx.stroke();

    if (logoImage) {
      const maxWidth = 780;
      const maxHeight = 285;
      const ratio = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height);
      const drawWidth = logoImage.width * ratio;
      const drawHeight = logoImage.height * ratio;
      ctx.drawImage(logoImage, (canvas.width - drawWidth) / 2, 96, drawWidth, drawHeight);
    }

    ctx.fillStyle = "#0b1830";
    ctx.textAlign = "center";
    ctx.font = "700 54px Georgia, serif";
    ctx.fillText("Booking Confirmation", 540, 398);
    ctx.fillStyle = BRAND_MUTED;
    ctx.font = "500 26px Arial, sans-serif";
    ctx.fillText("Show this pass at reception to check in", 540, 440);

    drawQrOnCanvas(ctx, b.ref, 330, 500, 420);
    ctx.fillStyle = BRAND_NAVY;
    ctx.font = "700 42px Menlo, Consolas, monospace";
    ctx.fillText(b.ref, 540, 1012);
    ctx.fillStyle = BRAND_MUTED;
    ctx.font = "500 22px Arial, sans-serif";
    ctx.fillText("Booking Reference", 540, 1050);

    const rows: [string, string][] = [
      ["Name", b.name],
      ["Seat", seatLabel],
      ["Date", bookingDisplayDate(b)],
      ["Time", bookingTimeLabel(b)],
      ["Duration", `${b.duration}h`],
      ["Total Paid", fmtMoney(totalPaid)],
    ];
    let y = 1120;
    ctx.textAlign = "left";
    for (const [label, value] of rows) {
      ctx.fillStyle = "#8a806f";
      ctx.font = "600 23px Arial, sans-serif";
      ctx.fillText(label, 180, y);
      ctx.fillStyle = BRAND_NAVY;
      ctx.font = "700 25px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(value, 910, y);
      ctx.textAlign = "left";
      y += 54;
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `quety-study-lounge-booking-${b.ref}.png`;
    link.click();
  }

  async function downloadFoodReceiptImage(orders: FoodOrder[], currentBooking: Booking | null) {
    if (orders.length === 0) return;
    const canvas = document.createElement("canvas");
    const rowCount = orders.reduce((sum, order) => sum + order.lines.length, 0);
    canvas.width = 1080;
    canvas.height = Math.max(1480, 980 + orders.length * 150 + rowCount * 56);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const logoImage = await loadCanvasImage(TICKET_LOGO_SRC).catch(() => null);
    const grandTotal = orders.reduce((sum, order) => sum + order.total, 0);

    ctx.fillStyle = "#f7f5ee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, 110, 90, 860, canvas.height - 180, 48);
    ctx.fill();
    ctx.strokeStyle = "#e5e0d8";
    ctx.lineWidth = 3;
    ctx.stroke();

    if (logoImage) {
      const maxWidth = 780;
      const maxHeight = 240;
      const ratio = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height);
      const drawWidth = logoImage.width * ratio;
      const drawHeight = logoImage.height * ratio;
      ctx.drawImage(logoImage, (canvas.width - drawWidth) / 2, 96, drawWidth, drawHeight);
    }

    ctx.fillStyle = "#0b1830";
    ctx.textAlign = "center";
    ctx.font = "700 54px Georgia, serif";
    ctx.fillText("Food Order Receipt", 540, 372);
    ctx.fillStyle = BRAND_MUTED;
    ctx.font = "500 26px Arial, sans-serif";
    ctx.fillText("Keep this receipt for your food and drink collection", 540, 414);

    const summaryRows: [string, string][] = [
      ["Booking Reference", currentBooking?.ref ?? "—"],
      ["Order ID", orders.map(order=>order.id).join(", ")],
      ["Seat", currentBooking?.seatId ?? orders[0]?.seatId ?? "—"],
      ["Customer", currentBooking?.name ?? orders[0]?.customerName ?? "—"],
    ];

    let y = 500;
    ctx.textAlign = "left";
    for (const [label, value] of summaryRows) {
      ctx.fillStyle = "#8a806f";
      ctx.font = "600 22px Arial, sans-serif";
      ctx.fillText(label, 180, y);
      ctx.fillStyle = BRAND_NAVY;
      ctx.font = "700 24px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(value, 910, y);
      ctx.textAlign = "left";
      y += 52;
    }

    y += 24;
    for (const order of orders) {
      ctx.fillStyle = "#f8f5ee";
      roundedRect(ctx, 155, y - 22, 770, 88 + order.lines.length * 46, 28);
      ctx.fill();
      ctx.strokeStyle = "#e5e0d8";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#0b1830";
      ctx.font = "700 26px Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(order.vendorLabel ?? fallbackVendorLabel(order.vendor), 190, y + 18);
      ctx.textAlign = "right";
      ctx.fillText(fmtMoney(order.total), 890, y + 18);

      ctx.fillStyle = "#8a806f";
      ctx.font = "600 19px Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(order.id, 190, y + 50);
      ctx.font = "500 18px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(order.delivery === "table" ? `Deliver to ${order.seatId}` : "Pickup", 890, y + 50);

      let orderY = y + 98;
      for (const line of order.lines) {
        ctx.fillStyle = "#5f6b7a";
        ctx.font = "500 20px Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${line.name} × ${line.qty}`, 205, orderY);
        ctx.textAlign = "right";
        ctx.fillText(fmtMoney(line.price * line.qty), 875, orderY);
        orderY += 42;
      }

      y += 112 + order.lines.length * 46;
    }

    y += 20;
    ctx.strokeStyle = "#e5e0d8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(180, y);
    ctx.lineTo(900, y);
    ctx.stroke();
    y += 56;

    ctx.fillStyle = "#8a806f";
    ctx.font = "600 24px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Total Paid", 180, y);
    ctx.fillStyle = BRAND_NAVY;
    ctx.font = "700 34px Georgia, serif";
    ctx.textAlign = "right";
    ctx.fillText(fmtMoney(grandTotal), 900, y);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `quety-study-lounge-food-receipt-${orders.map(order=>order.id).join("-")}.png`;
    link.click();
  }

  const occupied = useMemo(()=>{
    const futureBlocked = selectedDate && selectedDate !== getDateStr(0)
      ? new Set(SEATS.filter(s=>s.zone!=="room").map(s=>s.id))
      : new Set<string>();
    if (!selectedDate) return futureBlocked;
    const localOccupied = getOccupied(allBookings, selectedDate, duration, customerSearchHour);
    if (serverOccupied) return new Set([...serverOccupied,...localOccupied,...futureBlocked]);
    return new Set([...localOccupied,...futureBlocked]);
  },[allBookings,selectedDate,duration,serverOccupied,customerSearchHour]);

  // Filtered bookings for admin
  const filteredBookings = useMemo(()=>{
    const now = new Date();
    const refQuery = custFilter.ref.trim().toUpperCase();
    return allBookings.filter(b=>{
      if (custFilter.date&&b.date!==custFilter.date) return false;
      if (custFilter.hour&&b.startHour!==parseInt(custFilter.hour)) return false;
      if (custFilter.status&&bookingStatusAt(b, now)!==custFilter.status) return false;
      if (refQuery && !b.ref.toUpperCase().includes(refQuery)) return false;
      return true;
    }).sort((a,b)=>compareAdminBookingOrder(a,b,now));
  },[allBookings,custFilter]);

  const filteredSalesBookings = useMemo(()=>
    allBookings.filter(b=>["paid","active","expired","completed"].includes(b.status) && inSalesRange(b.paidAt, salesRange)),
  [allBookings, salesRange]);

  const recentPaidBookings = useMemo(()=>
    allBookings
      .filter(b=>b.status==="paid" && bookingEndDate(b).getTime() > Date.now())
      .sort((a,b)=>bookingStartDate(a).getTime()-bookingStartDate(b).getTime())
      .slice(0,6),
  [allBookings]);

  const seatCategoryStats = useMemo(() => {
    const base = {
      focus: { bookings: 0, revenue: 0 },
      discussion: { bookings: 0, revenue: 0 },
    };
    for (const bookingItem of filteredSalesBookings) {
      const zone = seatById(bookingItem.seatId)?.zone;
      if (zone === "focus" || zone === "discussion") {
        base[zone].bookings += 1;
        base[zone].revenue += bookingItem.total ?? 0;
      }
    }
    return base;
  }, [filteredSalesBookings]);

  const filteredVendorOrders = useMemo(()=>
    adminOrders.filter(order=>inSalesRange(order.placedAt, vendorSalesRange)),
  [adminOrders, vendorSalesRange]);

  const adminVendorCompanies = useMemo(() => {
    const map = new Map<string, string>();
    adminDashboard?.vendorTotals.forEach(company => map.set(company.vendor, company.label));
    vendorCompanies.forEach(company => map.set(company.id, company.label));
    adminOrders.forEach(order => map.set(order.vendor, order.vendorLabel ?? fallbackVendorLabel(order.vendor)));
    return [...map.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [adminDashboard, vendorCompanies, adminOrders]);

  const salesBreakdown = useMemo(()=>{
    const bucketMap = new Map<string, { bookingSales: number; vendorSales: number }>();
    for (const bookingItem of filteredSalesBookings) {
      const key = salesBucketKey(bookingItem.paidAt, salesRange);
      const bucket = bucketMap.get(key) ?? { bookingSales: 0, vendorSales: 0 };
      bucket.bookingSales += bookingItem.total ?? 0;
      bucketMap.set(key, bucket);
    }
    for (const order of adminOrders.filter(item=>inSalesRange(item.placedAt, salesRange))) {
      const key = salesBucketKey(order.placedAt, salesRange);
      const bucket = bucketMap.get(key) ?? { bookingSales: 0, vendorSales: 0 };
      bucket.vendorSales += order.total;
      bucketMap.set(key, bucket);
    }
    return [...bucketMap.entries()]
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([key, value])=>({
        key,
        label: salesBucketLabel(key, salesRange),
        bookingSales: value.bookingSales,
        vendorSales: value.vendorSales,
        totalSales: value.bookingSales + value.vendorSales,
      }));
  },[filteredSalesBookings, adminOrders, salesRange]);

  const vendorSalesBreakdown = useMemo(()=>{
    const bucketMap = new Map<string, { orders: number; totals: Record<string, number> }>();
    for (const order of filteredVendorOrders) {
      const key = salesBucketKey(order.placedAt, vendorSalesRange);
      const bucket = bucketMap.get(key) ?? { orders: 0, totals: {} };
      bucket.orders += 1;
      bucket.totals[order.vendor] = (bucket.totals[order.vendor] ?? 0) + order.total;
      bucketMap.set(key, bucket);
    }
    return [...bucketMap.entries()]
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([key, value])=>({
        key,
        label: salesBucketLabel(key, vendorSalesRange),
        orders: value.orders,
        totals: value.totals,
        totalSales: Object.values(value.totals).reduce((sum, amount)=>sum + amount, 0),
      }));
  },[filteredVendorOrders, vendorSalesRange]);

  const filteredBookingSalesTotal = filteredSalesBookings.reduce((sum, bookingItem)=>sum + (bookingItem.total ?? 0), 0);
  const filteredRevenueVendorSales = adminOrders
    .filter(order=>inSalesRange(order.placedAt, salesRange))
    .reduce((sum, order)=>sum + order.total, 0);
  const filteredVendorSalesTotal = filteredVendorOrders.reduce((sum, order)=>sum + order.total, 0);
  const filteredVendorOrderCount = filteredVendorOrders.length;
  const filteredVendorCompanyTotals = useMemo(() => adminVendorCompanies.map(company => ({
    ...company,
    orders: filteredVendorOrders.filter(order=>order.vendor===company.id).length,
    sales: filteredVendorOrders.filter(order=>order.vendor===company.id).reduce((sum, order)=>sum + order.total, 0),
  })), [adminVendorCompanies, filteredVendorOrders]);
  const focusSeatSnapshot = useMemo(
    () => liveSeatStatus(allBookings, FOCUS_SEATS, new Date()),
    [allBookings]
  );
  const discussionSeatSnapshot = useMemo(
    () => liveSeatStatus(allBookings, DISCUSSION_SEATS, new Date(), { mapWholeRoomToDiscussion: true }),
    [allBookings]
  );
  const focusSeatEntries = useMemo(
    () => liveSeatEntries(allBookings, FOCUS_SEATS, new Date()),
    [allBookings]
  );
  const discussionSeatEntries = useMemo(
    () => liveSeatEntries(allBookings, DISCUSSION_SEATS, new Date(), { mapWholeRoomToDiscussion: true }),
    [allBookings]
  );
  const focusOccupiedSet = useMemo(
    () => new Set(focusSeatEntries.filter(entry => entry.booking).map(entry => entry.seat.id)),
    [focusSeatEntries]
  );
  const discussionOccupiedSet = useMemo(() => {
    const occupied = new Set(discussionSeatEntries.filter(entry => entry.booking).map(entry => entry.seat.id));
    if (discussionSeatEntries.some(entry => entry.blockedByRoom)) occupied.add(ROOM_SEAT.id);
    return occupied;
  }, [discussionSeatEntries]);
  const adminVendorItemSales = useMemo(() => {
    const map = new Map<string, { vendor: string; vendorLabel: string; itemName: string; qty: number; sales: number }>();
    for (const order of filteredVendorOrders) {
      for (const line of order.lines) {
        const key = `${order.vendor}:${line.itemId}`;
        const bucket = map.get(key) ?? {
          vendor: order.vendor,
          vendorLabel: order.vendorLabel ?? fallbackVendorLabel(order.vendor),
          itemName: line.name,
          qty: 0,
          sales: 0,
        };
        bucket.qty += line.qty;
        bucket.sales += line.price * line.qty;
        map.set(key, bucket);
      }
    }
    return [...map.values()].sort((a, b) => (b.sales - a.sales) || (b.qty - a.qty) || a.itemName.localeCompare(b.itemName));
  }, [filteredVendorOrders]);

  const syncVendorOpenState = useCallback((vendorId: string, isOpen: boolean) => {
    setVendorCompanies(prev => prev.map(company => company.id === vendorId ? { ...company, isOpen } : company));
    setMenuItems(prev => prev.map(item => item.vendor === vendorId ? { ...item, vendorOpen: isOpen } : item));
  }, []);

  useEffect(()=>{
    Promise.all([
      apiFetch<any[]>("/api/menu"),
      apiFetch<VendorCompany[]>("/api/vendors"),
    ]).then(([items, vendors]) => {
      setMenuItems(items.map(normalizeFoodItem));
      setVendorCompanies(vendors);
    }).catch(()=>{});
    return ()=>{timerRef.current&&clearInterval(timerRef.current)};
  },[]);

  useEffect(() => {
    const syncPortalView = () => {
      const nextView = portalViewFromLocation(Boolean(adminAuth), Boolean(vendorAuth));
      if (!nextView) return;
      setView(current => current === nextView ? current : nextView);
    };
    syncPortalView();
    window.addEventListener("hashchange", syncPortalView);
    window.addEventListener("popstate", syncPortalView);
    return () => {
      window.removeEventListener("hashchange", syncPortalView);
      window.removeEventListener("popstate", syncPortalView);
    };
  }, [adminAuth, vendorAuth]);

  useEffect(() => {
    const nextHash =
      view === "landingPage"
        ? "#landing-page"
        :
      view === "admin" || view === "adminLogin" || view === "adminSignup"
        ? "#admin"
        : view === "vendor" || view === "vendorLogin"
          ? "#vendor"
          : "";
    if (window.location.hash === nextHash) return;
    const url = new URL(window.location.href);
    url.hash = nextHash;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [view]);

  useEffect(()=>{
    if(view!=="admin"||!adminToken||!adminAuth) return;
    let cancelled = false;
    const refresh = async () => {
      const tasks: Promise<unknown>[] = [
        loadAdminBookings(adminToken),
        loadPendingBookingPayments(adminToken),
        loadFoodPaymentRequests(adminToken),
      ];
      if (adminAuth.role === "superadmin") {
        tasks.push(loadSuperadminData(adminToken));
      }
      const results = await Promise.allSettled(tasks);
      if (cancelled) return;
      const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed) {
        console.error("Admin refresh failed:", failed.reason);
      }
    };
    refresh();
    const id = window.setInterval(refresh, 5000);
    return ()=>{ cancelled = true; window.clearInterval(id); };
  },[view, adminToken, adminAuth]);

  useEffect(()=>{
    if(view!=="vendor"||!vendorToken||!vendorAuth) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        await loadVendorData(vendorToken, vendorAuth.role);
      } catch {
        if (cancelled) return;
      }
    };
    refresh();
    const id = window.setInterval(refresh, 30000);
    return ()=>{ cancelled = true; window.clearInterval(id); };
  },[view, vendorToken, vendorAuth]);

  useEffect(() => {
    if (view !== "payPending" || !booking || booking.status !== "payment_pending") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const latest = normalizeBooking(await apiFetch<any>(`/api/bookings/${booking.ref}`));
        if (cancelled) return;
        setBooking(latest);
        setAllBookings(prev => prev.some(item => item.ref === latest.ref)
          ? prev.map(item => item.ref === latest.ref ? latest : item)
          : [latest, ...prev]);
        if (latest.status === "paid" || latest.status === "active" || latest.status === "completed") {
          prepareConfirmationEmailNotice(latest);
          setView("qr");
          return;
        }
        if (latest.status === "cancelled") {
          window.alert("Payment was rejected. Please try again.");
          setBooking(null);
          setSelectedId(null);
          setView("book");
          return;
        }
        if (latest.status === "expired") {
          window.alert("This booking has expired.");
          setBooking(latest);
          setSelectedId(null);
          setView("expired");
        }
      } catch {}
    };
    void poll();
    const id = window.setInterval(() => { void poll(); }, 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [view, booking?.ref, booking?.status]);

  useEffect(() => {
    if (view !== "food" || foodView !== "payment" || !pendingFoodPayment || pendingFoodPayment.status !== "pending") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const latest = normalizeFoodPaymentRequest(await apiFetch<any>(`/api/food-payment-requests/${pendingFoodPayment.id}`));
        if (cancelled) return;
        setPendingFoodPayment(latest);
        setFoodPaymentRequests(prev => prev.some(item => item.id === latest.id)
          ? prev.map(item => item.id === latest.id ? latest : item)
          : [latest, ...prev]);
        if (latest.status === "approved") {
          setFoodOrders(prev => {
            const merged = [
              ...latest.orders.filter(order => !prev.some(existing => existing.id === order.id)),
              ...prev,
            ];
            setLatestFoodReceipt(
              merged
                .filter(order => order.bookingRef === latest.bookingRef)
                .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())
            );
            return merged;
          });
          setCart([]);
          setFoodView("receipt");
          return;
        }
        if (latest.status === "rejected") {
          window.alert("Food payment was rejected. Please try again.");
          setPendingFoodPayment(null);
          setFoodView("checkout");
        }
      } catch {}
    };
    void poll();
    const id = window.setInterval(() => { void poll(); }, 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [view, foodView, pendingFoodPayment?.id, pendingFoodPayment?.status]);

  useEffect(() => {
    if (!booking) {
      setLatestFoodReceipt([]);
      return;
    }
    setLatestFoodReceipt(
      foodOrders
        .filter(order => order.bookingRef === booking.ref)
        .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())
    );
  }, [foodOrders, booking]);

  useEffect(()=>{
    if (!selectedDate) { setServerOccupied(null); return; }
    if (selectedDate !== today && selectedHour === null) { setServerOccupied(null); return; }
    if (selectedDate === today && seat?.zone === "room" && selectedHour === null) { setServerOccupied(null); return; }
    const params = new URLSearchParams({ date: selectedDate, duration: String(duration) });
    if (customerSearchHour !== null) params.set("startHour", String(customerSearchHour));
    apiFetch<any[]>(`/api/seats?${params.toString()}`)
      .then(seats=>setServerOccupied(new Set(seats.filter(s=>s.occupied).map(s=>s.id))))
      .catch(()=>setServerOccupied(null));
  },[selectedDate,selectedHour,duration,allBookings.length,seat?.zone,customerSearchHour,today]);

  const startTimer = useCallback((b:Booking)=>{
    const updated={...b,status:"active" as const,checkInAt:new Date()};
    setBooking(updated);
    setAllBookings(prev=>prev.some(x=>x.ref===b.ref)?prev.map(x=>x.ref===b.ref?updated:x):[updated,...prev]);
    setSecsLeft(sessionSecsLeft(updated));
    setView("active");
    timerRef.current=setInterval(()=>{
      setSecsLeft(prev=>{if(prev<=1){clearInterval(timerRef.current!);setView("expired");return 0;}return prev-1;});
    },1000);
  },[]);

  async function handlePay() {
    if(!seat||!customer||!selectedDate||(needsScheduledTime&&selectedHour===null)||!rollingBookingValid)return;
    setPaymentBusy(true);
    try {
      const payload = { seatId:seat.id, date:selectedDate, duration, name:customer.name, email:customer.email, phone:customer.phone, ...(selectedHour!==null ? { startHour:selectedHour } : {}) };
      const b=normalizeBooking(await apiFetch<any>("/api/bookings", {
        method:"POST",
        body:JSON.stringify(payload),
      }));
      setBooking(b);
      setAllBookings(prev=>[...prev.filter(x=>x.ref!==b.ref),b]);
      setServerOccupied(null);
      setView("payPending");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "We could not create this payment request. Please try again.");
    } finally {
      setPaymentBusy(false);
    }
  }

  function handleCartChange(item:FoodItem,delta:number) {
    setCart(prev=>{
      const idx=prev.findIndex(c=>c.item.id===item.id);
      if(idx>=0){
        const newQty=prev[idx].qty+delta;
        if(newQty<=0)return prev.filter((_,i)=>i!==idx);
        return prev.map((c,i)=>i===idx?{...c,qty:newQty}:c);
      }
      if(delta>0)return[...prev,{item,qty:1}];
      return prev;
    });
  }

  async function handleFoodOrder(delivery:"table"|"pickup") {
    if(!booking||cart.length===0)return;
    try {
      const request=normalizeFoodPaymentRequest(await apiFetch<any>("/api/food-payment-requests", {
        method:"POST",
        body:JSON.stringify({bookingRef:booking.ref,delivery,items:cart.map(c=>({itemId:c.item.id,qty:c.qty}))}),
      }));
      setPendingFoodPayment(request);
      setFoodPaymentRequests(prev=>[request,...prev.filter(item=>item.id!==request.id)]);
      setFoodView("payment");
      setView("food");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not place food order.");
    }
  }

  async function loadSuperadminData(token: string) {
    const [accounts, logs, dashboard, orders] = await Promise.all([
      apiFetch<any[]>("/api/admin/accounts", { headers:bearer(token) }),
      apiFetch<any[]>("/api/admin/logs", { headers:bearer(token) }),
      apiFetch<AdminDashboard>("/api/admin/dashboard", { headers:bearer(token) }),
      apiFetch<any[]>("/api/admin/orders", { headers:bearer(token) }),
    ]);
    setAdminAccounts(accounts.map(normalizeAdminAccount));
    setAdminLogs(logs.map(normalizeActivityLog));
    setAdminDashboard(dashboard);
    setAdminOrders(orders.map(normalizeFoodOrder));
  }

  async function loadAdminBookings(token: string) {
    const bookings=await apiFetch<any[]>("/api/admin/bookings", { headers:bearer(token) });
    setAllBookings(bookings.map(normalizeBooking));
  }

  async function loadPendingBookingPayments(token: string) {
    const bookings=await apiFetch<any[]>("/api/admin/payments/bookings", { headers:bearer(token) });
    setPendingBookingPayments(bookings.map(normalizeBooking));
  }

  async function loadFoodPaymentRequests(token: string) {
    const requests = await apiFetch<any[]>("/api/admin/food-payment-requests", { headers: bearer(token) });
    setFoodPaymentRequests(requests.map(normalizeFoodPaymentRequest));
  }

  async function loadVendorData(token: string, role: VendorSession["role"]) {
    const requests: Promise<any>[] = [
      apiFetch<any[]>("/api/menu"),
      apiFetch<VendorCompany[]>("/api/vendors"),
      apiFetch<any[]>("/api/vendors/orders", { headers:bearer(token) }),
      apiFetch<VendorDashboard>("/api/vendors/dashboard", { headers:bearer(token) }),
    ];
    if (role === "superadmin") {
      requests.push(apiFetch<any[]>("/api/vendors/accounts", { headers:bearer(token) }));
    }
    const [menu, vendors, orders, dashboard, accounts] = await Promise.all(requests);
    setMenuItems((menu as any[]).map(normalizeFoodItem));
    setVendorCompanies(vendors as VendorCompany[]);
    setFoodOrders((orders as any[]).map(normalizeFoodOrder));
    setVendorDashboard(dashboard as VendorDashboard);
    if (role === "superadmin") {
      setVendorAccounts((accounts as any[]).map(normalizeVendorAccount));
    } else {
      setVendorAccounts([]);
    }
  }

  async function handleScan() {
    const code=scanInput.trim().toUpperCase();
    if(!code)return;
    setScanMessage("");
    let found=allBookings.find(b=>b.ref===code);
    try {
      found=normalizeBooking(await apiFetch<any>(`/api/bookings/${code}`));
      setAllBookings(prev=>[found!,...prev.filter(b=>b.ref!==code)]);
    } catch {
      if(!found){setScanState("invalid");setScanMessage("No valid booking found for this reference.");return;}
    }
    if(!found || ["cancelled","completed"].includes(found.status)){setScanState("invalid");setScanMessage("No valid booking found for this reference.");return;}
    if(found.status==="payment_pending"){setScanState("invalid");setScanMessage("Payment has not been verified for this booking yet.");return;}
    if(found.status==="active" || found.checkInAt){setScanState("checkedIn");setScanMessage("This booking has already been checked in and cannot be used again.");return;}
    if(found.status==="expired" || bookingEndDate(found).getTime() <= Date.now()){setScanState("invalid");setScanMessage("This booking is expired.");return;}
    if(bookingStartDate(found).getTime() > Date.now()){setScanState("invalid");setScanMessage("Check-in is only allowed once the booking date and time has started.");return;}
    setScanState("valid");
  }

  async function handleCheckIn() {
    const code=scanInput.trim().toUpperCase();
    if(!adminToken)return;
    try {
      const found=normalizeBooking(await apiFetch<any>(`/api/bookings/${code}/check-in`, {
        method:"POST",
        headers:bearer(adminToken),
      }));
      setAllBookings(prev=>prev.some(item=>item.ref===found.ref)?prev.map(item=>item.ref===found.ref?found:item):[found,...prev]);
      if (booking?.ref === found.ref) setBooking(found);
      if (adminAuth?.role === "superadmin") await loadSuperadminData(adminToken);
      setScanInput("");setScanState("idle");setScanMessage("");
      setAdminTab("customers");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check-in could not be completed.";
      if (message.toLowerCase().includes("already been checked in") || message.toLowerCase().includes("cannot be used again")) {
        setScanState("checkedIn");
      } else {
        setScanState("invalid");
      }
      setScanMessage(message);
    }
  }

  async function handleAdminLogin(username:string,password:string) {
    try {
      const result=await apiFetch<{token:string;account:any}>("/api/admin/login", {
        method:"POST",
        body:JSON.stringify({username,password}),
      });
      const account=normalizeAdminAccount(result.account);
      setAdminTab("payments");
      setAdminToken(result.token);
      setAdminAuth(account);
      setView("admin");
      await loadAdminBookings(result.token);
      await loadPendingBookingPayments(result.token);
      await loadFoodPaymentRequests(result.token);
      if(account.role==="superadmin"){
        await loadSuperadminData(result.token);
      } else {
        setAdminLogs([]);
        setAdminDashboard(null);
        setAdminOrders([]);
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not sign in.";
    }
  }

  async function handleAdminCreate(input:{username:string;password:string;role:"superadmin"|"admin"}) {
    if(!adminToken)return false;
    try {
      const account=normalizeAdminAccount(await apiFetch<any>("/api/admin/accounts", {
        method:"POST",
        headers:bearer(adminToken),
        body:JSON.stringify(input),
      }));
      setAdminAccounts(prev=>[...prev,account]);
      if (adminToken) await loadSuperadminData(adminToken);
      setView("admin");
      setAdminTab("accounts");
      return true;
    } catch {
      return false;
    }
  }

  async function handleCancelBooking(ref: string) {
    if (!adminToken) return;
    try {
      const updated = normalizeBooking(await apiFetch<any>(`/api/admin/bookings/${ref}/cancel`, {
        method: "POST",
        headers: bearer(adminToken),
      }));
      setAllBookings(prev=>prev.map(item=>item.ref===ref?updated:item));
      setPendingBookingPayments(prev=>prev.map(item=>item.ref===ref?updated:item).filter(item=>item.status==="payment_pending"));
      if (booking?.ref === ref) setBooking(updated);
      if (adminAuth?.role === "superadmin") await loadSuperadminData(adminToken);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not cancel this booking.");
    }
  }

  async function handleVerifyPayment(ref: string) {
    if (!adminToken) return;
    try {
      const updated = normalizeBooking(await apiFetch<any>(`/api/admin/bookings/${ref}/verify-payment`, {
        method: "POST",
        headers: bearer(adminToken),
      }));
      setAllBookings(prev => prev.map(item => item.ref === ref ? updated : item));
      setPendingBookingPayments(prev=>prev.map(item=>item.ref===ref?updated:item).filter(item=>item.status==="payment_pending"));
      if (booking?.ref === ref) {
        setBooking(updated);
      }
      if (adminAuth?.role === "superadmin") await loadSuperadminData(adminToken);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Payment could not be verified.");
    }
  }

  async function handleRejectPayment(ref: string) {
    if (!adminToken) return;
    try {
      const updated = normalizeBooking(await apiFetch<any>(`/api/admin/bookings/${ref}/reject-payment`, {
        method: "POST",
        headers: bearer(adminToken),
      }));
      setAllBookings(prev => prev.map(item => item.ref === ref ? updated : item));
      setPendingBookingPayments(prev=>prev.map(item=>item.ref===ref?updated:item).filter(item=>item.status==="payment_pending"));
      if (booking?.ref === ref) {
        setBooking(updated);
      }
      if (adminAuth?.role === "superadmin") await loadSuperadminData(adminToken);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Payment could not be rejected.");
    }
  }

  async function handleVerifyFoodPayment(requestId: string) {
    if (!adminToken) return;
    try {
      const updated = normalizeFoodPaymentRequest(await apiFetch<any>(`/api/admin/food-payment-requests/${requestId}/verify`, {
        method: "POST",
        headers: bearer(adminToken),
      }));
      setFoodPaymentRequests(prev => prev.map(item => item.id === requestId ? updated : item));
      setFoodOrders(prev => [
        ...updated.orders.filter(order => !prev.some(existing => existing.id === order.id)),
        ...prev,
      ]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Food payment could not be verified.");
    }
  }

  async function handleRejectFoodPayment(requestId: string) {
    if (!adminToken) return;
    try {
      const updated = normalizeFoodPaymentRequest(await apiFetch<any>(`/api/admin/food-payment-requests/${requestId}/reject`, {
        method: "POST",
        headers: bearer(adminToken),
      }));
      setFoodPaymentRequests(prev => prev.map(item => item.id === requestId ? updated : item));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Food payment could not be rejected.");
    }
  }

  async function handleAdminUpdate(accountId: string) {
    if (!adminToken) return false;
    try {
      const updated = normalizeAdminAccount(await apiFetch<any>(`/api/admin/accounts/${accountId}`, {
        method: "PATCH",
        headers: bearer(adminToken),
        body: JSON.stringify({
          username: adminEditForm.username,
          password: adminEditForm.password,
          role: adminEditForm.role,
        }),
      }));
      await loadSuperadminData(adminToken);
      if (adminAuth?.id === accountId) {
        setAdminAuth(updated);
      }
      setEditingAdminId(null);
      setAdminEditForm({ username: "", password: "", role: "admin" });
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not update this account.");
      return false;
    }
  }

  async function handleVendorLogin(username:string,password:string) {
    try {
      const result=await apiFetch<{token:string;account:any}>("/api/vendors/login", {
        method:"POST",
        body:JSON.stringify({username,password}),
      });
      const account = normalizeVendorAccount(result.account);
      setVendorToken(result.token);
      setVendorAuth({
        id: account.id,
        username: account.username,
        role: account.role,
        vendorId: account.vendorId,
        vendorLabel: account.vendorLabel,
      });
      setView("vendor");
      await loadVendorData(result.token, account.role);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not sign in.";
    }
  }

  async function handleVendorAccountCreate(input:{username:string;password:string;role:"superadmin"|"vendor";vendorId:VendorType|null}) {
    if(!vendorToken) return false;
    try {
      await apiFetch<any>("/api/vendors/accounts", {
        method:"POST",
        headers:bearer(vendorToken),
        body:JSON.stringify(input),
      });
      await loadVendorData(vendorToken, "superadmin");
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not create this vendor account.");
      return false;
    }
  }

  async function handleVendorAccountUpdate(accountId:string, input:{username:string;password:string;role:"superadmin"|"vendor";vendorId:VendorType|null}) {
    if(!vendorToken) return false;
    try {
      await apiFetch<any>(`/api/vendors/accounts/${accountId}`, {
        method:"PATCH",
        headers:bearer(vendorToken),
        body:JSON.stringify(input),
      });
      await loadVendorData(vendorToken, "superadmin");
      if (vendorAuth?.id === accountId) {
        setVendorAuth({
          ...vendorAuth,
          username: input.username,
          role: input.role,
          vendorId: input.role === "superadmin" ? null : input.vendorId,
          vendorLabel: input.role === "superadmin" ? null : vendorCompanies.find(company=>company.id===input.vendorId)?.label ?? null,
        });
      }
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not update this vendor account.");
      return false;
    }
  }

  async function handleVendorAccountDelete(accountId:string) {
    if(!vendorToken) return;
    try {
      await apiFetch(`/api/vendors/accounts/${accountId}`, {
        method:"DELETE",
        headers:bearer(vendorToken),
      });
      await loadVendorData(vendorToken, "superadmin");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not delete this vendor account.");
    }
  }

  async function handleVendorCompanyCreate(label: string) {
    if (!vendorToken) return false;
    try {
      try {
        await apiFetch<VendorCompany>("/api/vendors", {
          method: "POST",
          headers: bearer(vendorToken),
          body: JSON.stringify({ label }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (!message.includes("route not found")) throw error;
        await apiFetch<VendorCompany>("/api/vendors/company", {
          method: "POST",
          headers: bearer(vendorToken),
          body: JSON.stringify({ label }),
        });
      }
      await loadVendorData(vendorToken, vendorAuth?.role ?? "superadmin");
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not add this vendor company.");
      return false;
    }
  }

  async function handleVendorCompanyRename(vendorId: string, label: string) {
    if (!vendorToken) return false;
    try {
      const updated = await apiFetch<VendorCompany>(`/api/vendors/${vendorId}`, {
        method: "PATCH",
        headers: bearer(vendorToken),
        body: JSON.stringify({ label }),
      });
      await loadVendorData(vendorToken, vendorAuth?.role ?? "superadmin");
      if (vendorAuth?.vendorId === vendorId) {
        setVendorAuth({ ...vendorAuth, vendorLabel: updated.label });
      }
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not rename this vendor company.");
      return false;
    }
  }

  async function handleVendorShopToggle(vendorId: string, isOpen: boolean) {
    if (!vendorToken) return;
    const previous = vendorCompanies.find(company => company.id === vendorId)?.isOpen ?? true;
    syncVendorOpenState(vendorId, isOpen);
    try {
      const updated = await apiFetch<VendorCompany>(`/api/vendors/${vendorId}/status`, {
        method: "PATCH",
        headers: bearer(vendorToken),
        body: JSON.stringify({ isOpen }),
      });
      syncVendorOpenState(updated.id, updated.isOpen);
    } catch (error) {
      syncVendorOpenState(vendorId, previous);
      window.alert(error instanceof Error ? error.message : "Could not update this shop status.");
    }
  }

  async function handleAdminShopToggle(vendorId: string, isOpen: boolean) {
    if (!adminToken) return;
    const previous = vendorCompanies.find(company => company.id === vendorId)?.isOpen ?? true;
    syncVendorOpenState(vendorId, isOpen);
    try {
      const updated = await apiFetch<VendorCompany>(`/api/admin/vendors/${vendorId}/status`, {
        method: "PATCH",
        headers: bearer(adminToken),
        body: JSON.stringify({ isOpen }),
      });
      syncVendorOpenState(updated.id, updated.isOpen);
      if (adminAuth?.role === "superadmin") await loadSuperadminData(adminToken);
    } catch (error) {
      syncVendorOpenState(vendorId, previous);
      window.alert(error instanceof Error ? error.message : "Could not update this shop status.");
    }
  }

  async function handleVendorMenuUpdate(itemId:string, input:{name:string;category:string;description:string;price:number;imageUrl:string;available:boolean}) {
    if(!vendorToken) return false;
    try {
      const updated = normalizeFoodItem(await apiFetch<any>(`/api/vendors/menu/${itemId}`, {
        method:"PATCH",
        headers:bearer(vendorToken),
        body:JSON.stringify(input),
      }));
      setMenuItems(prev=>prev.map(item=>item.id===itemId?updated:item));
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not update this menu item.");
      return false;
    }
  }

  function adminBack() {
    if(booking?.status==="active")return setView("active");
    if(booking?.status==="paid")return setView("qr");
    if(booking?.status==="payment_pending")return setView("payPending");
    return setView(customer?"book":"landing");
  }

  const adminTabs: { key: AdminTab; label: string }[] = adminAuth?.role === "superadmin"
    ? [
        { key: "payments", label: `Verify Payments (${verifyPaymentsCount})` },
        { key: "scan", label: `Check-in (${pendingCheckIns})` },
        { key: "customers", label: "Bookings" },
        { key: "availability", label: "Availability" },
        { key: "dashboard", label: "Revenue" },
        { key: "orders", label: "Vendor Orders" },
        { key: "logs", label: "Activity Log" },
        { key: "accounts", label: "Accounts" },
      ]
    : [
        { key: "payments", label: `Verify Payments (${verifyPaymentsCount})` },
        { key: "scan", label: `Check-in (${pendingCheckIns})` },
        { key: "customers", label: "Bookings" },
        { key: "availability", label: "Availability" },
      ];

  // ── VIEWS ──────────────────────────────────────────────────────────────────

  if(view==="landingPage") return <LandingShowcasePage onBookNow={()=>setView("landing")}/>;
  if(view==="landing") return <LandingPage onSignUp={c=>{setCustomer(c);setSelectedDate(getDateStr(0));setView("book");}}/>;
  if(view==="adminLogin") return <AdminLoginPage onLogin={handleAdminLogin} onBack={()=>setView(customer?"book":"landing")}/>;
  if(view==="adminSignup") return <AdminSignupPage onCreated={handleAdminCreate} onBack={()=>setView(adminAuth?"admin":"adminLogin")}/>;
  if(view==="vendorLogin") return <VendorLoginPage onLogin={handleVendorLogin} onBack={()=>setView("landing")}/>;

  // ── VENDOR ──────────────────────────────────────────────────────────────────
  if(view==="vendor"&&vendorAuth) return (
    <VendorPortal session={vendorAuth} vendorCompanies={vendorCompanies} vendorAccounts={vendorAccounts} vendorDashboard={vendorDashboard} menuItems={menuItems} foodOrders={foodOrders}
      onMenuChange={async(id,avail)=>{
        setMenuItems(prev=>prev.map(i=>i.id===id?{...i,available:avail}:i));
        if(!vendorToken)return;
        try {
          const item=normalizeFoodItem(await apiFetch<any>(`/api/vendors/menu/${id}`, {method:"PATCH",headers:bearer(vendorToken),body:JSON.stringify({available:avail})}));
          setMenuItems(prev=>prev.map(i=>i.id===id?item:i));
        } catch {
          setMenuItems(prev=>prev.map(i=>i.id===id?{...i,available:!avail}:i));
        }
      }}
      onMenuUpdate={handleVendorMenuUpdate}
      onOrderComplete={async id=>{
        setFoodOrders(prev=>prev.map(o=>o.id===id?{...o,status:"completed"}:o));
        if(!vendorToken)return;
        try {
          const order=normalizeFoodOrder(await apiFetch<any>(`/api/vendors/orders/${id}`, {method:"PATCH",headers:bearer(vendorToken),body:JSON.stringify({status:"completed"})}));
          setFoodOrders(prev=>prev.map(o=>o.id===id?order:o));
        } catch {}
      }}
      onAddItem={async item=>{
        if(!vendorToken){setMenuItems(prev=>[...prev,{...item,id:`custom-${Date.now()}`}]);return;}
        try {
          const created=normalizeFoodItem(await apiFetch<any>("/api/vendors/menu", {method:"POST",headers:bearer(vendorToken),body:JSON.stringify(item)}));
          setMenuItems(prev=>[...prev,created]);
        } catch {}
      }}
      onCreateAccount={handleVendorAccountCreate}
      onUpdateAccount={handleVendorAccountUpdate}
      onDeleteAccount={handleVendorAccountDelete}
      onAddCompany={handleVendorCompanyCreate}
      onRenameCompany={handleVendorCompanyRename}
      onToggleVendorOpen={handleVendorShopToggle}
      onLogout={()=>{setVendorAuth(null);setVendorToken(null);setVendorAccounts([]);setVendorDashboard(null);setView("vendorLogin");}}
    />
  );

  // ── FOOD ─────────────────────────────────────────────────────────────────────
  if(view==="food") {
    if(foodView==="checkout") return (
      <FoodCheckoutPage booking={booking} cart={cart}
        onConfirm={delivery=>{
          setFoodDeliveryChoice(delivery);
          setPendingFoodPayment(null);
          setFoodView("payment");
        }}
        onBack={()=>setFoodView("menu")}
      />
    );
    if(foodView==="payment") return (
      <FoodPaymentPage
        booking={booking}
        cart={cart}
        request={pendingFoodPayment}
        delivery={foodDeliveryChoice}
        onPay={async()=>{
          if (!foodDeliveryChoice) return;
          await handleFoodOrder(foodDeliveryChoice);
        }}
        onBack={()=>{
          setPendingFoodPayment(null);
          setFoodView("checkout");
        }}
      />
    );
    if(foodView==="receipt") return (
      <FoodReceiptPage
        booking={booking}
        orders={latestFoodReceipt}
        onDownload={()=>void downloadFoodReceiptImage(latestFoodReceipt, booking)}
        onBack={()=>{
          setFoodView("menu");
          setView(booking?.status==="active"?"active":"qr");
        }}
      />
    );
    return (
      <FoodMenuPage booking={booking} menuItems={menuItems} vendorCompanies={vendorCompanies} cart={cart}
        onCartChange={handleCartChange}
        onCheckout={()=>setFoodView("checkout")}
        onBack={()=>setView(booking?.status==="active"?"active":"qr")}
      />
    );
  }

  // ── BOOK ─────────────────────────────────────────────────────────────────────
  if(view==="book") return (
    <div className="portal-theme min-h-screen h-[100dvh] bg-background flex flex-col overflow-hidden">
      <AppHeader
        customer={customer}
        hasActiveSession={Boolean(customerActiveBooking)}
        onOpenActiveSession={()=>{
          if (!customerActiveBooking) return;
          setBooking(customerActiveBooking);
          setView("qr");
        }}
        onBack={()=>setView("landing")}
      />
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="px-4 pt-4 pb-3 md:px-6 md:pt-6 md:pb-0 shrink-0">
          <h1 className="font-serif text-2xl mb-0.5">Choose Your Seat</h1>
        </div>

        <div className="hidden md:flex flex-1 min-h-0">
          <div className="flex-1 overflow-auto p-6">
            {selectedDate && !showCustomerBookingUI ? (
              <div className="flex items-center justify-center h-64 rounded-2xl border border-red-200 bg-red-50/60">
                <p className="text-sm font-medium text-red-700">Quety Study Lounge is closed for now, come again tomorrow.</p>
              </div>
            ) : selectedDate ? (
              <>
                <FloorMap occupied={occupied} selectedId={selectedId} onSelect={id=>{if(!occupied.has(id))setSelectedId(id);}} duration={duration} roomOnly={selectedDate!==getDateStr(0)}/>
                <div className="flex items-center gap-5 mt-5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-[#ebe8e1] border border-[#dedad0]"/>Occupied</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-card border border-border"/>Available</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-primary"/>Selected</span>
                </div>
                {selectedDate!==today&&selectedHour===null&&(
                  <p className="text-xs text-muted-foreground mt-3">Choose a start time to check whole-room availability.</p>
                )}
                {selectedDate===today&&seat?.zone==="room"&&selectedHour===null&&(
                  <p className="text-xs text-muted-foreground mt-3">Choose a start time if you want the whole discussion room today.</p>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64 rounded-2xl border-2 border-dashed border-border bg-card/50">
                <div className="text-center">
                  <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3"/>
                  <p className="text-sm text-muted-foreground">Select a date to view seat availability</p>
                </div>
              </div>
            )}
          </div>

          <div className="w-[300px] bg-card border-l border-border flex flex-col">
            <div className="px-5 py-5 border-b border-border">
              <h2 className="font-serif text-xl">Your Booking</h2>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <BookingDetailsPanel
                selectedDate={selectedDate}
                selectedHour={selectedHour}
                duration={duration}
                seat={seat}
                meta={meta}
                today={today}
                showCustomerBookingUI={showCustomerBookingUI}
                needsScheduledTime={needsScheduledTime}
                showRollingBookingDetails={showRollingBookingDetails}
                isTodaySelection={isTodaySelection}
                hourlyRate={hourlyRate}
                subtotal={subtotal}
                fee={fee}
                grand={grand}
                onDateChange={d=>{setSelectedDate(d);setSelectedHour(null);setSelectedId(null);}}
                onHourChange={h=>{setSelectedHour(h);setSelectedId(null);}}
                onDurationChange={n=>{setDuration(n);setSelectedId(null);}}
              />
            </div>

            {showCustomerBookingUI && (
              <div className="p-5 border-t border-border">
                <ContinueToPaymentBar canProceedToPayment={canProceedToPayment} onContinue={()=>setView("pay")}/>
              </div>
            )}
          </div>
        </div>

        <div className="md:hidden flex flex-1 min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-y border-border bg-card px-4 py-4 shadow-sm">
            <DateTimePicker
              selectedDate={selectedDate}
              selectedHour={selectedHour}
              duration={duration}
              selectedSeat={seat}
              mobileCompact
              onDateChange={d=>{setSelectedDate(d);setSelectedHour(null);setSelectedId(null);}}
              onHourChange={h=>{setSelectedHour(h);setSelectedId(null);}}
              onDurationChange={n=>{setDuration(n);setSelectedId(null);}}
            />
          </div>

          <div className="flex-1 min-h-0 px-4 py-3 overflow-y-auto overscroll-contain">
            {selectedDate && !showCustomerBookingUI ? (
              <div className="flex items-center justify-center h-full rounded-2xl border border-red-200 bg-red-50/60">
                <p className="text-sm font-medium text-red-700">Quety Study Lounge is closed for now, come again tomorrow.</p>
              </div>
            ) : selectedDate ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground overflow-x-auto" style={{scrollbarWidth:"none"}}>
                  <span className="flex items-center gap-1.5 shrink-0"><span className="w-3.5 h-3.5 rounded-lg bg-[#ebe8e1] border border-[#dedad0]"/>Occupied</span>
                  <span className="flex items-center gap-1.5 shrink-0"><span className="w-3.5 h-3.5 rounded-lg bg-card border border-border"/>Available</span>
                  <span className="flex items-center gap-1.5 shrink-0"><span className="w-3.5 h-3.5 rounded-lg bg-primary"/>Selected</span>
                </div>
                {selectedDate!==today&&selectedHour===null&&(
                  <p className="text-xs text-muted-foreground">Choose a start time to check whole-room availability.</p>
                )}
                {selectedDate===today&&seat?.zone==="room"&&selectedHour===null&&(
                  <p className="text-xs text-muted-foreground">Choose a start time if you want the whole discussion room today.</p>
                )}
                <FloorMap occupied={occupied} selectedId={selectedId} onSelect={id=>{if(!occupied.has(id))setSelectedId(id);}} duration={duration} roomOnly={selectedDate!==getDateStr(0)} mobileStack/>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full rounded-2xl border-2 border-dashed border-border bg-card/50">
                <div className="text-center">
                  <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3"/>
                  <p className="text-sm text-muted-foreground">Select a date to view seat availability</p>
                </div>
              </div>
            )}
          </div>

          {showCustomerBookingUI && (
            <div className="shrink-0 border-t border-border bg-card px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)]">
              <MobileBookingFooter
                selectedDate={selectedDate}
                selectedHour={selectedHour}
                duration={duration}
                seat={seat}
                meta={meta}
                isTodaySelection={isTodaySelection}
                showRollingBookingDetails={showRollingBookingDetails}
                hourlyRate={hourlyRate}
                subtotal={subtotal}
                fee={fee}
                grand={grand}
              />
              <ContinueToPaymentBar canProceedToPayment={canProceedToPayment} onContinue={()=>setView("pay")}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── PAY ───────────────────────────────────────────────────────────────────
  if(view==="pay") return (
    <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-3xl">
        <button onClick={()=>setView("book")} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4"/>Back to seat map
        </button>

        <>
          <h1 className="font-serif text-3xl mb-0.5">Pay by QR</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Scan this payment QR, pay the amount below, and use <span className="font-semibold text-foreground">Quety Study Lounge</span> as the description.
          </p>
          <div className="space-y-3 mb-4">
            <PaymentQrGallery amount={grand} description="Quety Study Lounge" />
            <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Booking Details</p>
              <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">Customer</span><span className="font-medium text-right">{customer?.name ?? "—"}</span></div>
              <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">Seat</span><span className="font-medium text-right">{seat ? seatName(seat) : "—"}</span></div>
              <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">Time</span><span className="font-medium text-right">{selectionTimeLabel()}</span></div>
              <div className="flex justify-between gap-3 text-sm border-t border-border pt-3"><span className="text-muted-foreground">Total</span><span className="font-semibold text-primary text-right">{fmtMoney(grand)}</span></div>
            </div>
          </div>
          <button disabled={paymentBusy || !canProceedToPayment} onClick={handlePay}
            className={["w-full rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity shadow",
              paymentBusy || !canProceedToPayment ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-[#15345d] text-white hover:opacity-90 shadow-[0_14px_30px_rgba(21,52,93,0.18)]",
            ].join(" ")}>
            {paymentBusy ? "Sending Payment For Verification..." : <>I Have Paid <ChevronRight className="w-4 h-4"/></>}
          </button>
        </>
      </motion.div>
    </div>
  );

  if(view==="payPending" && booking) return (
    <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-3xl">
        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
          <RefreshCw className="w-5 h-5 text-primary animate-spin"/>
        </div>
        <h1 className="font-serif text-3xl mb-1 text-center">Waiting for Payment Verification</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">
          Your payment request has been sent to reception. Once the admin verifies it, this page will move to your booking confirmation automatically.
        </p>
        <PaymentQrGallery amount={booking.total ?? grand} description="Quety Study Lounge" />
        <div className="bg-card rounded-2xl border border-border p-4 mt-4 shadow-sm">
          <div className="font-mono text-lg font-bold tracking-widest text-center">{booking.ref}</div>
          <div className="text-xs text-muted-foreground mt-0.5 text-center">Payment Request Reference</div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 text-sm space-y-2">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Customer</span><span className="font-medium text-right">{booking.name}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Seat</span><span className="font-medium text-right">{seatById(booking.seatId)?seatName(seatById(booking.seatId)!):booking.seatId}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-primary text-right">{fmtMoney(booking.total ?? grand)}</span></div>
        </div>
      </motion.div>
    </div>
  );

  // ── QR ────────────────────────────────────────────────────────────────────
  if(view==="qr"&&booking) return (
    <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,scale:0.94}} animate={{opacity:1,scale:1}} className="w-full max-w-sm text-center">
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-5 h-5 text-primary"/></div>
        <h1 className="font-serif text-3xl mb-1">Booking Confirmed!</h1>
        <p className="text-sm text-muted-foreground mb-6">Show this QR code at reception to check in.</p>
        <div className="bg-card rounded-3xl border border-border p-6 mb-3 shadow-sm">
          <div className="w-48 h-48 mx-auto mb-4 p-2.5 bg-background rounded-2xl border border-border text-foreground"><QRPattern value={booking.ref}/></div>
          <div className="font-mono text-xl font-bold tracking-widest">{booking.ref}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Booking Reference</div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 text-left text-sm space-y-2.5 mb-4">
          {([
            ["Seat",      seatById(booking.seatId)?seatName(seatById(booking.seatId)!):booking.seatId],
            ["Date",      bookingDisplayDate(booking)],
            ["Time",      bookingTimeLabel(booking)],
            ["Duration",  `${booking.duration}h`],
            ["Total Paid",fmtMoney(booking.total ?? grand)],
          ] as [string,string][]).map(([k,v])=>(
            <div key={k} className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{k}</span><span className="font-medium text-right">{v}</span></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={()=>{setFoodView("menu");setView("food");}}
            className="bg-accent text-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-accent/80 transition-colors flex items-center justify-center gap-1.5">
            <UtensilsCrossed className="w-4 h-4"/>Order Food
          </button>
          <button onClick={()=>downloadBookingImage(booking)}
            className="border border-border rounded-xl py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
            <Download className="w-4 h-4"/>Download
          </button>
        </div>
        <button onClick={()=>{
          if (pendingFoodPayment?.status === "pending") {
            setFoodView("payment");
          } else {
            setFoodView(latestFoodReceipt.length > 0 ? "receipt" : "menu");
          }
          setView("food");
        }}
          className="w-full border border-border rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
          <UtensilsCrossed className="w-4 h-4"/>Go to Food Orders
        </button>
      </motion.div>
    </div>
  );

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if(view==="active"&&booking) {
    const startTime = bookingStartDate(booking);
    const endTime = fmtClock(bookingEndDate(booking));
    return (
      <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="w-full max-w-sm">
          <AnimatePresence>
            {warning&&<motion.div initial={{opacity:0,y:-12}} animate={{opacity:1,y:0}}
              className={["flex items-start gap-2.5 rounded-2xl border px-4 py-3 mb-5 text-sm",secsLeft<300?"bg-red-50 border-red-200 text-red-800":"bg-amber-50 border-amber-200 text-amber-800"].join(" ")}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
              <div>
                <div className="font-semibold">{secsLeft<300?"Session ending very soon!":"Session ending soon"}</div>
                <div className="text-xs opacity-80 mt-0.5">{secsLeft<300?"Please wrap up and vacate your seat.":"Less than 15 minutes remaining."}</div>
              </div>
            </motion.div>}
          </AnimatePresence>
          <div className="bg-card rounded-3xl border border-border p-8 mb-3 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/><span>Session active</span>
            </div>
            <TimerRing pct={pct}>
              <div><div className="font-mono font-bold text-2xl leading-none">{fmtTime(secsLeft)}</div><div className="text-[11px] text-muted-foreground mt-1">remaining</div></div>
            </TimerRing>
            <div className="grid grid-cols-2 gap-4 text-sm mt-7 pt-5 border-t border-border text-left">
              {([
                ["Seat",seat?seatName(seat):booking.seatId],
                ["Booked for",`${booking.duration}h`],
                ["Started",fmtClock(startTime)],
                ["Ends at",endTime],
              ] as [string,string][]).map(([k,v])=>(
                <div key={k}><div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{k}</div><div className="font-semibold">{v}</div></div>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border px-4 py-3 text-xs text-muted-foreground flex items-center justify-between mb-3">
            <span>Ref <span className="font-mono font-medium text-foreground">{booking.ref}</span></span>
            <span className="text-[10px] bg-accent text-primary rounded-full px-2 py-0.5 font-medium">Active</span>
          </div>
          <button onClick={()=>{setFoodView("menu");setView("food");}}
            className="w-full bg-accent text-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-accent/80 transition-colors flex items-center justify-center gap-2">
            <UtensilsCrossed className="w-4 h-4"/>Order Food & Drinks
          </button>
          {secsLeft>300&&<div className="text-center mt-3"><button onClick={()=>setSecsLeft(180)} className="text-xs text-muted-foreground underline underline-offset-2">Demo: skip to last 3 min</button></div>}
        </motion.div>
      </div>
    );
  }

  // ── EXPIRED ────────────────────────────────────────────────────────────────
  if(view==="expired"&&booking) return (
    <div className="portal-theme min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,scale:0.94}} animate={{opacity:1,scale:1}} className="w-full max-w-sm text-center">
        {(() => {
          const checkedIn = Boolean(booking.checkInAt);
          const title = checkedIn ? "Session Ended" : "Booking Expired";
          const message = checkedIn
            ? `Your ${booking.duration}-hour session has concluded. This QR code is now invalid.`
            : "This booking was not checked in before its valid time ended. This QR code is now invalid.";
          return (
            <>
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5"><XCircle className="w-7 h-7 text-red-500"/></div>
        <h1 className="font-serif text-3xl mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <div className="bg-card rounded-3xl border border-border p-6 mb-5 shadow-sm">
          <div className="w-40 h-40 mx-auto mb-4 text-foreground"><QRPattern value={booking.ref} faded/></div>
          <div className="font-mono text-base text-muted-foreground line-through tracking-widest">{booking.ref}</div>
          <div className="inline-flex items-center gap-1.5 mt-2.5 bg-red-50 border border-red-100 text-red-600 rounded-full px-3 py-1 text-xs font-semibold"><XCircle className="w-3 h-3"/>INVALID</div>
        </div>
        <button onClick={()=>{setBooking(null);setSelectedId(null);setSelectedDate(getDateStr(0));setSelectedHour(null);setView("book");}}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity shadow">
          Book Another Seat
        </button>
            </>
          );
        })()}
      </motion.div>
    </div>
  );

  // ── ADMIN ──────────────────────────────────────────────────────────────────
  if(view==="admin"&&adminAuth) return (
    <div className="portal-theme min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-9 w-9 rounded-xl object-cover" />
          <div>
            <div className="font-serif text-xl leading-tight">Quety Study Lounge Admin</div>
            <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">{adminRoleLabel(adminAuth.role)} · {adminAuth.username}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={adminBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border bg-card rounded-lg px-3 py-1.5 hover:bg-muted transition-all">
            <ArrowLeft className="w-3.5 h-3.5"/>Customer View
          </button>
          <button onClick={()=>{setAdminAuth(null);setAdminToken(null);setView("adminLogin");}} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 flex items-center gap-1">
            <LogOut className="w-3.5 h-3.5"/>Sign out
          </button>
        </div>
      </header>

      <div className="bg-card border-b border-border px-6">
        <div key={`${verifyPaymentsCount}-${pendingCheckIns}-${adminAuth.role}`} className="flex overflow-x-auto" style={{scrollbarWidth:"none"}}>
          {adminTabs.map(t=>(
            <button key={t.key} onClick={()=>setAdminTab(t.key)}
              className={["shrink-0 px-4 py-3.5 text-sm border-b-2 transition-colors",
                adminTab===t.key?"border-primary text-primary font-medium":"border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* PAYMENTS */}
        {adminTab==="payments"&&(
          <div className="space-y-5">
            <div>
              <h2 className="font-serif text-2xl mb-1">Verify Payments</h2>
              <p className="text-sm text-muted-foreground">Approve or reject customer payment requests before bookings and food orders are released.</p>
            </div>
            {pendingPaymentBookings.length === 0 && pendingFoodPayments.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-10 text-center">
                <QrCode className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3"/>
                <p className="text-sm text-muted-foreground">No payment verifications are waiting right now.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingPaymentBookings.length > 0 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold">Seat Bookings</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Verify seat bookings before the customer receives the booking confirmation QR.</p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {pendingPaymentBookings.map(payment=>(
                        <div key={payment.ref} className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Booking Reference</div>
                              <div className="font-mono text-sm font-semibold">{payment.ref}</div>
                            </div>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Awaiting verification</span>
                          </div>
                          <div className="space-y-2.5 text-sm mb-5">
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Customer</span><span className="font-medium text-right">{payment.name}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Email</span><span className="font-medium text-right">{payment.email}</span></div>
                            {payment.phone && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Phone</span><span className="font-medium text-right">{payment.phone}</span></div>}
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Seat</span><span className="font-medium text-right">{seatById(payment.seatId)?seatName(seatById(payment.seatId)!):payment.seatId}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Date</span><span className="font-medium text-right">{bookingDisplayDate(payment)}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Time</span><span className="font-medium text-right">{bookingTimeLabel(payment)}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-primary text-right">{fmtMoney(payment.total ?? 0)}</span></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={()=>void handleVerifyPayment(payment.ref)} className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                              Verify
                            </button>
                            <button onClick={()=>void handleRejectPayment(payment.ref)} className="rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors">
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingFoodPayments.length > 0 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold">Food Orders</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Verify food payments before vendor orders are sent through.</p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {pendingFoodPayments.map(request=>(
                        <div key={request.id} className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Food Payment Request</div>
                              <div className="font-mono text-sm font-semibold">{request.id}</div>
                            </div>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Food orders</span>
                          </div>
                          <div className="space-y-2.5 text-sm mb-4">
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Customer</span><span className="font-medium text-right">{request.customerName}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Booking Ref</span><span className="font-mono font-medium text-right">{request.bookingRef}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Seat</span><span className="font-medium text-right">{request.seatId}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Delivery</span><span className="font-medium text-right capitalize">{request.delivery}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-primary text-right">{fmtMoney(request.total)}</span></div>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/15 px-3 py-3 mb-4">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Items</div>
                            <div className="space-y-1.5 text-sm">
                              {request.items.map((item, index)=>(
                                <div key={`${request.id}-${item.itemId}-${index}`} className="flex justify-between gap-3 text-muted-foreground">
                                  <span>{item.name} × {item.qty}</span>
                                  <span>{fmtMoney(item.price * item.qty)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={()=>void handleVerifyFoodPayment(request.id)} className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                              Verify
                            </button>
                            <button onClick={()=>void handleRejectFoodPayment(request.id)} className="rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors">
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SCAN */}
        {adminTab==="scan"&&(
          <div className="max-w-md mx-auto">
            <h2 className="font-serif text-2xl mb-1">Validate Customer</h2>
            <p className="text-sm text-muted-foreground mb-6">Enter or scan a booking reference to check in a customer. You can confirm the updated status from All bookings.</p>
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex gap-2.5">
                <input value={scanInput} onChange={e=>{setScanInput(e.target.value.toUpperCase());setScanState("idle");setScanMessage("");}}
                  placeholder="e.g. CW-7734" onKeyDown={e=>e.key==="Enter"&&handleScan()}
                  className="flex-1 bg-background rounded-xl px-4 py-3 text-sm font-mono tracking-wider border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground"/>
                <button onClick={handleScan} className="bg-[#15345d] text-white px-4 rounded-xl hover:opacity-90 shadow-[0_14px_30px_rgba(21,52,93,0.18)] transition-opacity flex items-center gap-1.5 text-sm font-medium">
                  <ScanLine className="w-4 h-4"/>Check in
                </button>
              </div>
              <AnimatePresence mode="wait">
                {scanState!=="idle"&&(
                  <motion.div key={scanState} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
                    {scanState==="valid"&&(
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm mb-3"><CheckCircle className="w-4 h-4"/>Valid booking found</div>
                        {(()=>{const found=allBookings.find(b=>b.ref===scanInput.trim().toUpperCase());return found?(
                          <div className="text-sm space-y-1.5 text-emerald-900/70 mb-4">
                            <div className="flex justify-between"><span>Name</span><span className="font-medium text-emerald-900">{found.name}</span></div>
                            {found.phone&&<div className="flex justify-between"><span>Phone</span><span className="font-medium text-emerald-900">{found.phone}</span></div>}
                            <div className="flex justify-between"><span>Seat</span><span className="font-medium font-mono text-emerald-900">{found.seatId}</span></div>
                            <div className="flex justify-between"><span>Date</span><span className="font-medium text-emerald-900">{bookingDisplayDate(found)}</span></div>
                            <div className="flex justify-between"><span>Time</span><span className="font-medium text-emerald-900">{bookingTimeLabel(found)} · {found.duration}h</span></div>
                          </div>
                        ):null;})()}
                        <button onClick={handleCheckIn} className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4"/>Check In Customer
                        </button>
                      </div>
                    )}
                    {scanState==="checkedIn"&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700"><div className="flex items-center gap-2 font-semibold mb-1"><CheckCircle className="w-4 h-4"/>Already checked in</div><p className="text-blue-600/80 text-xs">{scanMessage || "This booking has already been used."}</p></div>}
                    {scanState==="invalid"&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><div className="flex items-center gap-2 font-semibold mb-1"><XCircle className="w-4 h-4"/>Check-in denied</div><p className="text-red-600/80 text-xs">{scanMessage || "No valid booking found for this reference."}</p></div>}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">Recent paid bookings:</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentPaidBookings.map(b=>(
                    <button key={b.ref} onClick={()=>{setScanInput(b.ref);setScanState("idle");}} className="font-mono text-xs bg-card border border-border rounded-lg px-2.5 py-1 hover:border-primary/50 hover:text-primary transition-colors">{b.ref}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMERS */}
        {adminTab==="customers"&&(
          <div>
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="font-serif text-2xl mb-0.5">All Bookings</h2><p className="text-sm text-muted-foreground">{filteredBookings.length} of {allBookings.length} bookings</p></div>
            </div>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                <input
                  value={custFilter.ref}
                  onChange={e=>setCustFilter(f=>({...f,ref:e.target.value.toUpperCase()}))}
                  placeholder="Search reference number"
                  className="bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary/50 transition-colors min-w-[220px]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-muted-foreground"/>
                <select value={custFilter.date} onChange={e=>setCustFilter(f=>({...f,date:e.target.value}))}
                  className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary/50 transition-colors">
                  <option value="">All dates</option>
                  {[...new Set(allBookings.map(b=>b.date))].sort().map(d=><option key={d} value={d}>{fmtDateLabel(d).day} {fmtDateLabel(d).num} {fmtDateLabel(d).month}</option>)}
                </select>
              </div>
              <select value={custFilter.hour} onChange={e=>setCustFilter(f=>({...f,hour:e.target.value}))}
                className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary/50 transition-colors">
                <option value="">All times</option>
                {Array.from({length:14},(_,i)=>i+8).map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
                <select value={custFilter.status} onChange={e=>setCustFilter(f=>({...f,status:e.target.value}))}
                  className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary/50 transition-colors">
                  <option value="">All statuses</option>
                  <option value="payment_pending">Payment Pending</option>
                  <option value="paid">Paid</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              {(custFilter.date||custFilter.hour||custFilter.status||custFilter.ref)&&(
                <button onClick={()=>setCustFilter({date:"",hour:"",status:"",ref:""})} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Clear filters</button>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {["Ref","Customer","Date","Start","Duration","End","Seat","Zone","Status","Actions"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b,i)=>{
                    const bSeat=SEATS.find(s=>s.id===b.seatId);
                    const liveStatus = bookingStatusAt(b);
                    const statusCls={payment_pending:"bg-orange-100 text-orange-700",paid:"bg-amber-100 text-amber-700",active:"bg-emerald-100 text-emerald-700",completed:"bg-slate-100 text-slate-700",expired:"bg-gray-100 text-gray-500",cancelled:"bg-red-100 text-red-700"};
                    return (
                      <tr key={b.ref} className={["border-b border-border/50 hover:bg-muted/20 transition-colors",i%2===0?"":"bg-muted/10"].join(" ")}>
                        <td className="px-4 py-3 font-mono text-xs">{b.ref}</td>
                        <td className="px-4 py-3"><div className="font-medium text-xs">{b.name}</div><div className="text-[10px] text-muted-foreground">{b.email}</div>{b.phone&&<div className="text-[10px] text-muted-foreground">{b.phone}</div>}</td>
                        <td className="px-4 py-3 text-xs">{fmtDateLabel(b.date).day} {fmtDateLabel(b.date).num} {fmtDateLabel(b.date).month}</td>
                        <td className="px-4 py-3 font-mono text-xs">{fmtClock(bookingStartDate(b))}</td>
                        <td className="px-4 py-3 text-xs">{b.duration}h</td>
                        <td className="px-4 py-3 font-mono text-xs">{fmtClock(bookingEndDate(b))}</td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{b.seatId}</td>
                        <td className="px-4 py-3 text-xs">{bSeat?ZONE_META[bSeat.zone].label:"–"}</td>
                        <td className="px-4 py-3"><span className={["text-[10px] rounded-full px-2 py-0.5 font-medium",statusCls[liveStatus]].join(" ")}>{liveStatus.replaceAll("_"," ")}</span></td>
                        <td className="px-4 py-3">
                          {["paid","active"].includes(liveStatus) ? (
                            <button onClick={()=>handleCancelBooking(b.ref)} className="text-xs rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 font-medium text-red-700 hover:bg-red-100 transition-colors">
                              Cancel
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No action</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBookings.length===0&&(
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">No bookings match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AVAILABILITY */}
        {adminTab==="availability"&&(
          <div className="space-y-5">
            <div>
              <h2 className="font-serif text-2xl mb-1">Seat Availability</h2>
              <p className="text-sm text-muted-foreground">Live seat status only, including who is using each seat and how much time remains.</p>
            </div>
            <div className="grid xl:grid-cols-2 gap-5">
              <LiveSeatSection
                title="Focus Pods"
                caption="Current status across Level 1, Level 2, and the private room."
                icon={<Wifi className="w-4 h-4" />}
                counts={focusSeatSnapshot}
                entries={focusSeatEntries}
                tones={{ primary: ZONE_META.focus.hex, light: ZONE_META.focus.light }}
                map={
                  <FocusPodZone
                    occupied={focusOccupiedSet}
                    selectedId={null}
                    onSelect={()=>{}}
                    duration={1}
                    readOnly
                    showPrice={false}
                  />
                }
              />
              <LiveSeatSection
                title="Discussion Desks"
                caption="Current discussion-table status, with whole-room bookings blocking all desks."
                icon={<Users className="w-4 h-4" />}
                counts={discussionSeatSnapshot}
                entries={discussionSeatEntries}
                tones={{ primary: ZONE_META.discussion.hex, light: ZONE_META.discussion.light }}
                map={
                  <div className="space-y-3">
                    <DiscussionDeskZone
                      occupied={discussionOccupiedSet}
                      selectedId={null}
                      onSelect={()=>{}}
                      duration={1}
                      readOnly
                      showPrice={false}
                    />
                    <DiscussionRoomZone
                      occupied={discussionOccupiedSet}
                      selectedId={null}
                      onSelect={()=>{}}
                      duration={1}
                      readOnly
                      showPrice={false}
                    />
                  </div>
                }
              />
            </div>
          </div>
        )}

        {adminTab==="dashboard"&&adminAuth.role==="superadmin"&&adminDashboard&&(
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl mb-0.5">Revenue Dashboard</h2>
                <p className="text-sm text-muted-foreground">Owner view across booking and vendor revenue.</p>
              </div>
              <div className="flex gap-2">
                {(["week","month","year"] as SalesRange[]).map(range=>(
                  <button key={range} onClick={()=>setSalesRange(range)}
                    className={["rounded-xl px-3 py-2 text-xs font-semibold border transition-all capitalize",
                      salesRange===range?"bg-primary text-primary-foreground border-primary":"bg-card border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}>
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { label: "Total Revenue", value: fmtMoney(filteredBookingSalesTotal + filteredRevenueVendorSales) },
                { label: "Booking Revenue", value: fmtMoney(filteredBookingSalesTotal) },
                { label: "Vendor Revenue", value: fmtMoney(filteredRevenueVendorSales) },
                { label: "Active Sessions", value: `${adminDashboard.bookingCounts.active}` },
              ].map(card=>(
                <div key={card.label} className="bg-card rounded-2xl border border-border p-5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{card.label}</div>
                  <div className="font-serif text-3xl text-primary">{card.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="font-semibold mb-3">Booking Overview</h3>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                {[
                  ["Total", adminDashboard.bookingCounts.total],
                  ["Future", adminDashboard.bookingCounts.future],
                  ["Past", adminDashboard.bookingCounts.past],
                  ["Paid", adminDashboard.bookingCounts.paid],
                  ["Active", adminDashboard.bookingCounts.active],
                  ["Completed", adminDashboard.bookingCounts.completed],
                  ["Cancelled", adminDashboard.bookingCounts.cancelled],
                ].map(([label,value])=>(
                  <div key={String(label)} className="rounded-xl bg-muted/30 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div className="font-semibold text-lg">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  label: "Focus Pods",
                  bookings: seatCategoryStats.focus.bookings,
                  revenue: seatCategoryStats.focus.revenue,
                  tone: ZONE_META.focus,
                },
                {
                  label: "Discussion Desks",
                  bookings: seatCategoryStats.discussion.bookings,
                  revenue: seatCategoryStats.discussion.revenue,
                  tone: ZONE_META.discussion,
                },
              ].map(item=>(
                <div key={item.label} className="bg-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: item.tone.hex }}>
                    {item.tone.icon}
                    {item.label}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl px-3 py-3" style={{ backgroundColor: item.tone.light }}>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Bookings</div>
                      <div className="font-serif text-3xl" style={{ color: item.tone.hex }}>{item.bookings}</div>
                    </div>
                    <div className="rounded-xl bg-muted/25 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sales</div>
                      <div className="font-serif text-2xl text-primary">{fmtMoney(item.revenue)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold">Sales by Date</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Booking and vendor sales for the selected {salesRange}.</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {["Date","Booking Sales","Vendor Sales","Total Sales"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salesBreakdown.map((row,i)=>(
                    <tr key={row.key} className={["border-b border-border/50",i%2===0?"":"bg-muted/10"].join(" ")}>
                      <td className="px-4 py-3 text-xs">{row.label}</td>
                      <td className="px-4 py-3 text-xs">{fmtMoney(row.bookingSales)}</td>
                      <td className="px-4 py-3 text-xs">{fmtMoney(row.vendorSales)}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-primary">{fmtMoney(row.totalSales)}</td>
                    </tr>
                  ))}
                  {salesBreakdown.length===0&&(
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No sales recorded in this period yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab==="orders"&&adminAuth.role==="superadmin"&&(
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-serif text-2xl mb-0.5">Vendor Orders</h2><p className="text-sm text-muted-foreground">{adminOrders.length} orders across all vendors</p></div>
              <div className="flex gap-2">
                {(["week","month","year"] as SalesRange[]).map(range=>(
                  <button key={range} onClick={()=>setVendorSalesRange(range)}
                    className={["rounded-xl px-3 py-2 text-xs font-semibold border transition-all capitalize",
                      vendorSalesRange===range?"bg-primary text-primary-foreground border-primary":"bg-card border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}>
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { label: "Vendor Sales", value: fmtMoney(filteredVendorSalesTotal) },
                { label: "Orders", value: `${filteredVendorOrderCount}` },
                ...filteredVendorCompanyTotals.map(company => ({ label: `${company.label} Sales`, value: fmtMoney(company.sales) })),
              ].map(card=>(
                <div key={card.label} className="bg-card rounded-2xl border border-border p-5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{card.label}</div>
                  <div className="font-serif text-3xl text-primary">{card.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold">Vendor Sales by Date</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Customer food and drink orders for the selected {vendorSalesRange}.</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {["Date","Orders",...adminVendorCompanies.map(company=>`${company.label} Sales`),"Total Sales"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendorSalesBreakdown.map((row,i)=>(
                    <tr key={row.key} className={["border-b border-border/50",i%2===0?"":"bg-muted/10"].join(" ")}>
                      <td className="px-4 py-3 text-xs">{row.label}</td>
                      <td className="px-4 py-3 text-xs">{row.orders}</td>
                      {adminVendorCompanies.map(company=>(
                        <td key={company.id} className="px-4 py-3 text-xs">{fmtMoney(row.totals[company.id] ?? 0)}</td>
                      ))}
                      <td className="px-4 py-3 text-xs font-semibold text-primary">{fmtMoney(row.totalSales)}</td>
                    </tr>
                  ))}
                  {vendorSalesBreakdown.length===0&&(
                    <tr><td colSpan={adminVendorCompanies.length + 3} className="px-4 py-10 text-center text-sm text-muted-foreground">No vendor sales recorded in this period yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold">Items Sold</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Track exactly which menu items were sold in the selected {vendorSalesRange}.</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {["Vendor","Item","Qty Sold","Sales"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adminVendorItemSales.map((row,i)=>(
                    <tr key={`${row.vendor}-${row.itemName}`} className={["border-b border-border/50",i%2===0?"":"bg-muted/10"].join(" ")}>
                      <td className="px-4 py-3 text-xs">{row.vendorLabel}</td>
                      <td className="px-4 py-3 text-xs">{row.itemName}</td>
                      <td className="px-4 py-3 text-xs">{row.qty}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-primary">{fmtMoney(row.sales)}</td>
                    </tr>
                  ))}
                  {adminVendorItemSales.length===0&&(
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No item sales recorded in this period yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {["Order","Vendor","Customer","Booking","Delivery","Total","Status","Placed"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredVendorOrders.map((order,i)=>(
                    <tr key={order.id} className={["border-b border-border/50",i%2===0?"":"bg-muted/10"].join(" ")}>
                      <td className="px-4 py-3 font-mono text-xs">{order.id}</td>
                      <td className="px-4 py-3 text-xs">{order.vendorLabel ?? fallbackVendorLabel(order.vendor)}</td>
                      <td className="px-4 py-3 text-xs">{order.customerName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{order.bookingRef}</td>
                      <td className="px-4 py-3 text-xs capitalize">{order.delivery}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-primary">{fmtMoney(order.total)}</td>
                      <td className="px-4 py-3 text-xs capitalize">{order.status}</td>
                      <td className="px-4 py-3 text-xs">{order.placedAt.toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredVendorOrders.length===0&&(
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No vendor orders yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab==="logs"&&adminAuth.role==="superadmin"&&(
          <div>
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="font-serif text-2xl mb-0.5">Reception Activity Log</h2><p className="text-sm text-muted-foreground">{adminLogs.length} logged actions</p></div>
            </div>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {["Time","User","Role","Action","Target","Details"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adminLogs.map((log,i)=>(
                    <tr key={log.id} className={["border-b border-border/50",i%2===0?"":"bg-muted/10"].join(" ")}>
                      <td className="px-4 py-3 text-xs">{log.createdAt.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-medium">{log.adminUsername}</td>
                      <td className="px-4 py-3 text-xs">{adminRoleLabel(log.adminRole)}</td>
                      <td className="px-4 py-3 text-xs capitalize">{log.action.replaceAll("_"," ")}</td>
                      <td className="px-4 py-3 text-xs font-mono">{log.targetId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{Object.entries(log.details).map(([key,val])=>`${key}: ${String(val)}`).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                  {adminLogs.length===0&&(
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No logged activity yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACCOUNTS */}
        {adminTab==="accounts"&&adminAuth.role==="superadmin"&&(
          <div className="max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <div><h2 className="font-serif text-2xl mb-0.5">Admin Accounts</h2><p className="text-sm text-muted-foreground">{adminAccounts.length} accounts</p></div>
              <button onClick={()=>setView("adminSignup")} className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
                <UserPlus className="w-4 h-4"/>New Account
              </button>
            </div>
            {editingAdminId&&(
              <div className="bg-card rounded-2xl border border-primary/30 p-5 mb-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-sm">Edit account</h3>
                    <p className="text-xs text-muted-foreground">Update username, role, or password. Leave password blank to keep it unchanged.</p>
                  </div>
                  <button onClick={()=>{
                    setEditingAdminId(null);
                    setAdminEditForm({ username: "", password: "", role: "admin" });
                  }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Close</button>
                </div>
                <input
                  value={adminEditForm.username}
                  onChange={e=>setAdminEditForm(form=>({ ...form, username: e.target.value }))}
                  placeholder="Username"
                  className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"
                />
                <input
                  value={adminEditForm.password}
                  onChange={e=>setAdminEditForm(form=>({ ...form, password: e.target.value }))}
                  type="password"
                  placeholder="New password"
                  className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"
                />
                <div className="flex gap-2">
                  {(["admin","superadmin"] as AdminAccount["role"][]).map(role=>(
                    <button
                      key={role}
                      type="button"
                      onClick={()=>setAdminEditForm(form=>({ ...form, role }))}
                      className={["flex-1 py-2 rounded-xl text-sm border font-medium transition-all",
                        adminEditForm.role===role?"bg-primary text-primary-foreground border-primary":"bg-background border-border text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      {adminRoleLabel(role)}
                    </button>
                  ))}
                </div>
                <button
                  onClick={()=>void handleAdminUpdate(editingAdminId)}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            )}
            <div className="space-y-2">
              {adminAccounts.map(a=>(
                <div key={a.id} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{a.username}</span>
                      <span className={["text-[10px] rounded-full px-2 py-0.5 font-medium",a.role==="superadmin"?"bg-amber-100 text-amber-700":"bg-blue-100 text-blue-700"].join(" ")}>
                        {adminRoleLabel(a.role)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Created {a.createdAt.toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={()=>{
                        setEditingAdminId(a.id);
                        setAdminEditForm({ username: a.username, password: "", role: a.role });
                      }}
                      className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-blue-100 hover:text-blue-700 transition-colors"
                      title="Edit account"
                    >
                      <Pencil className="w-3.5 h-3.5"/>
                    </button>
                    {a.id!=="a1"&&<button onClick={async()=>{
                      if(adminToken)await apiFetch(`/api/admin/accounts/${a.id}`, {method:"DELETE",headers:bearer(adminToken)}).catch(()=>{});
                      setAdminAccounts(prev=>prev.filter(x=>x.id!==a.id));
                    }} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {adminTab==="accounts"&&adminAuth.role!=="superadmin"&&(
          <div className="flex items-center justify-center h-48">
            <div className="text-center"><Shield className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2"/><p className="text-sm text-muted-foreground">Account management requires Superadmin access.</p></div>
          </div>
        )}
      </div>
    </div>
  );

  if(view==="admin"&&!adminAuth){setView("adminLogin");return null;}
  return null;
}
