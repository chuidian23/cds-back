const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const {
  createEnrollment,
  updateEnrollmentStatus,
  deleteEnrollment,
} = require("./controllers/enrollmentController");

// 1. Create connection pool
const pool = require("./db");

app.use((req, res, next) => {
  req.pool = pool; // Attach the pool to requests
  next();
});

// 2. Enhanced CORS configuration
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Add PUT/DELETE here
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// 3. Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. JWT Authentication middleware
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authorization token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") throw new Error();
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

app.use("/uploads", express.static("uploads"));

// 5. Admin login route
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    if (
      username === process.env.ADMIN_USER &&
      password === process.env.ADMIN_PASS
    ) {
      const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      res.json({ token });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 6. Admin routes
app.get("/api/admin/enrollments", authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id, first_name, last_name, email, mobile_phone, 
        course, birthdate, gender, civil_status, schedule,
        payment_method, status, receipt,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS enrollment_date
      FROM enrollments
      ORDER BY created_at DESC
    `);

    const parsedRows = rows.map((row) => {
      try {
        return {
          ...row,
          schedule: row.schedule
            ? typeof row.schedule === "string"
              ? JSON.parse(row.schedule)
              : row.schedule
            : [],
        };
      } catch (e) {
        console.error(
          `Error parsing schedule for enrollment ${row.id}:`,
          e,
          "Raw data:",
          row.schedule
        );
        return {
          ...row,
          schedule: [],
        };
      }
    });

    res.json(parsedRows);
  } catch (err) {
    console.error("Admin enrollments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/stats", authenticateAdmin, async (req, res) => {
  try {
    const [[total]] = await pool.query(
      "SELECT COUNT(*) AS count FROM enrollments"
    );
    const [byCourse] = await pool.query(`
      SELECT course, COUNT(*) AS count
      FROM enrollments 
      GROUP BY course
    `);

    res.json({
      total_enrollments: total.count,
      by_course: byCourse,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 7. Regular route
app.post("/api/enrollments", upload.single("receipt"), createEnrollment);

// 8. Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: `File upload error: ${err.message} (Max size: 5MB)`,
    });
  }
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 9. Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Update enrollment status
app.put(
  "/api/admin/enrollments/:id",
  authenticateAdmin,
  updateEnrollmentStatus,
  async (req, res) => {
    try {
      const [result] = await pool.query(
        "UPDATE enrollments SET status = ? WHERE id = ?",
        [req.body.status, req.params.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Update error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Delete enrollment
app.delete(
  "/api/admin/enrollments/:id",
  authenticateAdmin,
  deleteEnrollment,
  async (req, res) => {
    try {
      await pool.query("DELETE FROM enrollments WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

app.use(
  cors({
    origin: ["https://cds-frontend.onrender.com", "http://localhost:3000"],
  })
);
