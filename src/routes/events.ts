import express, { NextFunction, Request, Response } from "express";
import { deleteImage, upload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import {
  validateEvent,
  validateEventUpdate,
  validateUrlId,
} from "../middleware/validation";
import { Event } from "../models/Event";

const router = express.Router();

// Routes publiques
router.get("/", async (req: Request, res: Response) => {
  try {
    const events = await Event.find().sort({ date: -1 });
    res.json(events);
  } catch (error) {
    console.error("Error fetching events");
    res.status(500).json({ message: "Error fetching events" });
  }
});

// Validation d'URL ajoutée
router.get("/:id", validateUrlId, async (req: Request, res: Response) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    console.error("Error fetching event");
    res.status(500).json({ message: "Error fetching event" });
  }
});

// Routes protégées
router.post(
  "/",
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Fichier trop volumineux",
            details: "La taille maximale autorisée est de 3MB",
          });
        }
        if (err.message.includes("Type de fichier non autorisé")) {
          return res.status(400).json({
            message: "Type de fichier non autorisé",
            details: err.message,
          });
        }
        return res.status(400).json({
          message: "Erreur d'upload",
          details: err.message,
        });
      }
      next();
    });
  },
  validateEvent,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Image requise",
          details: "Aucun fichier n'a été uploadé",
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
  }
);

// Mise à jour avec validation d'URL
router.put(
  "/:id",
  validateUrlId,
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Fichier trop volumineux",
            details: "La taille maximale autorisée est de 3MB",
          });
        }
        if (err.message.includes("Type de fichier non autorisé")) {
          return res.status(400).json({
            message: "Type de fichier non autorisé",
            details: err.message,
          });
        }
        return res.status(400).json({
          message: "Erreur d'upload",
          details: err.message,
        });
      }
      next();
    });
  },
  validateEventUpdate,
  async (req: Request, res: Response) => {
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
      console.error("Error updating event");
      res.status(400).json({
        message: "Error updating event",
        error: "Erreur de mise à jour",
      });
    }
  }
);

// Suppression avec validation d'URL et logs nettoyés
router.delete(
  "/:id",
  validateUrlId,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const event = await Event.findById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (event.imagePublicId) {
        await deleteImage(event.imagePublicId);
      }

      await Event.findByIdAndDelete(req.params.id);
      res.json({ message: "Event deleted successfully" });
    } catch (error) {
      console.error("Error deleting event");
      res.status(500).json({
        message: "Error deleting event",
      });
    }
  }
);

export default router;
