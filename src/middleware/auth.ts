import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  admin?: { id: string };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
      return res.status(401).json({
        message: "Authentication required",
        error: "No authorization header provided",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
        error: "Invalid authorization format",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
        error: "No token provided",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not defined in environment variables");
      return res.status(500).json({
        message: "Server configuration error",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      id: string;
      iat?: number;
      exp?: number;
    };

    // Validation supplémentaire des données du token
    if (!decoded.id) {
      return res.status(401).json({
        message: "Authentication required",
        error: "Invalid token payload",
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    // Gestion spécifique des erreurs JWT
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        message: "Authentication required",
        error: "Token has expired",
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        message: "Authentication required",
        error: "Invalid token",
      });
    }

    return res.status(401).json({
      message: "Authentication required",
      error: "Token validation failed",
    });
  }
};
