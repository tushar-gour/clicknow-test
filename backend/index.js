import express from "express";
import mongoose from "mongoose";
import admin from "firebase-admin";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
  }),
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

mongoose.connect(MONGO_URI);
console.log("MongoDB Connected");

const userSchema = new mongoose.Schema({
  phone: String,
  fcmToken: String,
});

const otpSchema = new mongoose.Schema({
  phone: String,
  otp: String,
  expiresAt: Date,
});

const User = mongoose.model("User", userSchema);
const OTP = mongoose.model("OTP", otpSchema);

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendFCM(token, otp) {
  const message = {
    notification: {
      title: "OTP Verification",
      body: `Your OTP is ${otp}`,
    },
    data: {
      otp: otp,
    },
    token: token,
  };

  return admin.messaging().send(message);
}

app.post("/register-token", async (req, res) => {
  try {
    const { phone, fcmToken } = req.body;
    let user = await User.findOne({ phone });

    if (user) {
      user.fcmToken = fcmToken;
      await user.save();
    } else {
      user = await User.create({ phone, fcmToken });
    }

    res.json({ success: true, message: "Token registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ message: "User not registered" });
    }

    const otp = generateOTP();

    await OTP.create({
      phone,
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await sendFCM(user.fcmToken, otp);

    res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    const record = await OTP.findOne({ phone, otp });

    if (!record) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (record.expiresAt < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    await OTP.deleteOne({ _id: record._id });

    res.json({ success: true, message: "OTP verified" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
