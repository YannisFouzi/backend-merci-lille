"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Admin_1 = require("../models/Admin");
const router = express_1.default.Router();
// Login route
router.post("/login", (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      const { username, password } = req.body;
      // Find admin
      const admin = yield Admin_1.Admin.findOne({ username });
      if (!admin) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      // Check password
      const isMatch = yield admin.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      // Generate JWT
      const token = jsonwebtoken_1.default.sign(
        { id: admin._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.json({ token });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  })
);
// Create initial admin account (should be secured or removed in production)
router.post("/setup", (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      const adminCount = yield Admin_1.Admin.countDocuments();
      if (adminCount > 0) {
        return res.status(400).json({ message: "Admin already exists" });
      }
      const admin = new Admin_1.Admin({
        username: "admin",
        password: "initialPassword123",
      });
      yield admin.save();
      res.status(201).json({ message: "Admin account created successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error creating admin account" });
    }
  })
);
router.get("/check", (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      const admins = yield Admin_1.Admin.find({}, { username: 1 }); // Ne renvoie que les usernames
      res.json(admins);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  })
);
router.post("/reset-password", (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      const { username, oldPassword, newPassword } = req.body;
      const admin = yield Admin_1.Admin.findOne({ username });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      // Si c'est la première réinitialisation, pas besoin de l'ancien mot de passe
      const isFirstReset =
        admin.password === undefined || admin.password === "";
      if (!isFirstReset) {
        const isMatch = yield admin.comparePassword(oldPassword);
        if (!isMatch) {
          return res.status(401).json({ message: "Invalid old password" });
        }
      }
      admin.password = newPassword;
      yield admin.save();
      res.json({ message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Error resetting password" });
    }
  })
);
router.delete("/clean", (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      const result = yield Admin_1.Admin.deleteMany({});
      console.log("Admins supprimés:", result);
      res.json({ message: "All admins deleted", result });
    } catch (error) {
      console.error("Erreur suppression:", error);
      res.status(500).json({ message: "Error deleting admins" });
    }
  })
);
exports.default = router;
