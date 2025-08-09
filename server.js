const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// In-memory storage for OTPs (for demo, use database in production)
const otpStore = {};

// Generate and send OTP
app.post('/send-otp', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send('Email is required');

  // Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore[email] = otp; // Store OTP

  // Configure nodemailer with environment variables
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'muralisai2004@gmail.com', // Replace with your email
      pass: 'vggc wjtq arxd jins'     // Replace with app password
    }
  });

  const mailOptions = {
    from: 'muralisai2004@gmail.com',
    to: email,
    subject: 'Your Wallet Verification OTP',
    text: `Your OTP for wallet creation is: ${otp}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).send('Failed to send OTP');
    }
    console.log('OTP sent:', info.response);
    res.send({ status: 'OTP sent' });
  });
});

// Verify OTP
app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).send('Email and OTP are required');

  if (otpStore[email] === otp) {
    delete otpStore[email]; // Clear OTP after verification
    res.send({ verified: true });
  } else {
    res.status(401).send({ verified: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
