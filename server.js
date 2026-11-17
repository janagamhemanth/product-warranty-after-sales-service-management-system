require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

console.log("JWT secret loaded:", Boolean(JWT_SECRET));

if (!JWT_SECRET || JWT_SECRET.length < 24) {
  console.error("ERROR: Set JWT_SECRET in your .env file to a random value at least 24 characters long.");
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes." }
});

// ===============================
// USER SCHEMA
// ===============================

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  passwordHash: {
    type: String,
    required: true
  },

  role: {
    type: String,
    enum: ["customer", "admin"],
    default: "customer"
  }

}, { timestamps: true });

// ===============================
// PRODUCT SCHEMA
// ===============================

const productSchema = new mongoose.Schema({

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
    index: true
  },

  customerEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
    maxlength: 254
  },

  productName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  brand: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },

  serialNumber: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  purchaseDate: {
    type: Date,
    required: true
  },

  warrantyMonths: {
    type: Number,
    required: true,
    min: 0,
    max: 120
  },

  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ""
  }

}, { timestamps: true });

productSchema.index(
  { owner: 1, serialNumber: 1 },
  { unique: true }
);

// ===============================
// SERVICE REQUEST SCHEMA
// ===============================

const serviceSchema = new mongoose.Schema({

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },

  issue: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1500
  },

  preferredContact: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ""
  },

  status: {
    type: String,
    enum: ["Submitted", "In Progress", "Resolved", "Rejected"],
    default: "Submitted"
  },

  adminNote: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ""
  },

  ticketNumber: {
    type: String,
    required: true,
    unique: true
  },

  // Customer rating and review
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },

  review: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ""
  },

  reviewedAt: {
    type: Date,
    default: null
  }

}, { timestamps: true });

// ===============================
// MODELS
// ===============================

const User = mongoose.model("User", userSchema);
const Product = mongoose.model("Product", productSchema);
const ServiceRequest = mongoose.model("ServiceRequest", serviceSchema);

// ===============================
// HELPER FUNCTIONS
// ===============================

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function createToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function authenticate(req, res, next) {

  const header = req.headers.authorization || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  try {

    const payload = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(payload.id);

    if (!user) {
      return res.status(401).json({
        message: "Account not found. Please log in again."
      });
    }

    req.user = user;
    next();

  } catch {
    return res.status(401).json({
      message: "Session expired or invalid. Please log in again."
    });
  }
}

function requireAdmin(req, res, next) {

  if (req.user?.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required."
    });
  }

  next();
}

function validText(value, max = 100) {

  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max;
}

// ===============================
// WARRANTY CALCULATION
// ===============================

function warrantyDetails(product) {

  const purchased = new Date(product.purchaseDate);

  const warrantyMonths = Number(product.warrantyMonths);

  const targetMonth =
    purchased.getMonth() + warrantyMonths;

  const targetYear =
    purchased.getFullYear() + Math.floor(targetMonth / 12);

  const month =
    targetMonth % 12;

  const lastDay = new Date(
    targetYear,
    month + 1,
    0
  ).getDate();

  const expiry = new Date(
    targetYear,
    month,
    Math.min(purchased.getDate(), lastDay)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryDay = new Date(expiry);
  expiryDay.setHours(0, 0, 0, 0);

  const daysRemaining = Math.ceil(
    (expiryDay - today) / (1000 * 60 * 60 * 24)
  );

  let warrantyStatus;

  if (daysRemaining < 0) {
    warrantyStatus = "Expired";
  } else if (daysRemaining <= 30) {
    warrantyStatus = "Expiring Soon";
  } else {
    warrantyStatus = "Active";
  }

  return {
    ...product.toObject(),
    warrantyExpiry: expiry,
    warrantyStatus,
    daysRemaining: Math.max(0, daysRemaining)
  };
}

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", (req, res) => {

  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected"
  });

});

// ===============================
// CUSTOMER REGISTRATION
// ===============================

app.post("/api/auth/register", authLimiter, async (req, res) => {

  try {

    const name = String(req.body.name || "").trim();

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!validText(name, 80)) {
      return res.status(400).json({
        message: "Enter a name (maximum 80 characters)."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (password.length < 8 || password.length > 100) {
      return res.status(400).json({
        message: "Password must be 8–100 characters."
      });
    }

    const exists = await User.findOne({ email });

    if (exists) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "customer"
    });

    // Link products previously registered by the admin

    const linkedProducts = await Product.updateMany(
      {
        customerEmail: email,
        owner: { $exists: false }
      },
      {
        $set: { owner: user._id }
      }
    );

    console.log("Customer registered:", email);
    console.log("Products matched:", linkedProducts.matchedCount);
    console.log("Products linked:", linkedProducts.modifiedCount);

    res.status(201).json({
      message: "Account created successfully.",
      token: createToken(user),
      user: safeUser(user)
    });

  } catch (error) {

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email is already registered."
      });
    }

    console.error(error);

    res.status(500).json({
      message: "Could not create account."
    });
  }

});

// ===============================
// CUSTOMER LOGIN
// ===============================

app.post("/api/auth/login", authLimiter, async (req, res) => {

  try {

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {

      return res.status(401).json({
        message: "Incorrect email or password."
      });

    }

    res.json({
      message: "Login successful.",
      token: createToken(user),
      user: safeUser(user)
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not log in."
    });
  }

});

// ===============================
// CURRENT USER
// ===============================

app.get("/api/auth/me", authenticate, (req, res) => {

  res.json({
    user: safeUser(req.user)
  });

});

// ===============================
// GET PRODUCTS
// ===============================

app.get("/api/products", authenticate, async (req, res) => {

  try {

    const filter = req.user.role === "admin"
      ? {}
      : {
          $or: [
            { owner: req.user._id },
            { customerEmail: req.user.email }
          ]
        };

    const products = await Product.find(filter)
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

    res.json({

      products: products.map(p => ({

        ...warrantyDetails(p),

        owner: p.owner
          ? {
              id: p.owner._id,
              name: p.owner.name,
              email: p.owner.email
            }
          : null

      }))

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not load products."
    });
  }

});

// ===============================
// CUSTOMER REGISTER PRODUCT
// ===============================

app.post("/api/products", authenticate, async (req, res) => {

  try {

    const {
      productName,
      brand,
      serialNumber,
      purchaseDate,
      warrantyMonths,
      notes = ""
    } = req.body;

    if (
      !validText(productName, 100) ||
      !validText(brand, 80) ||
      !validText(serialNumber, 100)
    ) {
      return res.status(400).json({
        message: "Product name, brand, and serial number are required."
      });
    }

    const date = new Date(purchaseDate);
    const months = Number(warrantyMonths);

    if (
      !purchaseDate ||
      Number.isNaN(date.getTime()) ||
      date > new Date()
    ) {
      return res.status(400).json({
        message: "Purchase date must be a valid date and cannot be in the future."
      });
    }

    if (!Number.isInteger(months) || months < 0 || months > 120) {
      return res.status(400).json({
        message: "Warranty must be between 0 and 120 whole months."
      });
    }

    if (typeof notes !== "string" || notes.length > 500) {
      return res.status(400).json({
        message: "Notes must be 500 characters or fewer."
      });
    }

    const product = await Product.create({

      owner: req.user._id,
      customerEmail: req.user.email,
      productName: productName.trim(),
      brand: brand.trim(),
      serialNumber: serialNumber.trim(),
      purchaseDate: date,
      warrantyMonths: months,
      notes: notes.trim()

    });

    res.status(201).json({
      message: "Product registered successfully.",
      product: warrantyDetails(product)
    });

  } catch (error) {

    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already registered a product with that serial number."
      });
    }

    console.error(error);

    res.status(500).json({
      message: "Could not register product."
    });
  }

});

// ===============================
// ADMIN ASSIGN PRODUCT
// ===============================

app.post("/api/admin/products", authenticate, requireAdmin, async (req, res) => {

  try {

    const {
      customerEmail,
      productName,
      brand,
      serialNumber,
      purchaseDate,
      warrantyMonths,
      notes = ""
    } = req.body;

    const email = String(customerEmail || "")
      .trim()
      .toLowerCase();

    if (
      !validText(email, 254) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validText(productName, 100) ||
      !validText(brand, 80) ||
      !validText(serialNumber, 100)
    ) {

      return res.status(400).json({
        message: "Enter a valid customer email, product name, brand and serial number."
      });

    }

    const date = new Date(purchaseDate);
    const months = Number(warrantyMonths);

    if (
      !purchaseDate ||
      Number.isNaN(date.getTime()) ||
      date > new Date()
    ) {

      return res.status(400).json({
        message: "Enter a valid purchase date that is not in the future."
      });

    }

    if (!Number.isInteger(months) || months < 0 || months > 120) {

      return res.status(400).json({
        message: "Warranty must be between 0 and 120 whole months."
      });

    }

    if (typeof notes !== "string" || notes.length > 500) {

      return res.status(400).json({
        message: "Notes must be 500 characters or fewer."
      });

    }

    // Check whether customer already has an account

    const customer = await User.findOne({
      email,
      role: "customer"
    });

    // Save product even if customer has not registered

    const product = await Product.create({

      ...(customer ? { owner: customer._id } : {}),

      customerEmail: email,
      productName: productName.trim(),
      brand: brand.trim(),
      serialNumber: serialNumber.trim(),
      purchaseDate: date,
      warrantyMonths: months,
      notes: notes.trim()

    });

    res.status(201).json({

      message: customer
        ? "Product assigned to customer successfully."
        : "Product saved. It will appear when the customer registers with this email.",

      product: warrantyDetails(product),

      customer: {
        name: customer ? customer.name : null,
        email
      }

    });

  } catch (error) {

    if (error.code === 11000) {

      return res.status(409).json({
        message: "This serial number may already be registered."
      });

    }

    console.error(error);

    res.status(500).json({
      message: "Could not save product."
    });

  }

});

// ===============================
// DELETE PRODUCT
// ===============================

app.delete("/api/products/:id", authenticate, async (req, res) => {

  try {

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found."
      });
    }

    if (
      req.user.role !== "admin" &&
      (!product.owner || !product.owner.equals(req.user._id))
    ) {
      return res.status(403).json({
        message: "You cannot delete this product."
      });
    }

    await ServiceRequest.deleteMany({
      product: product._id
    });

    await product.deleteOne();

    res.json({
      message: "Product and its service requests deleted."
    });

  } catch (error) {

    console.error(error);

    res.status(400).json({
      message: "Invalid product ID or could not delete product."
    });

  }

});

// ===============================
// GET SERVICE REQUESTS
// ===============================

app.get("/api/requests", authenticate, async (req, res) => {

  try {

    const filter = req.user.role === "admin"
      ? {}
      : { owner: req.user._id };

    const requests = await ServiceRequest.find(filter)
      .populate("product", "productName brand serialNumber")
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

    res.json({ requests });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not load service requests."
    });

  }

});

// ===============================
// CREATE SERVICE REQUEST
// ===============================

app.post("/api/requests", authenticate, async (req, res) => {

  try {

    const {
      productId,
      issue,
      preferredContact = ""
    } = req.body;

    if (!mongoose.isValidObjectId(productId)) {

      return res.status(400).json({
        message: "Select a valid product."
      });

    }

    if (!validText(issue, 1500)) {

      return res.status(400).json({
        message: "Describe the issue (maximum 1500 characters)."
      });

    }

    if (
      typeof preferredContact !== "string" ||
      preferredContact.length > 100
    ) {

      return res.status(400).json({
        message: "Preferred contact must be 100 characters or fewer."
      });

    }

    const product = await Product.findById(productId);

    if (
      !product ||
      (
        req.user.role !== "admin" &&
        (!product.owner || !product.owner.equals(req.user._id))
      )
    ) {

      return res.status(404).json({
        message: "Product not found."
      });

    }

    const ticketNumber =
      "WR-" +
      Date.now().toString().slice(-8) +
      "-" +
      Math.random().toString(36).slice(2, 5).toUpperCase();

    const request = await ServiceRequest.create({

      owner: product.owner,
      product: product._id,
      issue: issue.trim(),
      preferredContact: preferredContact.trim(),
      ticketNumber

    });

    const populated = await request.populate([

      {
        path: "product",
        select: "productName brand serialNumber"
      },

      {
        path: "owner",
        select: "name email"
      }

    ]);

    res.status(201).json({

      message: "Service request submitted.",
      request: populated

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not submit service request."
    });

  }

});

// ===============================
// ADMIN UPDATE REQUEST STATUS
// ===============================

app.patch("/api/requests/:id/status", authenticate, requireAdmin, async (req, res) => {

  try {

    const allowed = [
      "Submitted",
      "In Progress",
      "Resolved",
      "Rejected"
    ];

    const {
      status,
      adminNote = ""
    } = req.body;

    if (!allowed.includes(status)) {

      return res.status(400).json({
        message: "Choose a valid request status."
      });

    }

    if (
      typeof adminNote !== "string" ||
      adminNote.length > 1000
    ) {

      return res.status(400).json({
        message: "Admin note must be 1000 characters or fewer."
      });

    }

    const request = await ServiceRequest.findByIdAndUpdate(

      req.params.id,

      {
        status,
        adminNote: adminNote.trim()
      },

      {
        new: true,
        runValidators: true
      }

    )
      .populate("product", "productName brand serialNumber")
      .populate("owner", "name email");

    if (!request) {

      return res.status(404).json({
        message: "Service request not found."
      });

    }

    res.json({

      message: "Service request updated.",
      request

    });

  } catch (error) {

    console.error(error);

    res.status(400).json({
      message: "Invalid request ID or could not update request."
    });

  }

});

// ===============================
// CUSTOMER SUBMITS REVIEW
// Only after request is Resolved
// ===============================

app.patch("/api/requests/:id/review", authenticate, async (req, res) => {

  try {

    if (req.user.role !== "customer") {

      return res.status(403).json({
        message: "Only customers can submit reviews."
      });

    }

    if (!mongoose.isValidObjectId(req.params.id)) {

      return res.status(400).json({
        message: "Invalid service request."
      });

    }

    const rating = Number(req.body.rating);

    const review = String(req.body.review || "").trim();

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {

      return res.status(400).json({
        message: "Choose a rating from 1 to 5."
      });

    }

    if (!validText(review, 1000)) {

      return res.status(400).json({
        message: "Write a review (maximum 1000 characters)."
      });

    }

    const request = await ServiceRequest.findOne({

      _id: req.params.id,
      owner: req.user._id

    });

    if (!request) {

      return res.status(404).json({
        message: "Service request not found."
      });

    }

    if (request.status !== "Resolved") {

      return res.status(400).json({
        message: "You can review only resolved service requests."
      });

    }

    if (request.reviewedAt || request.rating !== null) {

      return res.status(409).json({
        message: "You have already reviewed this request."
      });

    }

    request.rating = rating;
    request.review = review;
    request.reviewedAt = new Date();

    await request.save();

    const populated = await request.populate([

      {
        path: "product",
        select: "productName brand serialNumber"
      },

      {
        path: "owner",
        select: "name email"
      }

    ]);

    res.json({

      message: "Thank you for your feedback.",
      request: populated

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not submit review."
    });

  }

});

// ===============================
// ADMIN GET CUSTOMER REVIEWS
// ===============================

app.get("/api/admin/reviews", authenticate, requireAdmin, async (req, res) => {

  try {

    const reviews = await ServiceRequest.find({

      rating: {
        $gte: 1,
        $lte: 5
      },

      reviewedAt: {
        $ne: null
      }

    })

      .populate("owner", "name email")
      .populate("product", "productName brand serialNumber")
      .sort({ reviewedAt: -1 });

    res.json({ reviews });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not load customer reviews."
    });

  }

});

// ===============================
// ADMIN SUMMARY
// ===============================

app.get("/api/admin/summary", authenticate, requireAdmin, async (req, res) => {

  try {

    const [
      customers,
      products,
      requests,
      openRequests,
      resolvedRequests
    ] = await Promise.all([

      User.countDocuments({ role: "customer" }),

      Product.countDocuments(),

      ServiceRequest.countDocuments(),

      ServiceRequest.countDocuments({
        status: {
          $in: ["Submitted", "In Progress"]
        }
      }),

      ServiceRequest.countDocuments({
        status: "Resolved"
      })

    ]);

    res.json({

      customers,
      products,
      requests,
      openRequests,
      resolvedRequests

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not load admin summary."
    });

  }

});

// ===============================
// ADMIN VIEW CUSTOMERS
// ===============================

app.get("/api/admin/customers", authenticate, requireAdmin, async (req, res) => {

  try {

    const customers = await User.find({
      role: "customer"
    })

      .select("name email createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const customerIds = customers.map(
      (customer) => customer._id
    );

    const productCounts = await Product.aggregate([

      {
        $match: {
          owner: {
            $in: customerIds
          }
        }
      },

      {
        $group: {
          _id: "$owner",
          count: {
            $sum: 1
          }
        }
      }

    ]);

    const countByCustomer = new Map(

      productCounts.map(
        (item) => [
          String(item._id),
          item.count
        ]
      )

    );

    res.json({

      customers: customers.map((customer) => ({

        id: String(customer._id),
        name: customer.name,
        email: customer.email,
        registeredAt: customer.createdAt,

        productCount:
          countByCustomer.get(String(customer._id)) || 0

      }))

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not load customers."
    });

  }

});

// ===============================
// CREATE ADMIN ACCOUNT
// ===============================

app.post("/api/admin/create", authenticate, requireAdmin, async (req, res) => {

  try {

    const name = String(req.body.name || "").trim();

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!name || !email || password.length < 8) {

      return res.status(400).json({

        message: "Enter a name, valid email, and password of at least 8 characters."

      });

    }

    const existing = await User.findOne({ email });

    if (existing) {

      return res.status(409).json({

        message: "An account with this email already exists."

      });

    }

    const newAdmin = await User.create({

      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin"

    });

    res.status(201).json({

      message: "Admin created successfully.",

      admin: {

        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role

      }

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Could not create admin."
    });

  }

});

// ===============================
// SEED ADMIN ACCOUNT
// ===============================

async function seedAdmin() {

  const email = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!email || !password) {

    console.warn(
      "Admin account not seeded: set ADMIN_EMAIL and ADMIN_PASSWORD in .env."
    );

    return;

  }

  const existing = await User.findOne({ email });

  if (existing) {

    if (existing.role !== "admin") {

      existing.role = "admin";

      await existing.save();

    }

    console.log(`Admin account ready: ${email}`);

    return;

  }

  const name = String(
    process.env.ADMIN_NAME || "Project Admin"
  ).trim();

  await User.create({

    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin"

  });

  console.log(`Admin account created: ${email}`);

}

// ===============================
// START SERVER
// ===============================

async function start() {

  try {

    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {

      throw new Error(
        "MONGODB_URI is missing from environment variables"
      );

    }

    console.log("MongoDB URI loaded:", Boolean(mongoURI));

    await mongoose.connect(mongoURI);

    console.log("Connected to MongoDB.");

    await seedAdmin();

    app.listen(PORT, () => {

      console.log(
        `Warranty Management System running on port ${PORT}`
      );

    });

  } catch (error) {

    console.error(
      "Could not start server:",
      error.message
    );

    process.exit(1);

  }

}

start();