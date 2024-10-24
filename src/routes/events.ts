import express from "express";
import { deleteImage, upload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { Event, validateEvent } from "../models/Event";

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
    const eventData = req.body;
    console.log("Received event data:", eventData);

    // Si un numéro d'événement est fourni manuellement
    if (eventData.eventNumber) {
      const existingEvent = await Event.findOne({
        eventNumber: eventData.eventNumber.padStart(3, "0"),
      });

      if (existingEvent) {
        return res.status(400).json({
          message: "Ce numéro d'événement existe déjà",
        });
      }

      if (isNaN(Number(eventData.eventNumber))) {
        return res.status(400).json({
          message: "Le numéro d'événement doit être un nombre",
        });
      }
    }

    const validation = await validateEvent(eventData);
    if (!validation.isValid) {
      console.log("Validation error:", validation.errors);
      return res.status(400).json({ message: validation.errors });
    }

    const newEvent = new Event(eventData);
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (error) {
    console.log("Complete error:", error);
    res.status(400).json({
      message: "Error creating event",
      error: error instanceof Error ? error.message : "Unknown error",
      details: error,
    });
  }
});

// Mise à jour avec nouvelle image optionnelle
router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const eventData = req.body;

    // Si le numéro est modifié, faire les vérifications
    if (eventData.eventNumber) {
      // Vérifier si le numéro existe déjà (sauf pour l'événement en cours)
      const existingEvent = await Event.findOne({
        eventNumber: eventData.eventNumber.padStart(3, "0"),
        _id: { $ne: req.params.id },
      });

      if (existingEvent) {
        return res.status(400).json({
          message: "Ce numéro d'événement existe déjà",
        });
      }

      // Vérifier si c'est un nombre valide
      if (isNaN(Number(eventData.eventNumber))) {
        return res.status(400).json({
          message: "Le numéro d'événement doit être un nombre",
        });
      }

      // Formater le numéro sur 3 chiffres
      eventData.eventNumber = eventData.eventNumber.padStart(3, "0");
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      { ...eventData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json(updatedEvent);
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(400).json({
      message: "Error updating event",
      error: error instanceof Error ? error.message : "Unknown error",
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
