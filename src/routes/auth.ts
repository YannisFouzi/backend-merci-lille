import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { validateLogin } from "../middleware/validation";
import { Admin } from "../models/Admin";

const router = express.Router();

// Stockage temporaire des refresh tokens (en production : Redis)
const refreshTokens = new Set<string>();

// Login route avec validation et refresh token
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

    // Generate tokens
    const accessToken = jwt.sign(
      { id: admin._id, type: "access" },
      process.env.JWT_SECRET as string,
      { expiresIn: "15m" } // Token court pour la sécurité
    );

    const refreshToken = jwt.sign(
      { id: admin._id, type: "refresh" },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" } // Refresh token plus long
    );

    // Stocker le refresh token
    refreshTokens.add(refreshToken);

    // Envoyer les tokens
    res.json({
      token: accessToken,
      refreshToken: refreshToken,
      expiresIn: 900, // 15 minutes en secondes
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Route pour rafraîchir le token
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    // Vérifier si le refresh token est dans notre store
    if (!refreshTokens.has(refreshToken)) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Vérifier la validité du refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET as string
    ) as {
      id: string;
      type: string;
    };

    if (decoded.type !== "refresh") {
      return res.status(401).json({ message: "Invalid token type" });
    }

    // Générer un nouveau access token
    const newAccessToken = jwt.sign(
      { id: decoded.id, type: "access" },
      process.env.JWT_SECRET as string,
      { expiresIn: "15m" }
    );

    res.json({
      token: newAccessToken,
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

// Logout avec révocation du refresh token
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Supprimer le refresh token du store
      refreshTokens.delete(refreshToken);
    }

    res.json({ message: "Logged out successfully" });
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
