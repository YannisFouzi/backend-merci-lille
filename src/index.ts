import "dotenv/config"; // ⚠️ IMPORTANT : Charger les variables d'environnement en PREMIER
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { connectDB } from "./config/database";
import { initRateLimiter } from "./middleware/rateLimiter";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import galleryRoutes from "./routes/gallery";
import shotgunSyncRoutes from "./routes/shotgun-sync";
import { logger } from "./utils/logger";

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - IMPORTANT pour Railway, Render, Heroku, AWS, etc.
// Permet à Express de lire correctement l'IP du client derrière un proxy inverse
// 1 = Faire confiance UNIQUEMENT au premier proxy (Railway)
// Cela empêche les attaquants de forger des headers X-Forwarded-For
app.set("trust proxy", 1);

// Middlewares de sécurité
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Pour Cloudinary
  })
);

// Protection contre les injections NoSQL
app.use(
  mongoSanitize({
    replaceWith: "_", // Remplace les caractères dangereux par _
  })
);

// Rate limiting général
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requêtes par IP
  message: {
    error: "Trop de requêtes, veuillez réessayer plus tard.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting pour l'authentification (plus strict)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 tentatives de connexion par IP
  message: {
    error:
      "Trop de tentatives de connexion, veuillez réessayer dans 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting pour les uploads (très strict)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 uploads par minute
  message: {
    error: "Trop d'uploads, veuillez ralentir.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// Cookie parser pour les cookies httpOnly (sécurité)
app.use(cookieParser());

// Limite de taille raisonnable pour les requêtes (sécurité)
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// CORS sécurisé
// Configuration flexible : utilise CORS_ORIGINS si défini, sinon valeurs par défaut
// Format CORS_ORIGINS: "https://mercilille.com,https://app.railway.app,http://localhost:5173"
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["https://mercilille.com", "http://localhost:5173"];

// Validation des origines (sécurité supplémentaire)
const isValidOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    // Autoriser uniquement HTTPS en production (sauf localhost)
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !origin.includes("localhost")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const validatedOrigins = allowedOrigins.filter(isValidOrigin);

// Fallback vers les origines par défaut si aucune origine valide n'est trouvée
const finalOrigins = validatedOrigins.length > 0 
  ? validatedOrigins 
  : ["https://mercilille.com", "http://localhost:5173"];

if (validatedOrigins.length === 0 && process.env.CORS_ORIGINS) {
  logger.warn(
    { providedOrigins: allowedOrigins },
    "No valid CORS origins found in CORS_ORIGINS, using defaults"
  );
}

logger.info(
  { origins: finalOrigins, count: finalOrigins.length },
  "CORS origins configured"
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Autoriser les requêtes sans origin (ex: Postman, curl)
      if (!origin) {
        return callback(null, true);
      }

      if (finalOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn({ origin, allowedOrigins: finalOrigins }, "CORS: Origin not allowed");
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: [],
    maxAge: 86400, // 24 heures pour le preflight cache
  })
);

// Protection CSRF basique pour les requêtes non-GET
app.use((req, res, next) => {
  // Ignorer CSRF pour les requêtes GET et les routes publiques
  if (
    req.method === "GET" ||
    (req.path.startsWith("/api/events") && req.method === "GET")
  ) {
    return next();
  }

  // Appliquer CSRF seulement aux routes backend protégées
  const protectedRoutes = ["/api/auth", "/api/events", "/api/gallery"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    req.path.startsWith(route)
  );

  if (isProtectedRoute) {
    // Vérifier la présence d'un header custom pour les requêtes AJAX
    const customHeader = req.headers["x-requested-with"];
    if (!customHeader) {
      return res.status(403).json({
        message: "Requête non autorisée - Header de sécurité manquant",
      });
    }
  }

  next();
});

// Route de santé pour le ping (sans rate limiting)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Routes avec rate limiting spécifique
// Note: Le rate limiting sur /api/auth/login est géré par loginRateLimiter (MongoDB)
// dans auth.ts - pas besoin de limiter toutes les routes auth
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/gallery", uploadLimiter, galleryRoutes);
app.use("/api/shotgun-sync", shotgunSyncRoutes);

app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(
      {
        err,
        path: req.path,
        method: req.method,
      },
      "Unhandled error"
    );

    if (res.headersSent) {
      return next(err);
    }

    return res.status(500).json({ message: "Une erreur inattendue s'est produite" });
  }
);

// Connect to database and start server
connectDB().then(() => {
  // Initialiser le rate limiter APRÈS connexion MongoDB
  initRateLimiter();
  
  app.listen(PORT, () => {
    logger.info({ port: PORT }, "Server running");
  });
});
