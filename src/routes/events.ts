import express from "express";
import { deleteImage, upload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { Event } from "../models/Event";

const router = express.Router();

// Routes publiques
router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ date: -1 });
    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: "Error fetching events" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ message: "Error fetching event" });
  }
});

// Routes protégées
router.post("/", authMiddleware, upload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Image is required",
        details: "No file was uploaded",
      });
    }

    const eventData = {
      ...req.body,
      imageSrc: req.file.path,
      imagePublicId: (req.file as any).filename,
    };

    const newEvent = new Event(eventData);
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(400).json({
      message: "Error creating event",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Mise à jour avec nouvelle image optionnelle
router.put("/:id", authMiddleware, upload, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Si une nouvelle image est uploadée
    if (req.file) {
      // Supprimer l'ancienne image si elle existe
      if (event.imagePublicId) {
        await deleteImage(event.imagePublicId);
      }
      event.imageSrc = req.file.path;
      event.imagePublicId = (req.file as any).filename;
    }

    // Mettre à jour les autres champs
    Object.assign(event, req.body);

    await event.save();
    res.json(event);
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
      error: error instanceof Error ? error.message : "Unknown error",
      details: error instanceof Error ? error.toString() : "Unknown error",
    });
  }
});

export default router;
