import { Request, Response, NextFunction } from "express";
import { RateLimiterMongo } from "rate-limiter-flexible";
import mongoose from "mongoose";

/**
 * Rate Limiter pour protéger contre les attaques brute-force
 * Configuration: 5 tentatives max par IP sur 15 minutes
 * Stockage: MongoDB (persistant entre redémarrages)
 */

// Rate limiter sera initialisé APRÈS la connexion MongoDB
let rateLimiterMongo: RateLimiterMongo | null = null;

/**
 * Initialise le rate limiter APRÈS connexion MongoDB
 * À appeler depuis index.ts après mongoose.connect()
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
    console.log("✅ Rate limiter initialisé avec MongoDB");
  }
}

/**
 * Middleware de rate limiting pour les routes sensibles (login)
 * VÉRIFIE si l'IP est bloquée, mais ne consomme PAS de point
 * Les points sont consommés manuellement dans la route selon le résultat
 */
export const loginRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Si rate limiter pas encore initialisé, on laisse passer
    if (!rateLimiterMongo) {
      console.warn("⚠️ Rate limiter pas encore initialisé, requête autorisée");
      return next();
    }

    // Récupérer l'IP de l'utilisateur
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    // Vérifier si l'IP est bloquée (sans consommer de point)
    const rateLimiterRes = await rateLimiterMongo.get(ip);

    if (rateLimiterRes !== null && rateLimiterRes.consumedPoints >= 5) {
      // IP bloquée
      const retrySecs = Math.ceil(rateLimiterRes.msBeforeNext / 1000) || 900;
      return res.status(429).json({
        message: "Trop de tentatives de connexion échouées",
        error: `Veuillez réessayer dans ${Math.ceil(retrySecs / 60)} minutes`,
        retryAfter: retrySecs,
      });
    }

    // Pas bloqué, on continue (mais on ne consomme pas encore)
    next();
  } catch (error) {
    // Erreur technique
    console.error("Rate limiter check error");
    // On laisse passer pour ne pas bloquer le service
    next();
  }
};

/**
 * Fonction pour consommer un point (échec de connexion)
 * À appeler depuis la route de login en cas d'échec
 */
export const consumeLoginAttempt = async (ip: string) => {
  try {
    if (!rateLimiterMongo) return; // Pas encore initialisé
    await rateLimiterMongo.consume(ip);
  } catch (error) {
    // Silencieux, l'IP est déjà bloquée
  }
};

/**
 * Fonction pour réinitialiser le compteur (connexion réussie)
 * À appeler depuis la route de login en cas de succès
 */
export const resetLoginAttempts = async (ip: string) => {
  try {
    if (!rateLimiterMongo) return; // Pas encore initialisé
    await rateLimiterMongo.delete(ip);
  } catch (error) {
    // Silencieux, pas critique
  }
};
