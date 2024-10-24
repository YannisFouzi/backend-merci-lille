import express from "express";
import jwt from "jsonwebtoken";
import { Admin } from "../models/Admin";

const router = express.Router();

// Login route
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find admin
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Create initial admin account (should be secured or removed in production)
router.post("/setup", async (req, res) => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const admin = new Admin({
      username: "admin",
      password: "initialPassword123", // Change this immediately after creation
    });

    await admin.save();
    res.status(201).json({ message: "Admin account created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error creating admin account" });
  }
});

router.get("/check", async (req, res) => {
  try {
    const admins = await Admin.find({}, { username: 1 }); // Ne renvoie que les usernames
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Si c'est la première réinitialisation, pas besoin de l'ancien mot de passe
    const isFirstReset = admin.password === undefined || admin.password === "";

    if (!isFirstReset) {
      const isMatch = await admin.comparePassword(oldPassword);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid old password" });
      }
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Error resetting password" });
  }
});

router.delete("/clean", async (req, res) => {
  try {
    const result = await Admin.deleteMany({});
    console.log("Admins supprimés:", result);
    res.json({ message: "All admins deleted", result });
  } catch (error) {
    console.error("Erreur suppression:", error);
    res.status(500).json({ message: "Error deleting admins" });
  }
});

export default router;
