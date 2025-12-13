// backend/server.js";
// const userRoute = require("./routes/userRoutes.js");

const axios =require("axios");
const { v4 =uuidv4 } = require("uuid");
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(cors());
app.use(express.json());

const CART_FILE = path.join(__dirname, "cart.json");
const filePath = path.join(process.cwd(), "user.json");


const session = require("express-session");

app.use(session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// READ CART
function readCart() {
  try {
    if (!fs.existsSync(CART_FILE)) return [];
    return JSON.parse(fs.readFileSync(CART_FILE, "utf8") || "[]");
  } catch (err) {
    console.error("readCart error:", err);
    return [];
  }
}

// WRITE CART
function writeCart(cart) {
  try {
    fs.writeFileSync(CART_FILE, JSON.stringify(cart, null, 2), "utf8");
  } catch (err) {
    console.error("writeCart error:", err);
  }
}

// GET CART
// GET CART (FILTER BY EMAIL IF PROVIDED)
app.get("/cart", (req, res) => {
  const { email } = req.query;

  // ❌ If email missing → do not expose cart
  if (!email) {
    return res.json([]);
  }

  const cart = readCart();

  // ✅ STRICT email match
  const userCart = cart.filter(
    item => item.email && item.email.trim() === email.trim()
  );

  res.json(userCart);
});




// ADD OR UPDATE ITEM
app.post("/cart/add", (req, res) => {
  const product = req.body;

  // ❗ Block if email is missing
  if (!product.email) {
    return res.status(401).json({
      success: false,
      message: "Please login first."
    });
  }

  let cart = readCart();

  // 🔥 Get cart only for this email
  let userCart = cart.filter((i) => i.email === product.email);

  // Check if product already exists (same product + same weight)
  const idx = userCart.findIndex(
    (i) => i.id === product.id && i.weight === product.weight
  );

  if (idx !== -1) {
    // Update quantity
    userCart[idx].quantity = Number(product.quantity);
    userCart[idx].totalPrice = userCart[idx].price * userCart[idx].quantity;
  } else {
    userCart.push(product);
  }

  // Replace only this user's cart in main file
  cart = [
    ...cart.filter((i) => i.email !== product.email),
    ...userCart
  ];

  writeCart(cart);

  res.json({ success: true, cart: userCart });
});

// UPDATE QUANTITY
app.put("/cart/update", (req, res) => {
  const { id, weight, quantity } = req.body;

  let cart = readCart();

  cart = cart.map((item) =>
    item.id === id && item.weight === weight
      ? {
          ...item,
          quantity,
          totalPrice: item.price * quantity,
        }
      : item
  );

  writeCart(cart);
  res.json({ cart });
});

app.post("/cart/delete", (req, res) => {
  const { id, weight } = req.body;

  let cart = readCart();
  cart = cart.filter(item => !(item.id === id && item.weight === weight));

  writeCart(cart);
  res.json({ cart });
});

// API — Register User
app.post("/api/user/register", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    // Generate 4 digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000);

    // Generate unique user ID
    const userId = uuidv4();

    // Timestamp for OTP
    const timestamp = Date.now(); // milliseconds

    // Read existing user.json
    let users = [];
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf8");
        if (data.trim() !== "") {
            users = JSON.parse(data);
        }
    }

    // Remove old same email
    users = users.filter((u) => u.email !== email);

    // Add new record
    users.push({
        id: userId,
        email: email,
        otp: otp,
        timestamp: timestamp
    });

    // Save file
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

    // SEND OTP USING YOUR PHP MAIL API
    try {
        await fetch("https://akcoda.site/testingEmail/email.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp })
        });

        return res.json({
            success: true,
            message: "OTP generated, saved, and sent via PHP",
            email,
            id: userId,
            timestamp
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP email",
            error: error.message
        });
    }
});


// verify otp
app.post("/api/user/verify-otp", (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "Email and OTP required" });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(400).json({ success: false, message: "No users found" });
    }

    const data = fs.readFileSync(filePath, "utf8");
    if (data.trim() === "") {
        return res.status(400).json({ success: false, message: "Empty user file" });
    }

    const users = JSON.parse(data);
    const userIndex = users.findIndex(u => u.email === email);

    if (userIndex === -1) {
        return res.status(400).json({ success: false, message: "Email not found" });
    }

    const user = users[userIndex];

    if (String(user.otp) !== String(otp)) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    users[userIndex].otp = null;
    users[userIndex].timestamp = null;

    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

    const userUUID = uuidv4();

    req.session.user = {
        id: user.id,
        email: user.email,
        sessionId: userUUID,
    };

    return res.json({
        success: true,
        message: "OTP verified successfully",
        user: {
            id: user.id,
            email: user.email,
            sessionId: userUUID,
        }
    });
});




app.post("/api/phonepe/pay", async (req, res) => {
  const { amount, user } = req.body;

  const merchantTransactionId = uuidv4();

  const payload = {
    merchantId: MERCHANT_ID,
    merchantTransactionId,
    merchantUserId: user.email,
    amount: amount * 100, // paisa
    redirectUrl: "http://localhost:3000/payment-success",
    redirectMode: "REDIRECT",
    callbackUrl: "http://localhost:5000/api/phonepe/status",
    paymentInstrument: {
      type: "PAY_PAGE",
    },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");

  const xVerify =
    crypto
      .createHash("sha256")
      .update(base64Payload + "/pg/v1/pay" + SALT_KEY)
      .digest("hex") +
    "###" +
    SALT_INDEX;

  try {
    const response = await axios.post(
      "https://api.phonepe.com/apis/hermes/pg/v1/pay",
      { request: base64Payload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
        },
      }
    );

    res.json({
      success: true,
      redirectUrl: response.data.data.instrumentResponse.redirectInfo.url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/api/phonepe/status", (req, res) => {
  console.log(req.body);
  res.sendStatus(200);
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend running http://localhost:${PORT}`));
