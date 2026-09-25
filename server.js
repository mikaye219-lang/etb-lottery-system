require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURATION
// =====================================================

const TICKET_PRICE = 500;
const MAX_TICKETS = 60;

const PRIZES = {
  first: 10000,
  second: 5000,
  third: 4000
};

// IMPORTANT:
// Set ADMIN_PASSWORD in Render Environment Variables.
// For local testing, you can create a .env file.
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "CHANGE_THIS_ADMIN_PASSWORD";

// =====================================================
// ADMIN LOGIN SESSIONS
// =====================================================

// Sessions are stored in memory.
// Restarting the server logs the admin out.
const adminSessions = new Set();

// =====================================================
// APP SETUP
// =====================================================

app.use(express.json());

// =====================================================
// COOKIE HELPERS
// =====================================================

function parseCookies(req) {
  const cookies = {};

  const header = req.headers.cookie;

  if (!header) {
    return cookies;
  }

  header.split(";").forEach(cookie => {
    const parts = cookie.trim().split("=");

    const key = parts.shift();

    if (!key) {
      return;
    }

    cookies[key] = decodeURIComponent(parts.join("="));
  });

  return cookies;
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString("hex");

  adminSessions.add(token);

  return token;
}

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req);

  const token = cookies.admin_session;

  if (!token) {
    return false;
  }

  return adminSessions.has(token);
}

// =====================================================
// ADMIN API PROTECTION
// =====================================================

function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      message: "Admin login required."
    });
  }

  next();
}

// =====================================================
// DATA
// =====================================================

let payments = [];
let players = [];
let drawHistory = [];
let users = [];
let balanceTransactions = [];

let roundNumber = 1;

let paymentCounter = 1;
let ticketCounter = 1;
let balanceCounter = 1;

// =====================================================
// HELPERS
// =====================================================

function makeId(prefix, counter) {
  return `${prefix}-${String(counter).padStart(5, "0")}`;
}

function validTicket(number) {
  const n = Number(number);

  return (
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 60
  );
}

function findPlayer(ticketNumber) {
  return players.find(
    p =>
      Number(p.ticketNumber) ===
      Number(ticketNumber)
  );
}

function getUsedTickets() {
  return players
    .map(p => Number(p.ticketNumber))
    .sort((a, b) => a - b);
}

function getPendingTickets() {
  return payments
    .filter(
      p =>
        p.round === roundNumber &&
        p.status === "PENDING"
    )
    .map(p => Number(p.selectedTicket))
    .filter(validTicket)
    .sort((a, b) => a - b);
}

function getAvailableTickets() {
  const used = new Set(getUsedTickets());

  return Array.from(
    { length: MAX_TICKETS },
    (_, i) => i + 1
  ).filter(n => !used.has(n));
}

function getUser(userId) {
  return users.find(u => u.id === userId);
}

// =====================================================
// RANDOM DRAW
// =====================================================

function executeLotteryDraw() {
  if (players.length !== MAX_TICKETS) {
    return null;
  }

  // Copy all 60 entries.
  const pool = [...players];

  // FIRST
  const firstIndex =
    Math.floor(Math.random() * pool.length);

  const first =
    pool.splice(firstIndex, 1)[0];

  // SECOND
  const secondIndex =
    Math.floor(Math.random() * pool.length);

  const second =
    pool.splice(secondIndex, 1)[0];

  // THIRD
  const thirdIndex =
    Math.floor(Math.random() * pool.length);

  const third =
    pool.splice(thirdIndex, 1)[0];

  const draw = {
    id: `DRAW-${Date.now()}`,

    round: roundNumber,

    date:
      new Date().toISOString(),

    first: {
      name: first.name,
      phone: first.phone,
      ticketNumber: first.ticketNumber,
      ticketId: first.ticketId,
      source: first.source,
      prize: PRIZES.first
    },

    second: {
      name: second.name,
      phone: second.phone,
      ticketNumber: second.ticketNumber,
      ticketId: second.ticketId,
      source: second.source,
      prize: PRIZES.second
    },

    third: {
      name: third.name,
      phone: third.phone,
      ticketNumber: third.ticketNumber,
      ticketId: third.ticketId,
      source: third.source,
      prize: PRIZES.third
    },

    totalPlayers: MAX_TICKETS
  };

  drawHistory.unshift(draw);

  // Start new round.
  players = [];

  payments = payments.filter(
    p => p.round !== roundNumber
  );

  roundNumber++;

  return draw;
}

// =====================================================
// ADMIN LOGIN PAGE
// =====================================================

app.get("/admin.html", (req, res) => {
  if (!isAdminAuthenticated(req)) {
    return res.redirect("/admin-login.html");
  }

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "admin.html"
    )
  );
});

// =====================================================
// ADMIN LOGIN
// =====================================================

app.post("/api/admin/login", (req, res) => {
  const password =
    typeof req.body.password === "string"
      ? req.body.password
      : "";

  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password is required."
    });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Incorrect admin password."
    });
  }

  const sessionToken =
    createAdminSession();

  const secure =
    process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";

  res.setHeader(
    "Set-Cookie",
    `admin_session=${encodeURIComponent(
      sessionToken
    )}; HttpOnly; Path=/; SameSite=Strict${secure}`
  );

  res.json({
    success: true,
    message: "Admin login successful."
  });
});

// =====================================================
// ADMIN LOGOUT
// =====================================================

app.post(
  "/api/admin/logout",
  requireAdmin,
  (req, res) => {
    const cookies = parseCookies(req);

    const token =
      cookies.admin_session;

    if (token) {
      adminSessions.delete(token);
    }

    res.setHeader(
      "Set-Cookie",
      "admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict"
    );

    res.json({
      success: true,
      message: "Admin logged out."
    });
  }
);

// =====================================================
// CHECK ADMIN LOGIN
// =====================================================

app.get(
  "/api/admin/me",
  requireAdmin,
  (req, res) => {
    res.json({
      success: true,
      authenticated: true
    });
  }
);

// =====================================================
// STATIC FILES
// =====================================================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

// =====================================================
// LOTTERY STATUS
// =====================================================

app.get("/api/status", (req, res) => {
  const used =
    getUsedTickets();

  const pending =
    getPendingTickets();

  const available =
    getAvailableTickets();

  res.json({
    success: true,

    round: roundNumber,

    ticketPrice: TICKET_PRICE,

    maxPlayers: MAX_TICKETS,

    approvedPlayers:
      players.length,

    remaining:
      MAX_TICKETS - players.length,

    progress:
      Math.round(
        (players.length /
          MAX_TICKETS) *
          100
      ),

    availableTickets:
      available,

    takenTickets:
      used,

    reservedTickets:
      pending,

    players:
      players.map(p => ({
        userId: p.userId,
        name: p.name,
        phone: p.phone,
        ticketNumber:
          p.ticketNumber,
        ticketId:
          p.ticketId,
        source:
          p.source
      }))
  });
});

// =====================================================
// USER SUBMITS PAYMENT + REQUESTED NUMBER
// =====================================================

app.post(
  "/api/payment/submit",
  (req, res) => {

    const {
      userId,
      name,
      phone,
      txid,
      selectedTicket
    } = req.body;

    if (
      !userId ||
      !name ||
      !phone ||
      !txid ||
      selectedTicket === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "User ID, name, phone, TXID and ticket number are required."
      });
    }

    const ticket =
      Number(selectedTicket);

    if (!validTicket(ticket)) {
      return res.status(400).json({
        success: false,
        message:
          "Ticket number must be between 1 and 60."
      });
    }

    if (players.length >= MAX_TICKETS) {
      return res.status(400).json({
        success: false,
        message:
          "This round is already full."
      });
    }

    const duplicateTxid =
      payments.find(
        p =>
          String(p.txid)
            .trim()
            .toLowerCase() ===
          String(txid)
            .trim()
            .toLowerCase()
      );

    if (duplicateTxid) {
      return res.status(400).json({
        success: false,
        message:
          "This TXID has already been submitted."
      });
    }

    const existingUser =
      payments.find(
        p =>
          p.userId === userId &&
          p.round === roundNumber &&
          (
            p.status === "PENDING" ||
            p.status === "APPROVED"
          )
      );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "You already have a payment in this round."
      });
    }

    if (findPlayer(ticket)) {
      return res.status(400).json({
        success: false,
        message:
          `Ticket ${ticket} is already taken.`
      });
    }

    const pending =
      payments.find(
        p =>
          p.round === roundNumber &&
          p.status === "PENDING" &&
          Number(p.selectedTicket) === ticket
      );

    if (pending) {
      return res.status(400).json({
        success: false,
        message:
          `Ticket ${ticket} is currently reserved by another pending payment.`
      });
    }

    let user =
      getUser(userId);

    if (!user) {
      user = {
        id: userId,
        name,
        phone,
        balance: 0,
        createdAt:
          new Date().toISOString()
      };

      users.push(user);
    }

    const payment = {
      id:
        makeId(
          "PAY",
          paymentCounter++
        ),

      userId,

      name,

      phone,

      txid,

      amount:
        TICKET_PRICE,

      round:
        roundNumber,

      selectedTicket:
        ticket,

      ticketNumber:
        null,

      ticketId:
        null,

      status:
        "PENDING",

      rejectionReason:
        null,

      createdAt:
        new Date().toISOString(),

      approvedAt:
        null,

      rejectedAt:
        null
    };

    payments.push(payment);

    res.json({
      success: true,

      message:
        `Payment submitted. You will receive ticket ${ticket} only after admin approval.`,

      payment: {
        id:
          payment.id,

        status:
          payment.status,

        selectedTicket:
          payment.selectedTicket,

        ticketNumber:
          null
      }
    });
  }
);

// =====================================================
// USER PAYMENT STATUS
// =====================================================

app.get(
  "/api/payment/status/:paymentId",
  (req, res) => {

    const payment =
      payments.find(
        p =>
          p.id ===
          req.params.paymentId
      );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found."
      });
    }

    res.json({
      success: true,

      payment: {
        id:
          payment.id,

        status:
          payment.status,

        selectedTicket:
          payment.selectedTicket,

        ticketNumber:
          payment.ticketNumber,

        ticketId:
          payment.ticketId,

        rejectionReason:
          payment.rejectionReason,

        round:
          payment.round,

        amount:
          payment.amount,

        createdAt:
          payment.createdAt,

        approvedAt:
          payment.approvedAt,

        rejectedAt:
          payment.rejectedAt
      }
    });
  }
);

// =====================================================
// ADMIN: PAYMENT LIST
// =====================================================

app.get(
  "/api/admin/payments",
  requireAdmin,
  (req, res) => {

    res.json({
      success: true,

      payments:
        [...payments].reverse()
    });
  }
);

// =====================================================
// ADMIN: APPROVE USER PAYMENT
// =====================================================

app.post(
  "/api/admin/payment/:paymentId/approve",
  requireAdmin,
  (req, res) => {

    const payment =
      payments.find(
        p =>
          p.id ===
          req.params.paymentId
      );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found."
      });
    }

    if (payment.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message:
          `Payment is already ${payment.status}.`
      });
    }

    if (
      payment.round !==
      roundNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This payment belongs to an old round."
      });
    }

    if (players.length >= MAX_TICKETS) {
      return res.status(400).json({
        success: false,
        message:
          "The lottery already has 60 entries."
      });
    }

    const ticket =
      Number(
        payment.selectedTicket
      );

    if (!validTicket(ticket)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid ticket number."
      });
    }

    if (findPlayer(ticket)) {
      return res.status(400).json({
        success: false,
        message:
          `Ticket ${ticket} is already assigned.`
      });
    }

    payment.status =
      "APPROVED";

    payment.ticketNumber =
      ticket;

    payment.ticketId =
      makeId(
        "TCK",
        ticketCounter++
      );

    payment.approvedAt =
      new Date().toISOString();

    players.push({
      userId:
        payment.userId,

      name:
        payment.name,

      phone:
        payment.phone,

      ticketNumber:
        ticket,

      ticketId:
        payment.ticketId,

      round:
        roundNumber,

      source:
        "USER",

      joinedAt:
        new Date().toISOString()
    });

    let draw = null;

    if (
      players.length ===
      MAX_TICKETS
    ) {
      draw =
        executeLotteryDraw();
    }

    res.json({
      success: true,

      message:
        `Approved. User now officially has ticket ${ticket}.`,

      payment,

      totalEntries:
        draw
          ? MAX_TICKETS
          : players.length,

      draw
    });
  }
);

// =====================================================
// ADMIN: REJECT USER PAYMENT
// =====================================================

app.post(
  "/api/admin/payment/:paymentId/reject",
  requireAdmin,
  (req, res) => {

    const payment =
      payments.find(
        p =>
          p.id ===
          req.params.paymentId
      );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Payment not found."
      });
    }

    if (payment.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message:
          `Payment is already ${payment.status}.`
      });
    }

    payment.status =
      "REJECTED";

    payment.rejectionReason =
      req.body.reason ||
      "Payment rejected by admin.";

    payment.rejectedAt =
      new Date().toISOString();

    res.json({
      success: true,

      message:
        `Payment rejected. Ticket ${payment.selectedTicket} is available again.`,

      payment
    });
  }
);

// =====================================================
// ADMIN: MANUALLY USE ANY AVAILABLE NUMBER
// =====================================================

app.post(
  "/api/admin/assign-ticket",
  requireAdmin,
  (req, res) => {

    const {
      name,
      phone,
      ticketNumber
    } = req.body;

    if (
      !name ||
      !phone ||
      ticketNumber === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, phone and ticket number are required."
      });
    }

    const ticket =
      Number(ticketNumber);

    if (!validTicket(ticket)) {
      return res.status(400).json({
        success: false,
        message:
          "Ticket must be a number from 1 to 60."
      });
    }

    if (players.length >= MAX_TICKETS) {
      return res.status(400).json({
        success: false,
        message:
          "All 60 entries are already filled."
      });
    }

    if (findPlayer(ticket)) {
      return res.status(400).json({
        success: false,
        message:
          `Ticket ${ticket} is already taken.`
      });
    }

    const pending =
      payments.find(
        p =>
          p.round === roundNumber &&
          p.status === "PENDING" &&
          Number(p.selectedTicket) ===
            ticket
      );

    if (pending) {
      return res.status(400).json({
        success: false,
        message:
          `Ticket ${ticket} is reserved by a pending user payment.`
      });
    }

    const ticketId =
      makeId(
        "TCK",
        ticketCounter++
      );

    players.push({
      userId:
        `ADMIN-${Date.now()}`,

      name,

      phone,

      ticketNumber:
        ticket,

      ticketId,

      round:
        roundNumber,

      source:
        "ADMIN",

      joinedAt:
        new Date().toISOString()
    });

    let draw = null;

    if (
      players.length ===
      MAX_TICKETS
    ) {
      draw =
        executeLotteryDraw();
    }

    res.json({
      success: true,

      message:
        `Admin successfully used ticket number ${ticket}.`,

      ticket: {
        ticketNumber:
          ticket,

        ticketId,

        name,

        phone,

        source:
          "ADMIN"
      },

      totalEntries:
        draw
          ? MAX_TICKETS
          : players.length,

      remaining:
        draw
          ? 0
          : MAX_TICKETS -
            players.length,

      draw
    });
  }
);

// =====================================================
// ADMIN: CURRENT PLAYERS
// =====================================================

app.get(
  "/api/admin/players",
  requireAdmin,
  (req, res) => {

    res.json({
      success: true,

      total:
        players.length,

      players
    });
  }
);

// =====================================================
// ADMIN: USERS
// =====================================================

app.get(
  "/api/admin/users",
  requireAdmin,
  (req, res) => {

    const totalBalance =
      users.reduce(
        (sum, user) =>
          sum +
          Number(
            user.balance || 0
          ),
        0
      );

    res.json({
      success: true,

      totalUsers:
        users.length,

      totalBalance,

      users
    });
  }
);

// =====================================================
// ADMIN: ADD BALANCE
// =====================================================

app.post(
  "/api/admin/user/:userId/add-balance",
  requireAdmin,
  (req, res) => {

    const user =
      getUser(
        req.params.userId
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found."
      });
    }

    const amount =
      Number(req.body.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid amount."
      });
    }

    const oldBalance =
      Number(
        user.balance || 0
      );

    user.balance =
      oldBalance + amount;

    balanceTransactions.unshift({
      id:
        makeId(
          "BAL",
          balanceCounter++
        ),

      userId:
        user.id,

      name:
        user.name,

      type:
        "CREDIT",

      amount,

      oldBalance,

      newBalance:
        user.balance,

      reason:
        req.body.reason ||
        "Added by admin.",

      createdAt:
        new Date().toISOString()
    });

    res.json({
      success: true,

      message:
        `${amount} ETB added.`,

      user
    });
  }
);

// =====================================================
// ADMIN: REMOVE BALANCE
// =====================================================

app.post(
  "/api/admin/user/:userId/remove-balance",
  requireAdmin,
  (req, res) => {

    const user =
      getUser(
        req.params.userId
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found."
      });
    }

    const amount =
      Number(req.body.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid amount."
      });
    }

    const oldBalance =
      Number(
        user.balance || 0
      );

    if (amount > oldBalance) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot remove more than the current balance."
      });
    }

    user.balance =
      oldBalance - amount;

    balanceTransactions.unshift({
      id:
        makeId(
          "BAL",
          balanceCounter++
        ),

      userId:
        user.id,

      name:
        user.name,

      type:
        "DEBIT",

      amount,

      oldBalance,

      newBalance:
        user.balance,

      reason:
        req.body.reason ||
        "Removed by admin.",

      createdAt:
        new Date().toISOString()
    });

    res.json({
      success: true,

      message:
        `${amount} ETB removed.`,

      user
    });
  }
);

// =====================================================
// ADMIN: BALANCE TRANSACTIONS
// =====================================================

app.get(
  "/api/admin/balance-transactions",
  requireAdmin,
  (req, res) => {

    res.json({
      success: true,

      transactions:
        balanceTransactions
    });
  }
);

// =====================================================
// DRAW HISTORY
// =====================================================

app.get(
  "/api/history",
  (req, res) => {

    res.json({
      success: true,

      history:
        drawHistory
    });
  }
);

// =====================================================
// LATEST DRAW
// =====================================================

app.get(
  "/api/latest-draw",
  (req, res) => {

    res.json({
      success: true,

      draw:
        drawHistory.length
          ? drawHistory[0]
          : null
    });
  }
);

// =====================================================
// HEALTH
// =====================================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      success: true,

      status:
        "OK",

      round:
        roundNumber,

      entries:
        players.length,

      maxEntries:
        MAX_TICKETS,

      time:
        new Date().toISOString()
    });
  }
);

// =====================================================
// START
// =====================================================

app.listen(PORT, () => {

  console.log(
    "------------------------------------"
  );

  console.log(
    "ETB LOTTERY SYSTEM"
  );

  console.log(
    "------------------------------------"
  );

  console.log(
    `Server running on port ${PORT}`
  );

  console.log(
    "Ticket numbers: 1 - 60"
  );

  console.log(
    "User ticket: given ONLY after approval"
  );

  console.log(
    "Admin: can use ANY available number"
  );

  console.log(
    "Automatic draw: 60/60"
  );

  console.log(
    "Admin authentication: ENABLED"
  );

  console.log(
    "------------------------------------"
  );
});