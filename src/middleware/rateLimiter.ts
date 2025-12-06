import { NextFunction, Request, Response } from "express";
import { RateLimiterMongo } from "rate-limiter-flexible";
import mongoose from "mongoose";
import { logger } from "../utils/logger";

/**
 * Rate Limiter pour protéger contre le brute-force.
 * 5 tentatives max par IP sur 15 minutes, stockage Mongo (persistant).
 */
let rateLimiterMongo: RateLimiterMongo | null = null;

/**
 * Initialise le rate limiter après connexion MongoDB.
 * À appeler depuis index.ts après mongoose.connect().
 */
export function initRateLimiter() {
  if (!rateLimiterMongo) {
    rateLimiterMongo = new RateLimiterMongo({
      storeClient: mongoose.connection,
      keyPrefix: "login_fail_ip",
      points: 5,
      duration: 15 * 60,
      blockDuration: 15 * 60,
    });
    logger.info("Rate limiter initialisé avec MongoDB");
  }
}

/**
 * Middleware de rate limiting pour les routes sensibles (login).
 * Vérifie si l'IP est bloquée sans consommer de points.
 */
export const loginRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!rateLimiterMongo) {
      logger.warn("Rate limiter pas encore initialisé, requête autorisée");
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const rateLimiterRes = await rateLimiterMongo.get(ip);

    if (rateLimiterRes !== null && rateLimiterRes.consumedPoints >= 5) {
      const retrySecs = Math.ceil(rateLimiterRes.msBeforeNext / 1000) || 900;
      return res.status(429).json({
        message: "Trop de tentatives de connexion échouées",
        error: `Veuillez réessayer dans ${Math.ceil(retrySecs / 60)} minutes`,
        retryAfter: retrySecs,
      });
    }

    return next();
  } catch (error) {
    logger.error({ err: error }, "Rate limiter check error");
    return next();
  }
};

/**
 * Consomme un point (échec de connexion).
 */
export const consumeLoginAttempt = async (ip: string) => {
  try {
    if (!rateLimiterMongo) return;
    await rateLimiterMongo.consume(ip);
  } catch {
    // silencieux
  }
};

/**
 * Réinitialise le compteur (succès de connexion).
 */
export const resetLoginAttempts = async (ip: string) => {
  try {
    if (!rateLimiterMongo) return;
    await rateLimiterMongo.delete(ip);
  } catch {
    // silencieux
  }
};
