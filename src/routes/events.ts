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
    console.log("1. Request received:", {
      body: req.body,
      file: req.file,
    });

    const eventData = req.body;

    // Validation de l'image
    if (!req.file) {
      return res.status(400).json({
        message: "Image is required",
        details: "No file was uploaded",
      });
    }

    console.log("2. Image validation passed");

    // Ajout des données d'image
    eventData.imageSrc = req.file.path;
    eventData.imagePublicId =
      (req.file as any).filename || `event_${Date.now()}`;

    console.log("3. Image data added:", {
      imageSrc: eventData.imageSrc,
      imagePublicId: eventData.imagePublicId,
    });

    // Validation du numéro d'événement
    if (eventData.eventNumber) {
      const existingEvent = await Event.findOne({
        eventNumber: eventData.eventNumber.padStart(3, "0"),
      });

      if (existingEvent) {
        return res.status(400).json({
          message: "Ce numéro d'événement existe déjà",
          details: {
            eventNumber: eventData.eventNumber,
            existing: existingEvent._id,
          },
        });
      }
    }

    console.log("4. Event number validation passed");

    // Gestion des genres
    if (eventData.genres) {
      try {
        eventData.genres =
          typeof eventData.genres === "string"
            ? JSON.parse(eventData.genres)
            : eventData.genres;
      } catch (e) {
        return res.status(400).json({
          message: "Invalid genres format",
          details: e instanceof Error ? e.message : "Parse error",
        });
      }
    }

    console.log("5. Event data before save:", eventData);

    // Création de l'événement avec validation explicite
    try {
      const newEvent = new Event({
        ...eventData,
        genres: eventData.genres || [],
        isFree: eventData.isFree === "true" || eventData.isFree === true,
        price: eventData.price || null,
      });

      const validationError = newEvent.validateSync();
      if (validationError) {
        return res.status(400).json({
          message: "Validation failed",
          details: validationError.errors,
        });
      }

      await newEvent.save();
      res.status(201).json(newEvent);
    } catch (saveError) {
      console.error("6. Save error:", saveError);
      throw saveError;
    }
  } catch (error) {
    console.error("Complete error:", error);
    res.status(400).json({
      message: "Error creating event",
      error: error instanceof Error ? error.message : "Unknown error",
      details: JSON.stringify(error, null, 2),
    });
  }
});

// Mise à jour avec nouvelle image optionnelle
router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const eventData = req.body;

    if (req.file) {
      eventData.imageSrc = (req.file as any).path;
      eventData.imagePublicId =
        (req.file as any).filename || `event_${Date.now()}`;

      // Supprimer l'ancienne image si elle existe
      const oldEvent = await Event.findById(req.params.id);
      if (oldEvent?.imagePublicId) {
        await deleteImage(oldEvent.imagePublicId);
      }
    }

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
