import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

const CSRF_COOKIE_NAME = "csrfToken";

const isSafeMethod = (method: string) => ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
const isProduction = () => process.env.NODE_ENV === "production";

const csrfCookieOptions = {
  httpOnly: false, // doit etre lisible par le client pour double-submit
  secure: isProduction(),
  sameSite: "strict" as const,
  path: "/",
  maxAge: 12 * 60 * 60 * 1000, // 12h
};

export const issueCsrfToken = (res: Response): string => {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  return token;
};

export const clearCsrfToken = (res: Response) => {
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (isSafeMethod(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers["x-csrf-token"];

  const normalizedHeaderToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;

  if (!cookieToken || !normalizedHeaderToken) {
    return res.status(403).json({ message: "CSRF token missing" });
  }

  if (cookieToken !== normalizedHeaderToken) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  return next();
};
