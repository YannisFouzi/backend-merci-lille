import cors from "cors";
import express from "express";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { connectDB } from "./config/database";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import galleryRoutes from "./routes/gallery";

const app = express();
const PORT = process.env.PORT || 3000;

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

// Limite de taille raisonnable pour les requêtes (sécurité)
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// CORS sécurisé
app.use(
  cors({
    origin: ["https://mercilille.com", "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
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
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/gallery", uploadLimiter, galleryRoutes);

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
