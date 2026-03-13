import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

const String backend = "http://YOUR_SERVER_IP:5000";

Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  debugPrint("Background message: ${message.notification?.body}");
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(home: OTPPage());
  }
}

class OTPPage extends StatefulWidget {
  const OTPPage({super.key});

  @override
  State<OTPPage> createState() => _OTPPageState();
}

class _OTPPageState extends State<OTPPage> {
  String phone = "";
  String otp = "";
  String fcmToken = "";
  String status = "";

  final phoneController = TextEditingController();
  final otpController = TextEditingController();

  @override
  void initState() {
    super.initState();
    initFCM();
  }

  Future<void> initFCM() async {
    FirebaseMessaging messaging = FirebaseMessaging.instance;

    await messaging.requestPermission();

    String? token = await messaging.getToken();

    setState(() {
      fcmToken = token ?? "";
    });

    print("FCM TOKEN: $token");

    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      setState(() {
        status = "Notification: ${message.notification?.body}";
      });
    });
  }

  Future<void> registerToken() async {
    phone = phoneController.text;

    var res = await http.post(
      Uri.parse("$backend/register-token"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phone": phone, "fcmToken": fcmToken}),
    );

    setState(() {
      status = res.body;
    });
  }

  Future<void> sendOTP() async {
    phone = phoneController.text;

    var res = await http.post(
      Uri.parse("$backend/send-otp"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phone": phone}),
    );

    setState(() {
      status = res.body;
    });
  }

  Future<void> verifyOTP() async {
    phone = phoneController.text;
    otp = otpController.text;

    var res = await http.post(
      Uri.parse("$backend/verify-otp"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phone": phone, "otp": otp}),
    );

    setState(() {
      status = res.body;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("OTP Demo")),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            TextField(
              controller: phoneController,
              decoration: const InputDecoration(labelText: "Phone Number"),
            ),

            const SizedBox(height: 20),

            ElevatedButton(
              onPressed: registerToken,
              child: const Text("Register Device"),
            ),

            const SizedBox(height: 20),

            ElevatedButton(onPressed: sendOTP, child: const Text("Send OTP")),

            const SizedBox(height: 20),

            TextField(
              controller: otpController,
              decoration: const InputDecoration(labelText: "Enter OTP"),
            ),

            const SizedBox(height: 20),

            ElevatedButton(
              onPressed: verifyOTP,
              child: const Text("Verify OTP"),
            ),

            const SizedBox(height: 40),

            Text(status, style: const TextStyle(fontSize: 16)),
          ],
        ),
      ),
    );
  }
}
