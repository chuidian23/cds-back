// enrollmentController.js
const createEnrollment = async (req, res) => {
  const receiptPath = req.file ? req.file.path : null;

  let connection;
  try {
    connection = await req.pool.getConnection();
    const body = req.body;
    const schedule = JSON.parse(body.schedule || "[]");
    console.log(
      "Received enrollment request:",
      JSON.stringify(req.body, null, 2)
    );

    console.log("Incoming payload:", JSON.stringify(req.body, null, 2));

    // Destructure all fields from the frontend
    const {
      lastName,
      firstName,
      middleName,
      birthdate,
      gender,
      civilStatus,
      mobilePhone,
      email,
      course,
      paymentMethod,
    } = body;

    // Validate required fields
    const requiredFields = [
      "lastName",
      "firstName",
      "birthdate",
      "gender",
      "civilStatus",
      "mobilePhone",
      "email",
      "course",
      "paymentMethod",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const isSelfPaced = course.includes("Self-Paced");
    const scheduleData = isSelfPaced
      ? [
          {
            type: "self-paced",
            start_date: new Date().toISOString().split("T")[0],
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
          },
        ]
      : schedule;

    // ========== NEW VALIDATION CODE STARTS HERE ==========
    // Process schedule data to ensure valid format
    const validSchedule = isSelfPaced
      ? scheduleData
      : Array.isArray(scheduleData)
      ? scheduleData
          .map((session) => ({
            date: session.date ? session.date.split("T")[0] : null,
            time: session.time || null,
          }))
          .filter((session) => session.date !== null)
      : [];

    // First fully define scheduleJSON
    const scheduleJSON = JSON.stringify(
      validSchedule.length > 0
        ? validSchedule
        : isSelfPaced
        ? [
            {
              type: "self-paced",
              start_date: new Date().toISOString().split("T")[0],
              end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
            },
          ]
        : []
    );

    // THEN use it for logging
    console.log("Processed schedule data:", {
      isSelfPaced,
      scheduleData,
      validSchedule,
      scheduleJSON, // Now safe to use
    });

    console.log("Final schedule data:", {
      validSchedule,
      scheduleJSON,
    });

    // Additional validation for schedule dates
    if (!isSelfPaced && validSchedule.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one valid session date is required",
      });
    }
    // ========== NEW VALIDATION CODE ENDS HERE ==========

    // Convert schedule array to JSON string

    console.log("Final insert data:", {
      lastName,
      firstName,
      course,
      scheduleJSON,
      paymentMethod,
    });

    // Insert into database
    const [result] = await connection.query(
      `INSERT INTO enrollments (
        last_name, first_name, middle_name, birthdate, 
        gender, civil_status, mobile_phone, email, 
        course, schedule, payment_method, status, receipt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        lastName,
        firstName,
        middleName || null,
        new Date(birthdate).toISOString().split("T")[0],
        gender,
        civilStatus,
        mobilePhone,
        email,
        course,
        scheduleJSON,
        paymentMethod,
        "pending",
        receiptPath,
      ]
    );

    res.status(201).json({
      success: true,
      enrollmentId: result.insertId,
    });
  } catch (error) {
    // Enhanced error logging
    console.error("Database Error Details:", {
      message: error.message,
      sql: error.sql,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Server error. Please try again.",
    });
  }
};

const updateEnrollmentStatus = async (req, res) => {
  let connection;
  try {
    connection = await req.pool.getConnection();
    const { id } = req.params;
    const { status } = req.body;

    const [result] = await connection.query(
      "UPDATE enrollments SET status = $1 WHERE id = $2",
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Enrollment not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update enrollment status",
    });
  } finally {
    if (connection) connection.release();
  }
};

const deleteEnrollment = async (req, res) => {
  let connection;
  try {
    connection = await req.pool.getConnection();
    const { id } = req.params;

    await connection.query("DELETE FROM enrollments WHERE id = ?", [id]);

    res.json({ success: true });
  } catch (error) {
    console.error("Delete enrollment error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete enrollment",
    });
  } finally {
    if (connection) connection.release();
  }
};

// Update the exports
module.exports = {
  createEnrollment,
  updateEnrollmentStatus,
  deleteEnrollment,
};
