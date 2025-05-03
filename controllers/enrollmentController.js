// enrollmentController.js

const calculateAge = (birthdate) => {
  const today = new Date();
  const birthDate = new Date(birthdate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
};

const createEnrollment = async (req, res) => {
  const receiptFile = req.files?.receipt?.[0];
  const studentPermitFile = req.files?.studentPermit?.[0];

  if (!receiptFile) {
    return res.status(400).json({
      success: false,
      error: "Payment receipt is required",
    });
  }

  const receiptPath = receiptFile?.path || null;
  const studentPermitPath = studentPermitFile?.path || null;

  try {
    const body = req.body;
    const schedule = JSON.parse(body.schedule || "[]");
    const requiresStudentPermit = ![
      "TDC (Face to Face)",
      "OTDC (Self-Paced)",
    ].includes(body.course);

    if (requiresStudentPermit && !studentPermitPath) {
      return res.status(400).json({
        success: false,
        error: "Student Permit is required for this course",
      });
    }

    console.log(
      "Received enrollment request:",
      JSON.stringify(req.body, null, 2)
    );
    const birthdate = new Date(body.birthdate);
    const age = calculateAge(body.birthdate);
    const minAge = ["TDC (Face to Face)", "OTDC (Self-Paced)"].includes(
      body.course
    )
      ? 16
      : 17;

    if (age < minAge) {
      return res.status(400).json({
        success: false,
        error: `Age requirement not met. Minimum age for ${body.course} is ${minAge}`,
      });
    }

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

    // Process schedule data
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

    console.log("Final parameters:", [
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
    ]);

    // Convert schedule array to JSON string

    console.log("Final insert data:", {
      lastName,
      firstName,
      course,
      scheduleJSON,
      paymentMethod,
    });

    // Insert into database
    const result = await req.db.query(
      `INSERT INTO enrollments (
        last_name, first_name, middle_name, birthdate, 
        gender, civil_status, mobile_phone, email, 
        course, schedule, payment_method, status, 
        student_permit, receipt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
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
        studentPermitPath,
        receiptPath,
      ]
    );

    res.status(201).json({
      success: true,
      enrollmentId: result.rows[0].id, // PostgreSQL returns data in .rows
    });
  } catch (error) {
    console.error("Database Error Details:", error);
    res.status(500).json({
      success: false,
      error: "Server error. Please try again.",
    });
  }
};

const updateEnrollmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await req.db.query(
      "UPDATE enrollments SET status = $1 WHERE id = $2",
      [status, id]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Enrollment not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
};

const deleteEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await req.db.query("DELETE FROM enrollments WHERE id = $1", [
      id,
    ]);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Enrollment not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ success: false, error: "Failed to delete" });
  }
};

// Update the exports
module.exports = {
  createEnrollment,
  updateEnrollmentStatus,
  deleteEnrollment,
};
