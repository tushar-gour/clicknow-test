import express from "express";
import mongoose from "mongoose";
import admin from "firebase-admin";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// ─── Firebase Init ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
  }),
});

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ─── MongoDB ──────────────────────────────────────────────────────────────────

let dbStatus = "disconnected";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    dbStatus = "connected";
    console.log("✅ MongoDB Connected");
  })
  .catch((err) => {
    dbStatus = "error";
    console.error("❌ MongoDB connection error:", err.message);
  });

mongoose.connection.on("disconnected", () => (dbStatus = "disconnected"));
mongoose.connection.on("reconnected", () => (dbStatus = "connected"));

// ─── Schemas & Models ─────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    fcmToken: { type: String, required: true },
  },
  { timestamps: true },
);

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, trim: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }, // auto-delete after 5 min
});

const User = mongoose.model("User", userSchema);
const OTP = mongoose.model("OTP", otpSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendFCM(token, otp) {
  const message = {
    notification: {
      title: "OTP Verification",
      body: `Your OTP is ${otp}. It expires in 5 minutes.`,
    },
    data: { otp },
    token,
  };
  return admin.messaging().send(message);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => !req.body[f]);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing fields: ${missing.join(", ")}`,
      });
    }
    next();
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health Check
app.get("/", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "OTP Auth API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    database: dbStatus,
    endpoints: [
      { method: "GET", path: "/", description: "Health check" },
      {
        method: "POST",
        path: "/register-token",
        description: "Register phone + FCM token",
      },
      { method: "POST", path: "/send-otp", description: "Send OTP via FCM" },
      { method: "POST", path: "/verify-otp", description: "Verify OTP" },
    ],
  });
});

// Register or update an FCM token for a phone number
app.post(
  "/register-token",
  requireFields("phone", "fcmToken"),
  async (req, res) => {
    try {
      const { phone, fcmToken } = req.body;

      const user = await User.findOneAndUpdate(
        { phone },
        { fcmToken },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      res.json({
        success: true,
        message: "Token registered",
        userId: user._id,
      });
    } catch (err) {
      console.error("[register-token]", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// Send an OTP to a registered user via FCM
app.post("/send-otp", requireFields("phone"), async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not registered" });
    }

    // Invalidate any existing OTPs for this phone
    await OTP.deleteMany({ phone });

    const otp = generateOTP();
    await OTP.create({
      phone,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    await sendFCM(user.fcmToken, otp);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    console.error("[send-otp]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify the OTP submitted by the user
app.post("/verify-otp", requireFields("phone", "otp"), async (req, res) => {
  try {
    const { phone, otp } = req.body;

    const record = await OTP.findOne({ phone, otp });
    if (!record) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (record.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: record._id });
      return res
        .status(400)
        .json({ success: false, message: "OTP has expired" });
    }

    await OTP.deleteOne({ _id: record._id });

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("[verify-otp]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
