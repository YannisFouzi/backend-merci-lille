import cors from "cors";
import express from "express";
import { connectDB } from "./config/database";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: ["https://mercilille.com", "http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// Routes
app.use("/api/events", eventRoutes);
app.use("/api/auth", authRoutes);

// Connect to database and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
