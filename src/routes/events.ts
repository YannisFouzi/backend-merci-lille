import express from "express";
import { deleteImage, upload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { Event } from "../models/Event";

const router = express.Router();

interface ErrorWithMessage {
  message: string;
  toString(): string;
}

// Helper function to ensure error has message
const isErrorWithMessage = (error: unknown): error is ErrorWithMessage => {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  );
};

const getErrorMessage = (error: unknown): string => {
  if (isErrorWithMessage(error)) return error.message;
  return "An unknown error occurred";
};

// Routes publiques
router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ date: -1 });
    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// Routes protégées avec upload d'image
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    console.log("=== Début création événement ===");
    console.log("Body reçu:", JSON.stringify(req.body, null, 2));
    console.log("File reçu:", req.file);
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    console.log("Body:", JSON.stringify(req.body, null, 2));
    console.log(
      "File:",
      req.file ? JSON.stringify(req.file, null, 2) : "No file"
    );

    if (!req.file) {
      console.log("Erreur: Image manquante");
      return res.status(400).json({ message: "Image is required" });
    }

    const eventData = {
      ...req.body,
      imageSrc: req.file.path,
      imagePublicId: req.file.filename,
    };
    console.log("EventData:", JSON.stringify(eventData, null, 2));

    try {
      const newEvent = new Event(eventData);
      console.log("Nouvel événement créé:", JSON.stringify(newEvent, null, 2));
      const savedEvent = await newEvent.save();
      console.log("Événement sauvegardé:", JSON.stringify(savedEvent, null, 2));
      res.status(201).json(savedEvent);
    } catch (mongoError) {
      console.error("Erreur MongoDB:", mongoError);
      console.error(
        "Stack:",
        mongoError instanceof Error ? mongoError.stack : "No stack"
      );
      throw mongoError;
    }
  } catch (error) {
    console.error("Erreur finale:", error);
    res.status(500).json({
      message: "Error creating event",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Mise à jour avec nouvelle image optionnelle
router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    console.log("Update - Body reçu:", req.body);
    console.log("Update - Fichier reçu:", req.file);

    const event = await Event.findById(req.params.id);
    if (!event) {
      console.log("Event not found:", req.params.id);
      return res.status(404).json({ message: "Event not found" });
    }

    const updateData = { ...req.body };

    if (req.file) {
      console.log("Nouvelle image à uploader");
      if (event.imagePublicId) {
        console.log("Suppression ancienne image:", event.imagePublicId);
        await deleteImage(event.imagePublicId);
      }

      updateData.imageSrc = req.file.path;
      updateData.imagePublicId = req.file.filename;
    }

    console.log("Données de mise à jour:", updateData);

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      { ...updateData, updatedAt: Date.now() },
      { new: true }
    );

    console.log("Événement mis à jour:", updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    console.error("Erreur mise à jour:", error);
    res.status(500).json({
      message: "Error updating event",
      error: getErrorMessage(error),
      details: error instanceof Error ? error.toString() : "Unknown error",
    });
  }
});

// Suppression avec nettoyage de l'image
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    console.log("Tentative de suppression de l'événement:", req.params.id);

    const event = await Event.findById(req.params.id);
    if (!event) {
      console.log("Event not found for deletion:", req.params.id);
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.imagePublicId) {
      console.log("Suppression de l'image:", event.imagePublicId);
      await deleteImage(event.imagePublicId);
    }

    await Event.findByIdAndDelete(req.params.id);
    console.log("Événement supprimé avec succès");

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Erreur suppression:", error);
    res.status(500).json({
      message: "Error deleting event",
      error: getErrorMessage(error),
      details: error instanceof Error ? error.toString() : "Unknown error",
    });
  }
});

export default router;
