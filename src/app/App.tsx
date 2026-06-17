import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin, CheckCircle, XCircle, Timer, AlertTriangle,
  ChevronRight, ArrowLeft, Wifi, Zap, Lock, Shield,
  ScanLine, RefreshCw, Users, Eye, EyeOff, Building2,
  Sparkles, ArrowRight, QrCode, Plus, Minus, ShoppingBag,
  Truck, UtensilsCrossed, Filter, Calendar, Clock,
  LogOut, Trash2, UserPlus, ToggleLeft, ToggleRight, Store,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type AppView =
  | "landing" | "book" | "pay" | "qr" | "food" | "active" | "expired"
  | "adminLogin" | "adminSignup" | "admin"
  | "vendorLogin" | "vendor";
type AdminTab = "scan" | "customers" | "availability" | "accounts";
type VendorTab = "menu" | "orders";
type Zone = "hotdesk" | "focus" | "private";
type VendorType = "cafe" | "pizza";

interface Seat { id: string; label: string; zone: Zone; }
interface Customer { name: string; email: string; }
interface Booking {
  ref: string; seatId: string; date: string; startHour: number; duration: number;
  name: string; email: string; paidAt: Date;
  status: "paid" | "active" | "expired"; checkInAt?: Date;
}
interface FoodItem { id: string; name: string; price: number; vendor: VendorType; category: string; available: boolean; }
interface CartItem { item: FoodItem; qty: number; }
interface OrderLine { itemId: string; name: string; price: number; qty: number; }
interface FoodOrder {
  id: string; bookingRef: string; seatId: string; customerName: string;
  lines: OrderLine[]; delivery: "table" | "pickup";
  total: number; status: "pending" | "preparing" | "ready" | "completed";
  placedAt: Date; vendor: VendorType;
}
interface AdminAccount { id: string; username: string; password: string; role: "super" | "reception"; createdAt: Date; }

// ── Zone meta ─────────────────────────────────────────────────────────────────
const ZONE_META: Record<Zone, { label: string; price: number; hex: string; light: string; icon: React.ReactNode }> = {
  hotdesk: { label: "Hot Desk",       price: 8,  hex: "#1b4332", light: "#e6ede9", icon: <Wifi      className="w-3 h-3" /> },
  focus:   { label: "Focus Pod",      price: 12, hex: "#4c1d95", light: "#ede9fe", icon: <Zap       className="w-3 h-3" /> },
  private: { label: "Private Office", price: 20, hex: "#92400e", light: "#fef3c7", icon: <Lock      className="w-3 h-3" /> },
};

// ── Seat data ─────────────────────────────────────────────────────────────────
// Hot desks: 12 tables (L1: 1-6, L2: 7-12) × 4 seats
const HOT_DESK_SEATS: Seat[] = Array.from({ length: 12 }, (_, t) =>
  ["A", "B", "C", "D"].map(l => ({ id: `H${t + 1}${l}`, label: l, zone: "hotdesk" as Zone }))
).flat();
const FOCUS_SEATS: Seat[] = Array.from({ length: 8 }, (_, i) => ({ id: `F${i + 1}`, label: `F${i + 1}`, zone: "focus" as Zone }));
const PRIVATE_SEATS: Seat[] = [
  { id: "P1", label: "Office 1", zone: "private" },
  { id: "P2", label: "Office 2", zone: "private" },
];
const SEATS = [...HOT_DESK_SEATS, ...FOCUS_SEATS, ...PRIVATE_SEATS];

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
  const d = new Date(); d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
}
function safeHour(offset: number) { return Math.min(Math.max(8, new Date().getHours() + offset), 19); }
function genRef() { return `CW-${Math.floor(1000 + Math.random() * 9000)}`; }
function genFoodRef() { return `FO-${Math.floor(100 + Math.random() * 900)}`; }
function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function fmtHm(sec: number) { const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; }
function fmtHour(h: number) { if (h===12) return "12:00 PM"; if (h<12) return `${h}:00 AM`; return `${h-12}:00 PM`; }
function fmtDateLabel(s: string) {
  const d = new Date(s + "T12:00:00");
  return { day: d.toLocaleDateString("en",{weekday:"short"}), num: d.getDate(), month: d.toLocaleDateString("en",{month:"short"}) };
}
function fmtDateFull(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
function seatName(seat: Seat) {
  if (seat.zone === "hotdesk") { const m = seat.id.match(/H(\d+)([A-D])/); if (m) return `Table ${m[1]} Seat ${m[2]}`; }
  return seat.label;
}
function getOccupied(bookings: Booking[], date: string, startHour: number, duration: number): Set<string> {
  const end = startHour + duration;
  return new Set(bookings.filter(b => b.date===date && b.startHour < end && (b.startHour+b.duration) > startHour).map(b => b.seatId));
}
function sessionSecsLeft(b: Booking) {
  if (!b.checkInAt) return b.duration*3600;
  return Math.max(0, b.duration*3600 - Math.floor((Date.now()-b.checkInAt.getTime())/1000));
}

// ── Initial data ──────────────────────────────────────────────────────────────
const INITIAL_BOOKINGS: Booking[] = [
  { ref:"CW-7734", seatId:"H1B",  date:getDateStr(0), startHour:safeHour(-2), duration:3, name:"Marcus Chen",    email:"m.chen@email.com",    paidAt:new Date(Date.now()-2*3600000), status:"active",  checkInAt:new Date(Date.now()-2*3600000) },
  { ref:"CW-7689", seatId:"F2",   date:getDateStr(0), startHour:safeHour(-1), duration:4, name:"Priya Nair",     email:"p.nair@email.com",    paidAt:new Date(Date.now()-3600000),  status:"active",  checkInAt:new Date(Date.now()-3600000) },
  { ref:"CW-7701", seatId:"H4C",  date:getDateStr(0), startHour:safeHour(1),  duration:2, name:"Tom Walcott",    email:"t.walcott@email.com", paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7699", seatId:"H7A",  date:getDateStr(0), startHour:safeHour(2),  duration:3, name:"Yuki Tanaka",    email:"y.tanaka@email.com",  paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7820", seatId:"H2C",  date:getDateStr(1), startHour:10,           duration:4, name:"Alice Johnson",  email:"a.johnson@email.com", paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7821", seatId:"F4",   date:getDateStr(1), startHour:14,           duration:2, name:"Bob Smith",      email:"b.smith@email.com",   paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7822", seatId:"H9B",  date:getDateStr(1), startHour:9,            duration:5, name:"Chen Wei",       email:"c.wei@email.com",     paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7823", seatId:"P2",   date:getDateStr(2), startHour:13,           duration:3, name:"Diana Reed",     email:"d.reed@email.com",    paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7824", seatId:"F1",   date:getDateStr(2), startHour:10,           duration:2, name:"Ethan Cole",     email:"e.cole@email.com",    paidAt:new Date(),                    status:"paid" },
  { ref:"CW-7825", seatId:"H11C", date:getDateStr(2), startHour:11,           duration:4, name:"Fatima Hassan",  email:"f.hassan@email.com",  paidAt:new Date(),                    status:"paid" },
];

const INITIAL_FOOD_ORDERS: FoodOrder[] = [
  { id:"FO-201", bookingRef:"CW-7734", seatId:"H1B", customerName:"Marcus Chen", lines:[{itemId:"c1",name:"Espresso",price:3.50,qty:2},{itemId:"c7",name:"Chicken Sandwich",price:9.00,qty:1}], delivery:"table", total:16.00, status:"pending",  placedAt:new Date(Date.now()-15*60000), vendor:"cafe" },
  { id:"FO-202", bookingRef:"CW-7689", seatId:"F2",  customerName:"Priya Nair",  lines:[{itemId:"p3",name:"Pepperoni (S)",price:14.00,qty:1},{itemId:"p9",name:"Garlic Bread",price:6.00,qty:1}],  delivery:"pickup", total:20.00, status:"preparing",placedAt:new Date(Date.now()-8*60000),  vendor:"pizza" },
];

const DEFAULT_ADMIN_ACCOUNTS: AdminAccount[] = [
  { id:"a1", username:"admin", password:"workhub2024", role:"super",     createdAt:new Date() },
  { id:"a2", username:"desk1", password:"desk1234",    role:"reception", createdAt:new Date() },
];

const VENDOR_CREDS: Record<VendorType, { password: string; label: string }> = {
  cafe:  { password: "cafe2024",  label: "WorkHub Café" },
  pizza: { password: "pizza2024", label: "The Slice Co." },
};

// ── QR Pattern ────────────────────────────────────────────────────────────────
function QRPattern({ value, faded=false }: { value: string; faded?: boolean }) {
  const SIZE = 21;
  let hash = 5381;
  for (let i=0;i<value.length;i++) hash = ((hash<<5)+hash+value.charCodeAt(i))>>>0;
  const fd=(r:number,c:number,br:number,bc:number)=>{const[lr,lc]=[r-br,c-bc];return(lr===0||lr===6||lc===0||lc===6)||(lr>=2&&lr<=4&&lc>=2&&lc<=4);};
  const dark=(r:number,c:number):boolean=>{
    if(r<7&&c<7)return fd(r,c,0,0);if(r<7&&c>=SIZE-7)return fd(r,c,0,SIZE-7);if(r>=SIZE-7&&c<7)return fd(r,c,SIZE-7,0);
    if((r<8&&c<8)||(r<8&&c>=SIZE-8)||(r>=SIZE-8&&c<8))return false;
    if(r===6)return c%2===0;if(c===6)return r%2===0;return((hash^(r*127+c*31))>>>0)%100>42;
  };
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={`w-full h-full ${faded?"opacity-15 grayscale":""}`} shapeRendering="crispEdges">
      {Array.from({length:SIZE},(_,r)=>Array.from({length:SIZE},(_,c)=>dark(r,c)?<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor"/>:null))}
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
function SeatBtn({ seat, isSelected, isOccupied, onSelect, displayLabel }: {
  seat: Seat; isSelected: boolean; isOccupied: boolean; onSelect: (id:string)=>void; displayLabel?: string;
}) {
  const meta = ZONE_META[seat.zone];
  return (
    <button disabled={isOccupied} onClick={()=>onSelect(seat.id)}
      title={isOccupied?"Occupied":`${seatName(seat)} — $${meta.price}/hr`}
      className={["w-10 h-10 rounded-xl text-[11px] font-mono font-semibold border transition-all duration-150 flex items-center justify-center shrink-0",
        isOccupied  ?"bg-[#ebe8e1] border-[#dedad0] text-[#c4bfb5] cursor-not-allowed"
        :isSelected ?"ring-2 ring-offset-1 shadow-md scale-110 cursor-pointer border-transparent text-white"
                    :"bg-card border-border/70 hover:scale-105 hover:shadow cursor-pointer",
      ].join(" ")}
      style={isSelected?{backgroundColor:meta.hex}:!isOccupied?{color:meta.hex}:undefined}>
      {displayLabel ?? seat.label}
    </button>
  );
}

// ── Hot Desk Zone (Level 1 + 2) ───────────────────────────────────────────────
function HotDeskZone({ occupied, selectedId, onSelect }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; }) {
  const [level, setLevel] = useState<1|2>(1);
  const hex=ZONE_META.hotdesk.hex, light=ZONE_META.hotdesk.light;
  const offset = level===1 ? 0 : 6;
  const tables = Array.from({length:6},(_,t)=>({
    num: t+1+offset,
    seats: HOT_DESK_SEATS.slice((t+offset)*4,(t+offset)*4+4),
  }));

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span style={{color:hex}}><Wifi className="w-3 h-3"/></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{color:hex}}>Hot Desks</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">$8/hr</span>
      </div>
      {/* Level tabs */}
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
      <div className="grid grid-cols-3 gap-x-6 gap-y-5">
        {tables.map(({num,seats:[a,b,c,d]})=>(
          <div key={num} className="flex flex-col items-center gap-[3px]">
            <div className="flex gap-1.5">
              <SeatBtn seat={a} isSelected={selectedId===a.id} isOccupied={occupied.has(a.id)} onSelect={onSelect} displayLabel="A"/>
              <SeatBtn seat={b} isSelected={selectedId===b.id} isOccupied={occupied.has(b.id)} onSelect={onSelect} displayLabel="B"/>
            </div>
            <div className="w-full h-7 rounded-lg border flex items-center justify-center" style={{backgroundColor:light,borderColor:`${hex}35`}}>
              <span className="text-[10px] font-semibold" style={{color:hex}}>L{level}-T{num}</span>
            </div>
            <div className="flex gap-1.5">
              <SeatBtn seat={c} isSelected={selectedId===c.id} isOccupied={occupied.has(c.id)} onSelect={onSelect} displayLabel="C"/>
              <SeatBtn seat={d} isSelected={selectedId===d.id} isOccupied={occupied.has(d.id)} onSelect={onSelect} displayLabel="D"/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Focus Pod Zone (∩ shape) ──────────────────────────────────────────────────
function FocusPodZone({ occupied, selectedId, onSelect }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; }) {
  const [f1,f2,f3,f4,f5,f6,f7,f8]=FOCUS_SEATS;
  const hex=ZONE_META.focus.hex, light=ZONE_META.focus.light;
  const btn=(s:Seat)=><SeatBtn key={s.id} seat={s} isSelected={selectedId===s.id} isOccupied={occupied.has(s.id)} onSelect={onSelect}/>;
  const wsW="calc(2 * 2.5rem + 0.375rem)";
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{color:hex}}><Zap className="w-3 h-3"/></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{color:hex}}>Focus Pods</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">$12/hr</span>
      </div>
      <div className="w-fit mx-auto flex flex-col gap-[3px]">
        <div className="flex gap-1.5">{[f1,f2,f3,f4].map(btn)}</div>
        <div className="flex gap-1.5 items-center">
          {btn(f5)}
          <div className="h-10 rounded-xl border border-dashed flex items-center justify-center" style={{width:wsW,backgroundColor:light,borderColor:`${hex}30`}}>
            <span className="text-[9px] font-mono tracking-[0.18em] font-medium" style={{color:`${hex}70`}}>WORKSPACE</span>
          </div>
          {btn(f6)}
        </div>
        <div className="flex gap-1.5 items-center">
          {btn(f7)}
          <div className="h-10 rounded-xl border border-dashed" style={{width:wsW,backgroundColor:light,borderColor:`${hex}30`}}/>
          {btn(f8)}
        </div>
        <div className="flex justify-center pt-1"><span className="text-[9px] text-muted-foreground tracking-wider">↑ ENTRANCE</span></div>
      </div>
    </div>
  );
}

// ── Private Office Zone ───────────────────────────────────────────────────────
function PrivateOfficeZone({ occupied, selectedId, onSelect }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; }) {
  const hex=ZONE_META.private.hex, light=ZONE_META.private.light;
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{color:hex}}><Lock className="w-3 h-3"/></span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{color:hex}}>Private Offices</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">$20/hr</span>
      </div>
      <div className="flex gap-5 justify-center">
        {PRIVATE_SEATS.map(s=>{
          const isSel=selectedId===s.id, isOcc=occupied.has(s.id);
          return (
            <button key={s.id} disabled={isOcc} onClick={()=>onSelect(s.id)}
              className={["w-[88px] h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all relative overflow-hidden",
                isOcc?"bg-[#ebe8e1] border-[#dedad0] cursor-not-allowed":isSel?"shadow-lg scale-105 cursor-pointer border-transparent":"border-dashed hover:scale-105 cursor-pointer",
              ].join(" ")}
              style={isSel?{backgroundColor:hex,borderColor:hex}:!isOcc?{backgroundColor:light,borderColor:`${hex}40`}:undefined}>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-7 h-9 rounded-t-lg border-2"
                style={{borderColor:isOcc?"#c4bfb5":isSel?"rgba(255,255,255,0.5)":`${hex}50`,borderBottomWidth:0}}>
                <div className="absolute right-1 top-1/2 w-1 h-1 rounded-full" style={{backgroundColor:isOcc?"#c4bfb5":isSel?"rgba(255,255,255,0.7)":hex}}/>
              </div>
              <Building2 className="w-4 h-4 relative z-10" style={{color:isOcc?"#c4bfb5":isSel?"white":hex}}/>
              <span className="text-[11px] font-semibold relative z-10" style={{color:isOcc?"#c4bfb5":isSel?"white":hex}}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Floor Map ─────────────────────────────────────────────────────────────────
function FloorMap({ occupied, selectedId, onSelect, readOnly=false }: { occupied:Set<string>; selectedId:string|null; onSelect:(id:string)=>void; readOnly?:boolean; }) {
  const sel=readOnly?null:selectedId, handler=readOnly?()=>{}:onSelect;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <HotDeskZone   occupied={occupied} selectedId={sel} onSelect={handler}/>
        <FocusPodZone  occupied={occupied} selectedId={sel} onSelect={handler}/>
      </div>
      <PrivateOfficeZone occupied={occupied} selectedId={sel} onSelect={handler}/>
    </div>
  );
}

// ── Date Time Picker (inline sidebar) ─────────────────────────────────────────
function DateTimePicker({ selectedDate, selectedHour, duration, onDateChange, onHourChange, onDurationChange }: {
  selectedDate:string; selectedHour:number|null; duration:number;
  onDateChange:(d:string)=>void; onHourChange:(h:number|null)=>void; onDurationChange:(n:number)=>void;
}) {
  const today = getDateStr(0);
  const curHour = new Date().getHours();
  const dates = Array.from({length:14},(_,i)=>getDateStr(i));
  const hours = Array.from({length:14},(_,i)=>i+8);
  const isHourOk = (h:number) => selectedDate!==today || h>curHour;

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
                  isSel?"bg-primary text-primary-foreground border-primary":"bg-background border-border hover:border-primary/50",
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

      {/* Time — only after date selected */}
      {selectedDate && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Start Time</p>
          <div className="grid grid-cols-2 gap-1">
            {hours.map(h=>{
              const ok=isHourOk(h), isSel=selectedHour===h;
              return (
                <button key={h} disabled={!ok} onClick={()=>onHourChange(h)}
                  className={["rounded-lg py-1.5 text-xs font-mono font-medium border transition-all",
                    !ok?"bg-muted/30 border-border/30 text-muted-foreground/40 cursor-not-allowed"
                    :isSel?"bg-primary text-primary-foreground border-primary"
                          :"bg-background border-border hover:border-primary/50",
                  ].join(" ")}>
                  {fmtHour(h)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Duration — only after time selected */}
      {selectedHour !== null && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Duration</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1,2,3,4,5,6,7,8].map(h=>{
              const endH = selectedHour + h;
              const fits = endH <= 22;
              return (
                <button key={h} disabled={!fits} onClick={()=>onDurationChange(h)}
                  className={["rounded-xl py-2 text-sm font-semibold border transition-all",
                    !fits?"bg-muted/30 border-border/30 text-muted-foreground/40 cursor-not-allowed"
                    :duration===h?"bg-primary text-primary-foreground border-primary shadow"
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
function LandingPage({ onSignUp, onAdminLogin, onVendorLogin }: {
  onSignUp:(c:Customer)=>void; onAdminLogin:()=>void; onVendorLogin:()=>void;
}) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [err, setErr] = useState("");
  function submit(e:React.FormEvent) {
    e.preventDefault();
    if (!name.trim()||!email.trim()){setErr("Please fill in all fields.");return;}
    if (!email.includes("@")){setErr("Please enter a valid email address.");return;}
    onSignUp({name:name.trim(),email:email.trim()});
  }
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center"><MapPin className="w-4 h-4 text-primary-foreground"/></div>
          <span className="font-serif text-xl">WorkHub</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onVendorLogin} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted transition-all">
            <Store className="w-3.5 h-3.5"/>Vendor
          </button>
          <button onClick={onAdminLogin} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted transition-all">
            <Shield className="w-3.5 h-3.5"/>Admin
          </button>
        </div>
      </nav>

      <section className="px-8 py-16 md:py-20 max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-accent/60 text-primary rounded-full px-3 py-1.5 text-xs font-semibold mb-6">
            <Sparkles className="w-3 h-3"/>Now open · City Centre
          </div>
          <h1 className="font-serif text-5xl md:text-[3.5rem] leading-[1.1] mb-5">Your space,<br/>your hours.</h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-8">Book a desk in minutes. Pick your date, time, and zone — get a QR code to check in instantly. Food ordering included.</p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {["Flexible hours","Instant QR check-in","2 hot desk levels","Café & pizza ordering"].map(f=>(
              <span key={f} className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-primary shrink-0"/>{f}</span>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-3xl border border-border p-8 shadow-sm">
          <h2 className="font-serif text-2xl mb-0.5">Get started</h2>
          <p className="text-sm text-muted-foreground mb-6">Enter your details to browse and book a seat</p>
          <form onSubmit={submit} className="space-y-3">
            <input value={name} onChange={e=>{setName(e.target.value);setErr("");}} placeholder="Full name"
              className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
            <input value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} placeholder="Email address" type="email"
              className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
            <AnimatePresence>
              {err&&<motion.p initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="text-xs text-red-600">{err}</motion.p>}
            </AnimatePresence>
            <button type="submit" className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-sm">
              Browse Available Seats <ArrowRight className="w-4 h-4"/>
            </button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">No account needed. Just your name and email.</p>
        </div>
      </section>

      <section className="bg-card border-y border-border px-8 py-14">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif text-3xl text-center mb-1">Choose your zone</h2>
          <p className="text-muted-foreground text-center text-sm mb-8">All zones include high-speed Wi-Fi</p>
          <div className="grid grid-cols-3 gap-4">
            {(["hotdesk","focus","private"] as Zone[]).map(z=>{
              const m=ZONE_META[z];
              return (
                <div key={z} className="rounded-2xl border p-5" style={{backgroundColor:m.light,borderColor:`${m.hex}25`}}>
                  <span style={{color:m.hex}}>{m.icon}</span>
                  <div className="font-semibold mt-2 mb-0.5 text-sm" style={{color:m.hex}}>{m.label}</div>
                  <div className="font-mono text-2xl font-bold" style={{color:m.hex}}>${m.price}<span className="text-sm font-normal font-sans">/hr</span></div>
                  <div className="text-xs mt-2 leading-relaxed" style={{color:`${m.hex}99`}}>
                    {z==="hotdesk"&&"Open tables on 2 levels with power & screens"}
                    {z==="focus"&&"Enclosed cubicle booths for deep focus work"}
                    {z==="private"&&"Fully private room with whiteboard & display"}
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
            {icon:<Timer className="w-5 h-5"/>,title:"Live Session Timer",desc:"Track remaining time from your device. Get notified when your session is about to end."},
          ].map(f=>(
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

// ── Auth page shell ───────────────────────────────────────────────────────────
function AuthShell({ title, subtitle, icon, onBack, children }: { title:string; subtitle:string; icon:React.ReactNode; onBack:()=>void; children:React.ReactNode; }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-card px-8 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4"/>Back
        </button>
      </nav>
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center">{icon}</div>
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
function AdminLoginPage({ accounts, onLogin, onBack, onSignup }: { accounts:AdminAccount[]; onLogin:(a:AdminAccount)=>void; onBack:()=>void; onSignup:()=>void; }) {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [showP,setShowP]=useState(false); const [err,setErr]=useState(false); const [loading,setLoading]=useState(false);
  function submit(e:React.FormEvent) {
    e.preventDefault(); setLoading(true);
    setTimeout(()=>{
      setLoading(false);
      const acct=accounts.find(a=>a.username===u&&a.password===p);
      if(acct)onLogin(acct); else setErr(true);
    },700);
  }
  return (
    <AuthShell title="WorkHub Admin" subtitle="Secure Access" icon={<Shield className="w-5 h-5 text-primary-foreground"/>} onBack={onBack}>
      <div className="bg-card rounded-3xl border border-border p-7 shadow-sm">
        <h1 className="font-serif text-2xl mb-0.5">Sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">Admin and reception staff only</p>
        <form onSubmit={submit} className="space-y-3">
          <input value={u} onChange={e=>{setU(e.target.value);setErr(false);}} placeholder="Username" autoComplete="username"
            className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
          <div className="relative">
            <input value={p} onChange={e=>{setP(e.target.value);setErr(false);}} type={showP?"text":"password"} placeholder="••••••••"
              className="w-full bg-background rounded-xl px-4 py-3 pr-10 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
            <button type="button" onClick={()=>setShowP(!showP)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showP?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
            </button>
          </div>
          <AnimatePresence>
            {err&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 shrink-0"/>Incorrect username or password.
              </div>
            </motion.div>}
          </AnimatePresence>
          <button type="submit" disabled={loading||!u||!p}
            className={["w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
              u&&p&&!loading?"bg-primary text-primary-foreground hover:opacity-90 shadow-sm":"bg-muted text-muted-foreground cursor-not-allowed",
            ].join(" ")}>
            {loading?<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>Verifying…</>:"Sign in to Admin Panel"}
          </button>
        </form>
        <div className="mt-5 pt-4 border-t border-border text-center space-y-2">
          <p className="text-xs text-muted-foreground">Demo: <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">admin</span> / <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">workhub2024</span></p>
          <button onClick={onSignup} className="text-xs text-primary underline underline-offset-2 hover:opacity-70 transition-opacity">Create new admin account →</button>
        </div>
      </div>
    </AuthShell>
  );
}

// ── Admin Signup ──────────────────────────────────────────────────────────────
function AdminSignupPage({ onCreated, onBack }: { onCreated:(a:AdminAccount)=>void; onBack:()=>void; }) {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [p2,setP2]=useState(""); const [role,setRole]=useState<"super"|"reception">("reception"); const [err,setErr]=useState("");
  function submit(e:React.FormEvent) {
    e.preventDefault();
    if(!u.trim()||!p.trim()){setErr("All fields are required.");return;}
    if(p!==p2){setErr("Passwords do not match.");return;}
    if(p.length<6){setErr("Password must be at least 6 characters.");return;}
    const acct:AdminAccount={id:`a${Date.now()}`,username:u.trim(),password:p,role,createdAt:new Date()};
    onCreated(acct);
  }
  return (
    <AuthShell title="Create Account" subtitle="Admin Registration" icon={<UserPlus className="w-5 h-5 text-primary-foreground"/>} onBack={onBack}>
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
              {([["reception","Reception"],["super","Super Admin"]] as [typeof role, string][]).map(([r,l])=>(
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
function VendorLoginPage({ onLogin, onBack }: { onLogin:(v:VendorType)=>void; onBack:()=>void; }) {
  const [vendor, setVendor] = useState<VendorType>("cafe");
  const [p,setP]=useState(""); const [showP,setShowP]=useState(false); const [err,setErr]=useState(false); const [loading,setLoading]=useState(false);
  function submit(e:React.FormEvent) {
    e.preventDefault(); setLoading(true);
    setTimeout(()=>{
      setLoading(false);
      if(p===VENDOR_CREDS[vendor].password)onLogin(vendor); else setErr(true);
    },700);
  }
  return (
    <AuthShell title="Vendor Portal" subtitle="Partner Access" icon={<Store className="w-5 h-5 text-primary-foreground"/>} onBack={onBack}>
      <div className="bg-card rounded-3xl border border-border p-7 shadow-sm">
        <h1 className="font-serif text-2xl mb-0.5">Vendor sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">Manage your menu and incoming orders</p>
        <div className="flex gap-2 mb-4">
          {(["cafe","pizza"] as VendorType[]).map(v=>(
            <button key={v} type="button" onClick={()=>{setVendor(v);setErr(false);setP("");}}
              className={["flex-1 py-2 rounded-xl text-sm border font-medium transition-all capitalize",
                vendor===v?"bg-primary text-primary-foreground border-primary":"bg-background border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}>{VENDOR_CREDS[v].label}</button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <input value={p} onChange={e=>{setP(e.target.value);setErr(false);}} type={showP?"text":"password"} placeholder="Password"
              className="w-full bg-background rounded-xl px-4 py-3 pr-10 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
            <button type="button" onClick={()=>setShowP(!showP)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showP?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
            </button>
          </div>
          <AnimatePresence>
            {err&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2"><XCircle className="w-3.5 h-3.5 shrink-0"/>Incorrect password.</div>
            </motion.div>}
          </AnimatePresence>
          <button type="submit" disabled={loading||!p}
            className={["w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
              p&&!loading?"bg-primary text-primary-foreground hover:opacity-90":"bg-muted text-muted-foreground cursor-not-allowed",
            ].join(" ")}>
            {loading?<><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>Verifying…</>:"Sign In"}
          </button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-4">Demo passwords: <span className="font-mono">cafe2024</span> / <span className="font-mono">pizza2024</span></p>
      </div>
    </AuthShell>
  );
}

// ── Food Menu Page ────────────────────────────────────────────────────────────
function FoodMenuPage({ booking, menuItems, cart, onCartChange, onCheckout, onBack }: {
  booking: Booking|null; menuItems: FoodItem[]; cart: CartItem[];
  onCartChange:(item:FoodItem,delta:number)=>void; onCheckout:()=>void; onBack:()=>void;
}) {
  const [activeVendor, setActiveVendor] = useState<VendorType>("cafe");
  const vendorItems = menuItems.filter(i=>i.vendor===activeVendor&&i.available);
  const categories = [...new Set(vendorItems.map(i=>i.category))];
  const cartTotal = cart.reduce((s,c)=>s+c.item.price*c.qty,0);
  const cartCount = cart.reduce((s,c)=>s+c.qty,0);
  const fee = Math.round(cartTotal*0.1);

  return (
    <div className="min-h-screen bg-background flex flex-col">
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

      <div className="flex flex-1 min-h-0">
        {/* Menu */}
        <div className="flex-1 overflow-auto p-6">
          {/* Vendor tabs */}
          <div className="flex gap-2 mb-6">
            {([["cafe","☕ WorkHub Café"],["pizza","🍕 The Slice Co."]] as [VendorType,string][]).map(([v,l])=>(
              <button key={v} onClick={()=>setActiveVendor(v)}
                className={["flex-1 max-w-[200px] py-2.5 rounded-xl text-sm font-semibold border transition-all",
                  activeVendor===v?"bg-primary text-primary-foreground border-primary shadow":"bg-card border-border hover:border-primary/40",
                ].join(" ")}>{l}</button>
            ))}
          </div>

          {categories.map(cat=>(
            <div key={cat} className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{cat}</h3>
              <div className="space-y-2">
                {vendorItems.filter(i=>i.category===cat).map(item=>{
                  const inCart=cart.find(c=>c.item.id===item.id);
                  return (
                    <div key={item.id} className="bg-card rounded-xl border border-border p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-primary font-mono text-sm font-semibold mt-0.5">${item.price.toFixed(2)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {inCart ? (
                          <>
                            <button onClick={()=>onCartChange(item,-1)} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"><Minus className="w-3.5 h-3.5"/></button>
                            <span className="font-mono font-semibold text-sm w-4 text-center">{inCart.qty}</span>
                            <button onClick={()=>onCartChange(item,1)} className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"><Plus className="w-3.5 h-3.5"/></button>
                          </>
                        ) : (
                          <button onClick={()=>onCartChange(item,1)} className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity">
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
        <div className="w-72 bg-card border-l border-border flex flex-col">
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
                        <div className="text-xs text-muted-foreground">${c.item.price.toFixed(2)} × {c.qty}</div>
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
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${cartTotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Service fee (10%)</span><span>${fee.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-2"><span>Total</span><span className="text-primary">${(cartTotal+fee).toFixed(2)}</span></div>
              </div>
              <button onClick={onCheckout} className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity">
                Checkout →
              </button>
            </div>
          )}
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
  const fee = Math.round(cartTotal*0.1);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
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
              <span>{c.item.name} × {c.qty}</span><span>${(c.item.price*c.qty).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-muted-foreground border-t border-border pt-2"><span>Service fee</span><span>${fee.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span className="text-primary">${(cartTotal+fee).toFixed(2)}</span></div>
        </div>

        <button disabled={!delivery} onClick={()=>delivery&&onConfirm(delivery)}
          className={["w-full rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
            delivery?"bg-primary text-primary-foreground hover:opacity-90 shadow":"bg-muted text-muted-foreground cursor-not-allowed",
          ].join(" ")}>
          Pay ${(cartTotal+fee).toFixed(2)} <ChevronRight className="w-4 h-4"/>
        </button>
      </motion.div>
    </div>
  );
}

// ── Vendor Portal ─────────────────────────────────────────────────────────────
function VendorPortal({ vendor, menuItems, foodOrders, onMenuChange, onOrderComplete, onAddItem, onLogout }: {
  vendor:VendorType; menuItems:FoodItem[]; foodOrders:FoodOrder[];
  onMenuChange:(id:string,available:boolean)=>void;
  onOrderComplete:(id:string)=>void;
  onAddItem:(item:Omit<FoodItem,"id">)=>void;
  onLogout:()=>void;
}) {
  const [tab, setTab] = useState<VendorTab>("menu");
  const myItems = menuItems.filter(i=>i.vendor===vendor);
  const myOrders = foodOrders.filter(o=>o.vendor===vendor);
  const pendingCount = myOrders.filter(o=>o.status==="pending"||o.status==="preparing").length;

  // Add item form
  const [newName,setNewName]=useState(""); const [newCat,setNewCat]=useState(""); const [newPrice,setNewPrice]=useState(""); const [adding,setAdding]=useState(false);
  function addItem(e:React.FormEvent) {
    e.preventDefault();
    if(!newName.trim()||!newCat.trim()||!newPrice)return;
    onAddItem({name:newName.trim(),category:newCat.trim(),price:parseFloat(newPrice),vendor,available:true});
    setNewName("");setNewCat("");setNewPrice("");setAdding(false);
  }

  const categories = [...new Set(myItems.map(i=>i.category))];
  const statusColor:Record<string,string>={pending:"bg-amber-100 text-amber-700",preparing:"bg-blue-100 text-blue-700",ready:"bg-emerald-100 text-emerald-700",completed:"bg-gray-100 text-gray-500"};

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"><Store className="w-4 h-4 text-primary-foreground"/></div>
          <div>
            <div className="font-serif text-xl leading-tight">{VENDOR_CREDS[vendor].label}</div>
            <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Vendor Dashboard</div>
          </div>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted transition-all">
          <LogOut className="w-3.5 h-3.5"/>Sign out
        </button>
      </header>

      <div className="bg-card border-b border-border px-6">
        <div className="flex">
          {([
            {key:"menu",label:"Menu Management"},
            {key:"orders",label:`Incoming Orders${pendingCount>0?` (${pendingCount})`:""}`,},
          ] as {key:VendorTab;label:string}[]).map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={["px-4 py-3.5 text-sm border-b-2 transition-colors",
                tab===t.key?"border-primary text-primary font-medium":"border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* MENU TAB */}
        {tab==="menu"&&(
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-serif text-2xl mb-0.5">Menu Items</h2>
                <p className="text-sm text-muted-foreground">{myItems.filter(i=>i.available).length} of {myItems.length} items available</p>
              </div>
              <button onClick={()=>setAdding(!adding)} className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4"/>Add Item
              </button>
            </div>

            <AnimatePresence>
              {adding&&(
                <motion.form onSubmit={addItem} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                  className="bg-card rounded-2xl border border-primary/30 p-5 mb-5 space-y-3">
                  <h3 className="font-semibold text-sm">New Menu Item</h3>
                  <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Item name"
                    className="w-full bg-background rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Category (e.g. Coffee)"
                      className="bg-background rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:text-muted-foreground"/>
                    <input value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="Price (e.g. 4.50)" type="number" step="0.50" min="0"
                      className="bg-background rounded-xl px-4 py-2.5 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono transition-colors placeholder:font-sans placeholder:text-muted-foreground"/>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-primary text-primary-foreground rounded-xl py-2 text-sm font-semibold hover:opacity-90 transition-opacity">Save Item</button>
                    <button type="button" onClick={()=>setAdding(false)} className="px-4 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {categories.map(cat=>(
              <div key={cat} className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</h3>
                <div className="space-y-2">
                  {myItems.filter(i=>i.category===cat).map(item=>(
                    <div key={item.id} className="bg-card rounded-xl border border-border p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <div className={["font-medium text-sm",!item.available?"line-through text-muted-foreground":""].join(" ")}>{item.name}</div>
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">${item.price.toFixed(2)}</div>
                      </div>
                      <button onClick={()=>onMenuChange(item.id,!item.available)}
                        className={["flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all",
                          item.available?"bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                                        :"bg-red-50 border-red-200 text-red-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700",
                        ].join(" ")}>
                        {item.available?<ToggleRight className="w-3.5 h-3.5"/>:<ToggleLeft className="w-3.5 h-3.5"/>}
                        {item.available?"Available":"Unavailable"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ORDERS TAB */}
        {tab==="orders"&&(
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl mb-1">Incoming Orders</h2>
            <p className="text-sm text-muted-foreground mb-5">{myOrders.length} orders today</p>

            {myOrders.length===0?(
              <div className="bg-card rounded-2xl border border-border p-12 text-center">
                <ShoppingBag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3"/>
                <p className="text-muted-foreground text-sm">No orders yet. They'll appear here when customers order.</p>
              </div>
            ):(
              <div className="space-y-4">
                {[...myOrders].sort((a,b)=>b.placedAt.getTime()-a.placedAt.getTime()).map(order=>{
                  const mins=Math.floor((Date.now()-order.placedAt.getTime())/60000);
                  return (
                    <div key={order.id} className="bg-card rounded-2xl border border-border p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold">{order.customerName}</span>
                            <span className={["text-[10px] rounded-full px-2 py-0.5 font-medium capitalize",statusColor[order.status]??"bg-gray-100 text-gray-500"].join(" ")}>{order.status}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{order.id}</span>
                            <span>·</span>
                            <span>Seat {order.seatId}</span>
                            <span>·</span>
                            <span>{order.delivery==="table"?"🚚 Deliver to seat":"🏃 Pickup"}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-primary">${order.total.toFixed(2)}</div>
                          <div className="text-[10px] text-muted-foreground">{mins}m ago</div>
                        </div>
                      </div>

                      <div className="space-y-1 mb-4">
                        {order.lines.map(l=>(
                          <div key={l.itemId} className="flex justify-between text-sm text-muted-foreground">
                            <span>{l.name} × {l.qty}</span>
                            <span>${(l.price*l.qty).toFixed(2)}</span>
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
      </div>
    </div>
  );
}

// ── App Header (reusable) ─────────────────────────────────────────────────────
function AppHeader({ customer, onAdminLogin, onBack }: { customer:Customer|null; onAdminLogin:()=>void; onBack:()=>void; }) {
  return (
    <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
      <button onClick={onBack} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"><MapPin className="w-4 h-4 text-primary-foreground"/></div>
        <div className="text-left">
          <div className="font-serif text-xl leading-tight">WorkHub</div>
          <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">Coworking Space</div>
        </div>
      </button>
      <div className="flex items-center gap-3">
        {customer&&<span className="text-xs text-muted-foreground">Hello, <span className="font-medium text-foreground">{customer.name.split(" ")[0]}</span></span>}
        <button onClick={onAdminLogin} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted transition-all">
          <Shield className="w-3.5 h-3.5"/>Admin
        </button>
      </div>
    </header>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // ── View & auth ──
  const [view,      setView]      = useState<AppView>("landing");
  const [adminTab,  setAdminTab]  = useState<AdminTab>("scan");
  const [customer,  setCustomer]  = useState<Customer|null>(null);
  const [adminAuth, setAdminAuth] = useState<AdminAccount|null>(null);
  const [vendorAuth,setVendorAuth]= useState<VendorType|null>(null);

  // ── Booking selection ──
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedHour, setSelectedHour] = useState<number|null>(null);
  const [selectedId,   setSelectedId]   = useState<string|null>(null);
  const [duration,     setDuration]     = useState(2);

  // ── Bookings ──
  const [booking,     setBooking]     = useState<Booking|null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>(INITIAL_BOOKINGS);
  const [secsLeft,    setSecsLeft]    = useState(0);

  // ── Food ──
  const [menuItems,  setMenuItems]  = useState<FoodItem[]>(DEFAULT_MENU);
  const [cart,       setCart]       = useState<CartItem[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>(INITIAL_FOOD_ORDERS);
  const [foodView,   setFoodView]   = useState<"menu"|"checkout">("menu");

  // ── Admin ──
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>(DEFAULT_ADMIN_ACCOUNTS);
  const [custFilter,    setCustFilter]    = useState({date:"",hour:"",status:""});
  const [availDate,     setAvailDate]     = useState("");
  const [availHour,     setAvailHour]     = useState<number|null>(null);
  const [availDur,      setAvailDur]      = useState(1);

  // ── Scan ──
  const [scanInput, setScanInput] = useState("");
  const [scanState, setScanState] = useState<"idle"|"valid"|"invalid"|"checkedIn">("idle");

  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Derived ──
  const seat    = SEATS.find(s=>s.id===selectedId)??null;
  const meta    = seat?ZONE_META[seat.zone]:null;
  const subtotal= seat?ZONE_META[seat.zone].price*duration:0;
  const fee     = Math.round(subtotal*0.1);
  const grand   = subtotal+fee;
  const pct     = booking?secsLeft/(booking.duration*3600):1;
  const warning = secsLeft>0&&(pct<0.2||secsLeft<=900);

  const occupied = useMemo(()=>{
    if (!selectedDate||selectedHour===null) return new Set<string>();
    return getOccupied(allBookings, selectedDate, selectedHour, duration);
  },[allBookings,selectedDate,selectedHour,duration]);

  const availOccupied = useMemo(()=>{
    if (!availDate||availHour===null) return new Set<string>();
    return getOccupied(allBookings, availDate, availHour, availDur);
  },[allBookings,availDate,availHour,availDur]);

  // Filtered bookings for admin
  const filteredBookings = useMemo(()=>{
    return allBookings.filter(b=>{
      if (custFilter.date&&b.date!==custFilter.date) return false;
      if (custFilter.hour&&b.startHour!==parseInt(custFilter.hour)) return false;
      if (custFilter.status&&b.status!==custFilter.status) return false;
      return true;
    }).sort((a,b)=>a.date.localeCompare(b.date)||a.startHour-b.startHour);
  },[allBookings,custFilter]);

  useEffect(()=>()=>{timerRef.current&&clearInterval(timerRef.current)},[]);

  const startTimer = useCallback((b:Booking)=>{
    const updated={...b,status:"active" as const,checkInAt:new Date()};
    setBooking(updated);
    setAllBookings(prev=>prev.map(x=>x.ref===b.ref?updated:x));
    setSecsLeft(b.duration*3600);
    setView("active");
    timerRef.current=setInterval(()=>{
      setSecsLeft(prev=>{if(prev<=1){clearInterval(timerRef.current!);setView("expired");return 0;}return prev-1;});
    },1000);
  },[]);

  function handlePay() {
    if(!seat||!customer||!selectedDate||selectedHour===null)return;
    const b:Booking={ref:genRef(),seatId:seat.id,date:selectedDate,startHour:selectedHour,duration,name:customer.name,email:customer.email,paidAt:new Date(),status:"paid"};
    setBooking(b);
    setAllBookings(prev=>[...prev,b]);
    setView("qr");
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

  function handleFoodOrder(delivery:"table"|"pickup") {
    if(!booking||cart.length===0)return;
    const byVendor=["cafe","pizza"] as VendorType[];
    byVendor.forEach(v=>{
      const vCart=cart.filter(c=>c.item.vendor===v);
      if(vCart.length===0)return;
      const total=vCart.reduce((s,c)=>s+c.item.price*c.qty,0);
      const fee2=Math.round(total*0.1);
      const order:FoodOrder={
        id:genFoodRef(), bookingRef:booking.ref, seatId:booking.seatId,
        customerName:booking.name,
        lines:vCart.map(c=>({itemId:c.item.id,name:c.item.name,price:c.item.price,qty:c.qty})),
        delivery, total:total+fee2, status:"pending", placedAt:new Date(), vendor:v,
      };
      setFoodOrders(prev=>[...prev,order]);
    });
    setCart([]);
    setFoodView("menu");
    setView(booking.status==="active"?"active":"qr");
  }

  function handleScan() {
    const code=scanInput.trim().toUpperCase();
    if(!code)return;
    const found=allBookings.find(b=>b.ref===code);
    if(!found){setScanState("invalid");return;}
    if(found.status==="active"){setScanState("checkedIn");return;}
    if(found.status==="expired"){setScanState("invalid");return;}
    setScanState("valid");
  }

  function handleCheckIn() {
    const code=scanInput.trim().toUpperCase();
    const found=allBookings.find(b=>b.ref===code&&b.status==="paid");
    if(!found)return;
    startTimer(found);
    if(booking?.ref===code){}; // already set via startTimer
    setScanInput("");setScanState("idle");
  }

  function adminBack() {
    if(booking?.status==="active")return setView("active");
    if(booking?.status==="paid")return setView("qr");
    return setView(customer?"book":"landing");
  }

  // ── VIEWS ──────────────────────────────────────────────────────────────────

  if(view==="landing") return <LandingPage onSignUp={c=>{setCustomer(c);setView("book");}} onAdminLogin={()=>setView("adminLogin")} onVendorLogin={()=>setView("vendorLogin")}/>;
  if(view==="adminLogin") return <AdminLoginPage accounts={adminAccounts} onLogin={a=>{setAdminAuth(a);setView("admin");}} onBack={()=>setView(customer?"book":"landing")} onSignup={()=>setView("adminSignup")}/>;
  if(view==="adminSignup") return <AdminSignupPage onCreated={a=>{setAdminAccounts(prev=>[...prev,a]);setView("adminLogin");}} onBack={()=>setView("adminLogin")}/>;
  if(view==="vendorLogin") return <VendorLoginPage onLogin={v=>{setVendorAuth(v);setView("vendor");}} onBack={()=>setView("landing")}/>;

  // ── VENDOR ──────────────────────────────────────────────────────────────────
  if(view==="vendor"&&vendorAuth) return (
    <VendorPortal vendor={vendorAuth} menuItems={menuItems} foodOrders={foodOrders}
      onMenuChange={(id,avail)=>setMenuItems(prev=>prev.map(i=>i.id===id?{...i,available:avail}:i))}
      onOrderComplete={id=>setFoodOrders(prev=>prev.map(o=>o.id===id?{...o,status:"completed"}:o))}
      onAddItem={item=>setMenuItems(prev=>[...prev,{...item,id:`custom-${Date.now()}`}])}
      onLogout={()=>{setVendorAuth(null);setView("vendorLogin");}}
    />
  );

  // ── FOOD ─────────────────────────────────────────────────────────────────────
  if(view==="food") {
    if(foodView==="checkout") return (
      <FoodCheckoutPage booking={booking} cart={cart}
        onConfirm={handleFoodOrder}
        onBack={()=>setFoodView("menu")}
      />
    );
    return (
      <FoodMenuPage booking={booking} menuItems={menuItems} cart={cart}
        onCartChange={handleCartChange}
        onCheckout={()=>setFoodView("checkout")}
        onBack={()=>setView(booking?.status==="active"?"active":"qr")}
      />
    );
  }

  // ── BOOK ─────────────────────────────────────────────────────────────────────
  if(view==="book") return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader customer={customer} onAdminLogin={()=>setView("adminLogin")} onBack={()=>setView("landing")}/>
      <div className="flex flex-1 min-h-0">
        {/* Floor map */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-5">
            <h1 className="font-serif text-2xl mb-0.5">Choose Your Seat</h1>
            <p className="text-sm text-muted-foreground">Select a date, time and seat — all zones include Wi-Fi</p>
          </div>
          {selectedDate&&selectedHour!==null ? (
            <>
              <FloorMap occupied={occupied} selectedId={selectedId} onSelect={id=>{if(!occupied.has(id))setSelectedId(id);}}/>
              <div className="flex items-center gap-5 mt-5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-[#ebe8e1] border border-[#dedad0]"/>Occupied</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-card border border-border"/>Available</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-primary"/>Selected</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 rounded-2xl border-2 border-dashed border-border bg-card/50">
              <div className="text-center">
                <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3"/>
                <p className="text-sm text-muted-foreground">Select a date and start time<br/>to view seat availability</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-[300px] bg-card border-l border-border flex flex-col">
          <div className="px-5 py-5 border-b border-border">
            <h2 className="font-serif text-xl">Your Booking</h2>
          </div>
          <div className="flex-1 overflow-auto p-5 space-y-5">
            <DateTimePicker
              selectedDate={selectedDate} selectedHour={selectedHour} duration={duration}
              onDateChange={d=>{setSelectedDate(d);setSelectedHour(null);setSelectedId(null);}}
              onHourChange={h=>{setSelectedHour(h);setSelectedId(null);}}
              onDurationChange={n=>{setDuration(n);setSelectedId(null);}}
            />

            {selectedDate&&selectedHour!==null&&(
              <>
                {seat&&meta ? (
                  <div className="rounded-xl p-4 border" style={{backgroundColor:meta.light,borderColor:`${meta.hex}30`}}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span style={{color:meta.hex}}>{meta.icon}</span>
                      <span className="text-xs font-semibold" style={{color:meta.hex}}>{meta.label}</span>
                    </div>
                    <div className="font-serif text-xl" style={{color:meta.hex}}>{seatName(seat)}</div>
                    <div className="text-xs mt-1" style={{color:`${meta.hex}99`}}>
                      {fmtHour(selectedHour)} – {fmtHour(selectedHour+duration)} · {duration}h
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    Click any available seat on the map
                  </div>
                )}

                {seat&&(
                  <div className="space-y-2 text-sm border-t border-border pt-4">
                    <div className="flex justify-between text-muted-foreground"><span>{meta?.label} × {duration}h</span><span>${subtotal}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Service fee (10%)</span><span>${fee}</span></div>
                    <div className="flex justify-between font-bold text-base border-t border-border pt-2.5"><span>Total</span><span className="text-primary">${grand}</span></div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-5 border-t border-border">
            <button disabled={!seat||!selectedDate||selectedHour===null} onClick={()=>setView("pay")}
              className={["w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all",
                seat&&selectedDate&&selectedHour!==null?"bg-primary text-primary-foreground hover:opacity-90 shadow-sm":"bg-muted text-muted-foreground cursor-not-allowed",
              ].join(" ")}>
              Continue to Payment <ChevronRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── PAY ───────────────────────────────────────────────────────────────────
  if(view==="pay") return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="w-full max-w-md">
        <button onClick={()=>setView("book")} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4"/>Back to seat map
        </button>
        <h1 className="font-serif text-3xl mb-0.5">Complete Your Booking</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {seat?seatName(seat):""} · {selectedDate?fmtDateLabel(selectedDate).day+" "+fmtDateLabel(selectedDate).num+" "+fmtDateLabel(selectedDate).month:""} · {selectedHour!==null?fmtHour(selectedHour):""} · {duration}h
        </p>
        <div className="space-y-3 mb-4">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your Details</p>
            <input value={customer?.name??""} readOnly className="w-full bg-muted/50 rounded-xl px-4 py-3 text-sm border border-border"/>
            <input value={customer?.email??""} readOnly className="w-full bg-muted/50 rounded-xl px-4 py-3 text-sm border border-border"/>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment</p>
            <input placeholder="Card number" defaultValue="4242 4242 4242 4242" className="w-full bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono placeholder:font-sans transition-colors placeholder:text-muted-foreground"/>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="MM / YY" defaultValue="08 / 28" className="bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono placeholder:font-sans transition-colors placeholder:text-muted-foreground"/>
              <input placeholder="CVC" defaultValue="123" className="bg-background rounded-xl px-4 py-3 text-sm border border-border focus:border-primary/50 focus:outline-none font-mono placeholder:font-sans transition-colors placeholder:text-muted-foreground"/>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-1.5"><span>Subtotal</span><span>${subtotal}</span></div>
            <div className="flex justify-between text-sm text-muted-foreground mb-2.5"><span>Service fee (10%)</span><span>${fee}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-border pt-2.5"><span>Total</span><span className="text-primary">${grand}</span></div>
          </div>
        </div>
        <button onClick={handlePay} className="w-full rounded-xl py-3.5 text-sm font-semibold bg-primary text-primary-foreground flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow">
          Pay ${grand} & Get QR Code <ChevronRight className="w-4 h-4"/>
        </button>
      </motion.div>
    </div>
  );

  // ── QR ────────────────────────────────────────────────────────────────────
  if(view==="qr"&&booking) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
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
            ["Seat",      seat?seatName(seat):""],
            ["Date",      selectedDate?fmtDateFull(selectedDate):""],
            ["Time",      selectedHour!==null?`${fmtHour(selectedHour)} – ${fmtHour(selectedHour+booking.duration)}`:""],
            ["Duration",  `${booking.duration}h`],
            ["Total Paid",`$${grand}`],
          ] as [string,string][]).map(([k,v])=>(
            <div key={k} className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{k}</span><span className="font-medium text-right">{v}</span></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={()=>{setFoodView("menu");setView("food");}}
            className="bg-accent text-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-accent/80 transition-colors flex items-center justify-center gap-1.5">
            <UtensilsCrossed className="w-4 h-4"/>Order Food
          </button>
          <button onClick={()=>setView("adminLogin")} className="border border-border rounded-xl py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Admin Check-in →
          </button>
        </div>
      </motion.div>
    </div>
  );

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if(view==="active"&&booking) {
    const endTime=booking.checkInAt?new Date(booking.checkInAt.getTime()+booking.duration*3600000).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"--";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
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
                ["Checked in",booking.checkInAt?.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})??"--"],
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
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{opacity:0,scale:0.94}} animate={{opacity:1,scale:1}} className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5"><XCircle className="w-7 h-7 text-red-500"/></div>
        <h1 className="font-serif text-3xl mb-2">Session Ended</h1>
        <p className="text-sm text-muted-foreground mb-6">Your {booking.duration}-hour session has concluded. This QR code is now invalid.</p>
        <div className="bg-card rounded-3xl border border-border p-6 mb-5 shadow-sm">
          <div className="w-40 h-40 mx-auto mb-4 text-foreground"><QRPattern value={booking.ref} faded/></div>
          <div className="font-mono text-base text-muted-foreground line-through tracking-widest">{booking.ref}</div>
          <div className="inline-flex items-center gap-1.5 mt-2.5 bg-red-50 border border-red-100 text-red-600 rounded-full px-3 py-1 text-xs font-semibold"><XCircle className="w-3 h-3"/>INVALID</div>
        </div>
        <button onClick={()=>{setBooking(null);setSelectedId(null);setSelectedDate("");setSelectedHour(null);setView("book");}}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold hover:opacity-90 transition-opacity shadow">
          Book Another Seat
        </button>
      </motion.div>
    </div>
  );

  // ── ADMIN ──────────────────────────────────────────────────────────────────
  if(view==="admin"&&adminAuth) return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"><Shield className="w-4 h-4 text-primary-foreground"/></div>
          <div>
            <div className="font-serif text-xl leading-tight">WorkHub Admin</div>
            <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">{adminAuth.role==="super"?"Super Admin":"Reception"} · {adminAuth.username}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={adminBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border bg-card rounded-lg px-3 py-1.5 hover:bg-muted transition-all">
            <ArrowLeft className="w-3.5 h-3.5"/>Customer View
          </button>
          <button onClick={()=>{setAdminAuth(null);setView("adminLogin");}} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 flex items-center gap-1">
            <LogOut className="w-3.5 h-3.5"/>Sign out
          </button>
        </div>
      </header>

      <div className="bg-card border-b border-border px-6">
        <div className="flex overflow-x-auto" style={{scrollbarWidth:"none"}}>
          {([
            {key:"scan",      label:"Scan QR"},
            {key:"customers", label:`Customers (${allBookings.length})`},
            {key:"availability",label:"Availability"},
            {key:"accounts",  label:"Accounts"},
          ] as {key:AdminTab;label:string}[]).map(t=>(
            <button key={t.key} onClick={()=>setAdminTab(t.key)}
              className={["shrink-0 px-4 py-3.5 text-sm border-b-2 transition-colors",
                adminTab===t.key?"border-primary text-primary font-medium":"border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* SCAN */}
        {adminTab==="scan"&&(
          <div className="max-w-md mx-auto">
            <h2 className="font-serif text-2xl mb-1">Validate Customer</h2>
            <p className="text-sm text-muted-foreground mb-6">Enter or scan a booking reference to check in a customer and start their timer.</p>
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex gap-2.5">
                <input value={scanInput} onChange={e=>{setScanInput(e.target.value.toUpperCase());setScanState("idle");}}
                  placeholder="e.g. CW-7734" onKeyDown={e=>e.key==="Enter"&&handleScan()}
                  className="flex-1 bg-background rounded-xl px-4 py-3 text-sm font-mono tracking-wider border border-border focus:border-primary/50 focus:outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground"/>
                <button onClick={handleScan} className="bg-primary text-primary-foreground px-4 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1.5 text-sm font-medium">
                  <ScanLine className="w-4 h-4"/>Scan
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
                            <div className="flex justify-between"><span>Seat</span><span className="font-medium font-mono text-emerald-900">{found.seatId}</span></div>
                            <div className="flex justify-between"><span>Date</span><span className="font-medium text-emerald-900">{fmtDateFull(found.date)}</span></div>
                            <div className="flex justify-between"><span>Time</span><span className="font-medium text-emerald-900">{fmtHour(found.startHour)} · {found.duration}h</span></div>
                          </div>
                        ):null;})()}
                        <button onClick={handleCheckIn} className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4"/>Check In & Start Timer
                        </button>
                      </div>
                    )}
                    {scanState==="checkedIn"&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700"><div className="flex items-center gap-2 font-semibold mb-1"><Timer className="w-4 h-4"/>Already checked in</div><p className="text-blue-600/80 text-xs">This customer has an active session.</p></div>}
                    {scanState==="invalid"&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><div className="flex items-center gap-2 font-semibold mb-1"><XCircle className="w-4 h-4"/>Invalid or expired</div><p className="text-red-600/80 text-xs">No valid booking found for this reference.</p></div>}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">Recent paid bookings:</p>
                <div className="flex flex-wrap gap-1.5">
                  {allBookings.filter(b=>b.status==="paid").slice(0,6).map(b=>(
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
                <option value="paid">Paid</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
              </select>
              {(custFilter.date||custFilter.hour||custFilter.status)&&(
                <button onClick={()=>setCustFilter({date:"",hour:"",status:""})} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Clear filters</button>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    {["Ref","Customer","Date","Start","Duration","End","Seat","Zone","Status"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b,i)=>{
                    const bSeat=SEATS.find(s=>s.id===b.seatId);
                    const statusCls={paid:"bg-amber-100 text-amber-700",active:"bg-emerald-100 text-emerald-700",expired:"bg-gray-100 text-gray-500"};
                    return (
                      <tr key={b.ref} className={["border-b border-border/50 hover:bg-muted/20 transition-colors",i%2===0?"":"bg-muted/10"].join(" ")}>
                        <td className="px-4 py-3 font-mono text-xs">{b.ref}</td>
                        <td className="px-4 py-3"><div className="font-medium text-xs">{b.name}</div><div className="text-[10px] text-muted-foreground">{b.email}</div></td>
                        <td className="px-4 py-3 text-xs">{fmtDateLabel(b.date).day} {fmtDateLabel(b.date).num} {fmtDateLabel(b.date).month}</td>
                        <td className="px-4 py-3 font-mono text-xs">{fmtHour(b.startHour)}</td>
                        <td className="px-4 py-3 text-xs">{b.duration}h</td>
                        <td className="px-4 py-3 font-mono text-xs">{fmtHour(b.startHour+b.duration)}</td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{b.seatId}</td>
                        <td className="px-4 py-3 text-xs">{bSeat?ZONE_META[bSeat.zone].label:"–"}</td>
                        <td className="px-4 py-3"><span className={["text-[10px] rounded-full px-2 py-0.5 font-medium capitalize",statusCls[b.status]].join(" ")}>{b.status}</span></td>
                      </tr>
                    );
                  })}
                  {filteredBookings.length===0&&(
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">No bookings match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AVAILABILITY */}
        {adminTab==="availability"&&(
          <div>
            <h2 className="font-serif text-2xl mb-1">Seat Availability</h2>
            <p className="text-sm text-muted-foreground mb-5">Filter by date, time and duration to see what's available</p>

            {/* Filter bar */}
            <div className="bg-card rounded-2xl border border-border p-4 mb-5 flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Date</label>
                <div className="flex gap-1 overflow-x-auto" style={{scrollbarWidth:"none",maxWidth:"320px"}}>
                  {Array.from({length:14},(_,i)=>getDateStr(i)).map(d=>{
                    const {day,num}=fmtDateLabel(d);
                    return (
                      <button key={d} onClick={()=>setAvailDate(d===availDate?"":d)}
                        className={["shrink-0 flex flex-col items-center rounded-xl px-2 py-1.5 text-[10px] border transition-all",
                          availDate===d?"bg-primary text-primary-foreground border-primary":"bg-background border-border hover:border-primary/50",
                        ].join(" ")}>
                        <span>{day}</span><span className="font-bold">{num}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {availDate&&(
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Start Time</label>
                  <select value={availHour??""} onChange={e=>setAvailHour(e.target.value?parseInt(e.target.value):null)}
                    className="bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50">
                    <option value="">Select time</option>
                    {Array.from({length:14},(_,i)=>i+8).map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                </div>
              )}
              {availHour!==null&&(
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Duration</label>
                  <div className="flex gap-1">
                    {[1,2,3,4,5,6,7,8].map(h=>(
                      <button key={h} onClick={()=>setAvailDur(h)}
                        className={["rounded-xl px-2.5 py-2 text-xs font-semibold border transition-all",
                          availDur===h?"bg-primary text-primary-foreground border-primary":"bg-background border-border text-muted-foreground hover:text-foreground",
                        ].join(" ")}>{h}h</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {availDate&&availHour!==null ? (
              <>
                <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-[#ebe8e1] border border-[#dedad0]"/>{availOccupied.size} occupied</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-lg bg-card border border-border"/>{SEATS.length-availOccupied.size} available</span>
                  <span className="font-medium text-primary">{fmtHour(availHour)} – {fmtHour(availHour+availDur)} on {fmtDateLabel(availDate).day} {fmtDateLabel(availDate).num}</span>
                </div>
                <div className="max-w-2xl">
                  <FloorMap occupied={availOccupied} selectedId={null} onSelect={()=>{}} readOnly/>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-48 rounded-2xl border-2 border-dashed border-border bg-card/50">
                <div className="text-center">
                  <Filter className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2"/>
                  <p className="text-sm text-muted-foreground">Select a date and time to view availability</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACCOUNTS */}
        {adminTab==="accounts"&&adminAuth.role==="super"&&(
          <div className="max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <div><h2 className="font-serif text-2xl mb-0.5">Admin Accounts</h2><p className="text-sm text-muted-foreground">{adminAccounts.length} accounts</p></div>
              <button onClick={()=>setView("adminSignup")} className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
                <UserPlus className="w-4 h-4"/>New Account
              </button>
            </div>
            <div className="space-y-2">
              {adminAccounts.map(a=>(
                <div key={a.id} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{a.username}</span>
                      <span className={["text-[10px] rounded-full px-2 py-0.5 font-medium",a.role==="super"?"bg-amber-100 text-amber-700":"bg-blue-100 text-blue-700"].join(" ")}>
                        {a.role==="super"?"Super Admin":"Reception"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Created {a.createdAt.toLocaleDateString()}</div>
                  </div>
                  {a.id!=="a1"&&<button onClick={()=>setAdminAccounts(prev=>prev.filter(x=>x.id!==a.id))} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>}
                </div>
              ))}
            </div>
          </div>
        )}
        {adminTab==="accounts"&&adminAuth.role!=="super"&&(
          <div className="flex items-center justify-center h-48">
            <div className="text-center"><Shield className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2"/><p className="text-sm text-muted-foreground">Account management requires Super Admin access.</p></div>
          </div>
        )}
      </div>
    </div>
  );

  if(view==="admin"&&!adminAuth){setView("adminLogin");return null;}
  return null;
}
