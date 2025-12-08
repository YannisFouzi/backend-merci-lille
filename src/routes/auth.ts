import crypto from "crypto";
import express from "express";
import jwt from "jsonwebtoken";

import { authMiddleware, AuthRequest } from "../middleware/auth";
import { clearCsrfToken, issueCsrfToken } from "../middleware/csrf";
import {
  consumeLoginAttempt,
  loginRateLimiter,
  resetLoginAttempts,
} from "../middleware/rateLimiter";
import { validateLogin } from "../middleware/validation";
import { Admin } from "../models/Admin";
import { RefreshToken } from "../models/RefreshToken";
import { logger } from "../utils/logger";
import type { Request, Response } from "express";

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET as string;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_JWT_SECRET as string;
const ACCESS_TOKEN_EXP_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXP_DAYS = 7; // 7 days

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const buildCookieOptions = (maxAgeMs: number) => {
  const isSecure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict" as const,
    maxAge: maxAgeMs,
  };
};

const router = express.Router();
// CSRF token issuance for double-submit protection
router.get("/csrf", (_req: Request, res: Response) => {
  const token = issueCsrfToken(res);
  res.json({ csrfToken: token });
});

// Login route avec validation, rate limiting et refresh token (hashé)
router.post("/login", loginRateLimiter, validateLogin, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
      logger.error("Token secrets are not defined");
      return res.status(500).json({ message: "Server error" });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      await consumeLoginAttempt(ip);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      await consumeLoginAttempt(ip);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Nettoyage des anciens refresh tokens (garder 5)
    const existingTokens = await RefreshToken.find({
      adminId: admin._id,
      isRevoked: false,
    }).sort({ createdAt: -1 });

    if (existingTokens.length >= 5) {
      const tokensToRevoke = existingTokens.slice(4);
      await RefreshToken.updateMany(
        { _id: { $in: tokensToRevoke.map((t) => t._id) } },
        { isRevoked: true }
      );
    }

    const accessToken = jwt.sign({ id: admin._id, type: "access" }, ACCESS_TOKEN_SECRET, {
      expiresIn: `${ACCESS_TOKEN_EXP_SECONDS}s`,
    });

    const refreshTokenString = jwt.sign({ id: admin._id, type: "refresh" }, REFRESH_TOKEN_SECRET, {
      expiresIn: `${REFRESH_TOKEN_EXP_DAYS}d`,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXP_DAYS);

    await RefreshToken.create({
      tokenHash: hashToken(refreshTokenString),
      adminId: admin._id,
      expiresAt,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
      isRevoked: false,
    });

    await resetLoginAttempts(ip);

    res.cookie("accessToken", accessToken, buildCookieOptions(ACCESS_TOKEN_EXP_SECONDS * 1000));
    res.cookie(
      "refreshToken",
      refreshTokenString,
      buildCookieOptions(REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60 * 1000)
    );
    issueCsrfToken(res);

    res.json({
      message: "Login successful",
      expiresIn: ACCESS_TOKEN_EXP_SECONDS,
    });
  } catch (error) {
    logger.error({ err: error }, "Login attempt failed");
    res.status(500).json({ message: "Server error" });
  }
});

// Route pour rafraichir le token
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    if (!REFRESH_TOKEN_SECRET || !ACCESS_TOKEN_SECRET) {
      logger.error("Token secrets are not defined");
      return res.status(500).json({ message: "Server error" });
    }

    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    const tokenHash = hashToken(refreshToken);

    const storedToken = await RefreshToken.findOne({
      tokenHash,
      isRevoked: false,
    });

    if (!storedToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (storedToken.expiresAt < new Date()) {
      return res.status(401).json({ message: "Refresh token expired" });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as {
      id: string;
      type: string;
    };

    if (decoded.type !== "refresh") {
      return res.status(401).json({ message: "Invalid token type" });
    }

    storedToken.lastUsedAt = new Date();
    await storedToken.save();

    const newAccessToken = jwt.sign({ id: decoded.id, type: "access" }, ACCESS_TOKEN_SECRET, {
      expiresIn: `${ACCESS_TOKEN_EXP_SECONDS}s`,
    });

    res.cookie("accessToken", newAccessToken, buildCookieOptions(ACCESS_TOKEN_EXP_SECONDS * 1000));
    issueCsrfToken(res);

    res.json({
      message: "Token refreshed successfully",
      expiresIn: ACCESS_TOKEN_EXP_SECONDS,
    });
  } catch (error) {
    logger.error({ err: error }, "Token refresh failed");
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

// Logout avec révocation du refresh token
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await RefreshToken.updateOne({ tokenHash: hashToken(refreshToken) }, { isRevoked: true });
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    clearCsrfToken(res);

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error({ err: error }, "Logout attempt failed");
    res.status(500).json({ message: "Server error" });
  }
});

// Verify token route - nouvelle route pour vérifier la validité du token
router.get("/verify", authMiddleware, async (req: AuthRequest, res) => {
  try {
    res.json({ valid: true, admin: req.admin });
  } catch (error) {
    res.status(401).json({ valid: false, message: "Invalid token" });
  }
});

export default router;


