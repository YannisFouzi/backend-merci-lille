import cors from "cors";
import express from "express";
import { connectDB } from "./config/database";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import galleryRoutes from "./routes/gallery";

const app = express();
const PORT = process.env.PORT || 3000;

// Augmenter la limite de taille pour les requêtes
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

app.use(
  cors({
    origin: ["https://mercilille.com", "http://localhost:5173"],
    credentials: true,
  })
);

// Routes
app.use("/api/events", eventRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/gallery", galleryRoutes);

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
