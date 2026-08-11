const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "appointments.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "theresa-admin-2026";
const HOLD_DURATION_MS = 5 * 60 * 1000;

const services = [
  {
    id: "individual-counseling",
    name: "Individual Counseling",
    price: 120,
    duration: 60,
    description: "One-on-one appointment for personal support and guidance."
  },
  {
    id: "care-coaching",
    name: "Care Coaching",
    price: 95,
    duration: 45,
    description: "Structured coaching for care planning and decision support."
  },
  {
    id: "family-support",
    name: "Family Support Session",
    price: 150,
    duration: 75,
    description: "Extended session for family members or caregivers."
  }
];

const AVAILABLE_SLOTS = ["09:00", "10:00", "11:00", "14:00", "15:00"];
const appointments = loadAppointments();
const holds = new Map();

function ensureDataPath() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAppointments() {
  ensureDataPath();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
    return [];
  }

  try {
    const data = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Could not read appointments file", error);
    return [];
  }
}

function saveAppointments() {
  ensureDataPath();
  fs.writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2));
}

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date) {
  return normalizeDate(date).toISOString().slice(0, 10);
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function timeslotsForDate(dateKey) {
  return AVAILABLE_SLOTS.map((time) => ({ time, label: formatTimeLabel(time) }));
}

function formatTimeLabel(time) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getAppointmentsForDate(dateKey) {
  return appointments.filter((appointment) => appointment.date === dateKey);
}

function getActiveHolds() {
  const now = Date.now();
  const active = [];
  for (const hold of holds.values()) {
    if (hold.expiresAt > now) {
      active.push(hold);
    }
  }
  return active;
}

function cleanupExpiredHolds() {
  const now = Date.now();
  for (const [key, hold] of holds.entries()) {
    if (hold.expiresAt <= now) {
      holds.delete(key);
    }
  }
}

function isSlotTaken(dateKey, time) {
  const booked = getAppointmentsForDate(dateKey).some((appointment) => appointment.time === time);
  if (booked) {
    return true;
  }
  const now = Date.now();
  const held = Array.from(holds.values()).some(
    (hold) => hold.date === dateKey && hold.time === time && hold.expiresAt > now
  );
  return held;
}

function getDayStatus(date) {
  const today = startOfToday();
  const normalized = normalizeDate(date);
  if (normalized < today || isWeekend(normalized)) {
    return "unavailable";
  }

  const maxWindow = new Date(today);
  maxWindow.setMonth(today.getMonth() + 5);
  if (normalized > maxWindow) {
    return "unavailable";
  }

  const dateKey = formatDateKey(date);
  const bookedCount = getAppointmentsForDate(dateKey).length;
  const activeHoldCount = getActiveHolds().filter((hold) => hold.date === dateKey).length;
  const takenCount = bookedCount + activeHoldCount;
  if (takenCount >= AVAILABLE_SLOTS.length) {
    return "fullyBooked";
  }

  return "available";
}

function buildMonthGrid(year, month) {
  const result = [];
  const firstDayOfMonth = new Date(year, month, 1);
  const weekdayOffset = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let week = Array(weekdayOffset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    week.push({
      date,
      status: getDayStatus(date),
      day
    });

    if (week.length === 7) {
      result.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) {
      week.push(null);
    }
    result.push(week);
  }

  return result;
}

function generateReference() {
  return `THG-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/services", (req, res) => {
  res.json(services);
});

app.get("/api/calendar", (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (Number.isNaN(year) || Number.isNaN(month)) {
    return res.status(400).json({ error: "Missing month or year" });
  }

  const grid = buildMonthGrid(year, month);
  res.json({ year, month, grid });
});

app.get("/api/timeslots", (req, res) => {
  const { serviceId, date } = req.query;
  if (!serviceId || !date) {
    return res.status(400).json({ error: "Missing serviceId or date" });
  }

  const service = services.find((item) => item.id === serviceId);
  if (!service) {
    return res.status(404).json({ error: "Service not found" });
  }

  const dateKey = formatDateKey(date);
  const slots = timeslotsForDate(dateKey).map((slot) => ({
    ...slot,
    status: isSlotTaken(dateKey, slot.time) ? "booked" : "available"
  }));

  res.json({ service, date: dateKey, slots });
});

app.post("/api/hold", (req, res) => {
  const { serviceId, date, time } = req.body;
  if (!serviceId || !date || !time) {
    return res.status(400).json({ error: "Missing serviceId, date, or time" });
  }

  const service = services.find((item) => item.id === serviceId);
  if (!service) {
    return res.status(404).json({ error: "Service not found" });
  }

  const dateKey = formatDateKey(date);
  cleanupExpiredHolds();

  if (isSlotTaken(dateKey, time)) {
    return res.status(409).json({ error: "This time slot is no longer available." });
  }

  const holdId = randomUUID();
  const expiresAt = Date.now() + HOLD_DURATION_MS;
  holds.set(holdId, { holdId, serviceId, date: dateKey, time, expiresAt });

  res.json({ holdId, expiresAt, serviceId, date: dateKey, time });
});

app.post("/api/release", (req, res) => {
  const { holdId } = req.body;
  if (!holdId) {
    return res.status(400).json({ error: "Missing holdId" });
  }

  holds.delete(holdId);
  res.json({ released: true });
});

app.post("/api/book", (req, res) => {
  const { holdId, client } = req.body;
  if (!holdId || !client || !client.name || !client.email || !client.phone) {
    return res.status(400).json({ error: "Missing booking details" });
  }

  cleanupExpiredHolds();
  const hold = holds.get(holdId);
  if (!hold) {
    return res.status(410).json({ error: "Your selected appointment hold has expired." });
  }

  const service = services.find((item) => item.id === hold.serviceId);
  if (!service) {
    return res.status(404).json({ error: "Service not found" });
  }

  if (isSlotTaken(hold.date, hold.time)) {
    return res.status(409).json({ error: "This time slot has already been booked." });
  }

  const appointment = {
    id: randomUUID(),
    reference: generateReference(),
    serviceId: service.id,
    serviceName: service.name,
    date: hold.date,
    time: hold.time,
    duration: service.duration,
    price: service.price,
    paymentStatus: "Paid",
    createdAt: new Date().toISOString(),
    client: {
      name: client.name,
      email: client.email,
      phone: client.phone
    },
    status: "Confirmed"
  };

  appointments.push(appointment);
  saveAppointments();
  holds.delete(holdId);

  res.json({ appointment, message: "Appointment confirmed." });
});

app.get("/api/admin/appointments", (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const list = appointments
    .slice()
    .sort((a, b) => new Date(a.date + " " + a.time) - new Date(b.date + " " + b.time));
  res.json({ appointments: list });
});

app.listen(PORT, () => {
  console.log(`TheresaHopeGlobal booking server is running on http://localhost:${PORT}`);
});
