import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { validateLogin } from "../middleware/validation";
import { Admin } from "../models/Admin";
import { RefreshToken } from "../models/RefreshToken";

const router = express.Router();

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

    // Révoquer les anciens refresh tokens de cet admin (nettoyage)
    // On garde uniquement les 5 derniers actifs pour permettre multi-device
    const existingTokens = await RefreshToken.find({
      adminId: admin._id,
      isRevoked: false,
    }).sort({ createdAt: -1 });

    if (existingTokens.length >= 5) {
      // Révoquer les tokens au-delà des 5 plus récents
      const tokensToRevoke = existingTokens.slice(4);
      await RefreshToken.updateMany(
        { _id: { $in: tokensToRevoke.map((t) => t._id) } },
        { isRevoked: true }
      );
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: admin._id, type: "access" },
      process.env.JWT_SECRET as string,
      { expiresIn: "15m" } // Token court pour la sécurité
    );

    const refreshTokenString = jwt.sign(
      { id: admin._id, type: "refresh" },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" } // Refresh token plus long
    );

    // Stocker le refresh token dans MongoDB avec informations de sécurité
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 jours

    await RefreshToken.create({
      token: refreshTokenString,
      adminId: admin._id,
      expiresAt,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
      isRevoked: false,
    });

    // Envoyer les tokens
    res.json({
      token: accessToken,
      refreshToken: refreshTokenString,
      expiresIn: 900, // 15 minutes en secondes
    });
  } catch (error) {
    console.error("Login error:", error);
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

    // Vérifier si le refresh token existe dans MongoDB et n'est pas révoqué
    const storedToken = await RefreshToken.findOne({
      token: refreshToken,
      isRevoked: false,
    });

    if (!storedToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Vérifier si le token a expiré (double vérification, MongoDB TTL le supprimera aussi)
    if (storedToken.expiresAt < new Date()) {
      return res.status(401).json({ message: "Refresh token expired" });
    }

    // Vérifier la validité du JWT refresh token
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

    // Mettre à jour la date de dernière utilisation
    storedToken.lastUsedAt = new Date();
    await storedToken.save();

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
    console.error("Refresh token error:", error);
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

// Logout avec révocation du refresh token
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Révoquer le refresh token dans MongoDB
      await RefreshToken.updateOne(
        { token: refreshToken },
        { isRevoked: true }
      );
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
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
