import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { validateLogin } from "../middleware/validation";
import { Admin } from "../models/Admin";

const router = express.Router();

// Login route avec validation
router.post("/login", validateLogin, async (req: Request, res: Response) => {
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

// Verify token route - nouvelle route pour vérifier la validité du token
router.get("/verify", authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Si on arrive ici, c'est que le token est valide (grâce au middleware)
    res.json({ valid: true, admin: req.admin });
  } catch (error) {
    res.status(401).json({ valid: false, message: "Invalid token" });
  }
});

// Routes d'administration dangereuses supprimées pour la sécurité :
// - /setup : Création d'admin avec mot de passe en dur
// - /check : Exposition de la liste des administrateurs
// - /reset-password : Reset non sécurisé sans authentification
//
// L'administrateur dispose déjà d'un compte sécurisé via setup-admin.js

export default router;
