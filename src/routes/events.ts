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

/**
 * Fonction utilitaire pour renuméroter tous les événements NON masqués
 * Les événements masqués auront un eventNumber null
 * Utilise une stratégie en 3 temps pour éviter les conflits de clés uniques
 */
async function renumberVisibleEvents() {
  try {
    console.log("🔄 Début de la renumérotation...");
    
    // ÉTAPE 0 : IMPORTANT - Mettre les événements masqués à des valeurs uniques
    // On ne peut pas utiliser null car l'index unique ne permet qu'un seul null
    const hiddenEvents = await Event.find({ isHidden: true });
    for (const event of hiddenEvents) {
      await Event.findByIdAndUpdate(event._id, {
        eventNumber: `HIDDEN_${event._id}`, // Utiliser l'ID pour garantir l'unicité
      });
    }
    console.log(`✅ ${hiddenEvents.length} événement(s) masqué(s) marqué(s)`);

    // Récupérer tous les événements NON masqués, triés par order puis par date de création
    const visibleEvents = await Event.find({ isHidden: { $ne: true } })
      .sort({ order: 1, createdAt: -1 });

    console.log(`📋 ${visibleEvents.length} événements visibles à renuméroter`);

    // ÉTAPE 1 : Mettre des numéros temporaires pour éviter les conflits
    for (let i = 0; i < visibleEvents.length; i++) {
      await Event.findByIdAndUpdate(visibleEvents[i]._id, {
        eventNumber: `TEMP_${i}_${Date.now()}`, // Timestamp pour garantir l'unicité
      });
    }
    console.log("✅ Numéros temporaires appliqués");

    // ÉTAPE 2 : Mettre les vrais numéros (001, 002, 003...)
    for (let i = 0; i < visibleEvents.length; i++) {
      const newNumber = String(i + 1).padStart(3, "0");
      await Event.findByIdAndUpdate(visibleEvents[i]._id, {
        eventNumber: newNumber,
      });
    }
    console.log("✅ Numéros définitifs appliqués");

    console.log(`✅ Renumérotation terminée : ${visibleEvents.length} événements visibles`);
  } catch (error) {
    console.error("❌ Erreur lors de la renumérotation:", error);
    throw error;
  }
}

// Routes publiques
router.get("/", async (req: Request, res: Response) => {
  try {
    // Si c'est une requête admin (via query param), retourner TOUS les événements
    // Sinon, filtrer les événements masqués
    const includeHidden = req.query.includeHidden === "true";
    const filter = includeHidden ? {} : { isHidden: { $ne: true } };
    
    const events = await Event.find(filter).sort({ order: 1, createdAt: -1 });
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

// Route pour mettre à jour l'ordre des événements (AVANT /:id pour éviter les conflits)
router.put(
  "/update-order",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body;

      if (!orderedIds || !Array.isArray(orderedIds)) {
        return res
          .status(400)
          .json({ message: "Invalid ordered IDs provided" });
      }

      // ÉTAPE 1 : Mettre des eventNumber temporaires pour éviter les conflits de unique constraint
      // On utilise des préfixes "TEMP_" pour éviter les doublons pendant la mise à jour
      for (let i = 0; i < orderedIds.length; i++) {
        await Event.findByIdAndUpdate(
          orderedIds[i],
          { 
            order: i,
            eventNumber: `TEMP_${i}_${Date.now()}`  // Timestamp pour garantir l'unicité
          }
        );
      }

      // ÉTAPE 2 : Renuméroter avec les vrais numéros (ordre inversé)
      // Le premier visuel (en haut) = dernier numéro, le dernier visuel (en bas) = #001
      // Car on affiche les événements récents en premier
      for (let i = 0; i < orderedIds.length; i++) {
        const paddedNumber = String(orderedIds.length - i).padStart(3, "0");
        await Event.findByIdAndUpdate(
          orderedIds[i],
          { 
            eventNumber: paddedNumber
          }
        );
      }

      res.json({ message: "Event order updated successfully" });
    } catch (error) {
      console.error("Error updating event order:", error);
      res.status(500).json({ message: "Error updating event order" });
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
      
      // Renuméroter tous les événements visibles après suppression
      await renumberVisibleEvents();
      
      res.json({ message: "Event deleted successfully" });
    } catch (error) {
      console.error("Error deleting event");
      res.status(500).json({
        message: "Error deleting event",
      });
    }
  }
);

// Masquer un événement
router.patch(
  "/:id/hide",
  validateUrlId,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const event = await Event.findByIdAndUpdate(
        req.params.id,
        { isHidden: true },
        { new: true }
      );
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Renuméroter tous les événements visibles
      await renumberVisibleEvents();
      
      res.json(event);
    } catch (error) {
      console.error("Error hiding event");
      res.status(500).json({ message: "Error hiding event" });
    }
  }
);

// Démasquer un événement
router.patch(
  "/:id/unhide",
  validateUrlId,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const event = await Event.findByIdAndUpdate(
        req.params.id,
        { isHidden: false },
        { new: true }
      );
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Renuméroter tous les événements visibles
      await renumberVisibleEvents();
      
      res.json(event);
    } catch (error) {
      console.error("Error unhiding event");
      res.status(500).json({ message: "Error unhiding event" });
    }
  }
);

// Masquer plusieurs événements
router.post(
  "/hide-multiple",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { eventIds } = req.body;
      if (!eventIds || !Array.isArray(eventIds)) {
        return res.status(400).json({ message: "Invalid event IDs provided" });
      }

      await Event.updateMany(
        { _id: { $in: eventIds } },
        { isHidden: true }
      );

      // Renuméroter tous les événements visibles
      await renumberVisibleEvents();

      res.json({ message: `${eventIds.length} event(s) hidden successfully` });
    } catch (error) {
      console.error("Error hiding events");
      res.status(500).json({ message: "Error hiding events" });
    }
  }
);

// Démasquer plusieurs événements
router.post(
  "/unhide-multiple",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { eventIds } = req.body;
      if (!eventIds || !Array.isArray(eventIds)) {
        return res.status(400).json({ message: "Invalid event IDs provided" });
      }

      await Event.updateMany(
        { _id: { $in: eventIds } },
        { isHidden: false }
      );

      // Renuméroter tous les événements visibles
      await renumberVisibleEvents();

      res.json({ message: `${eventIds.length} event(s) unhidden successfully` });
    } catch (error) {
      console.error("Error unhiding events");
      res.status(500).json({ message: "Error unhiding events" });
    }
  }
);

// Route utilitaire pour forcer la renumérotation (pour corriger manuellement si besoin)
router.post(
  "/renumber-all",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      await renumberVisibleEvents();
      res.json({ message: "All visible events renumbered successfully" });
    } catch (error) {
      console.error("Error renumbering events");
      res.status(500).json({ message: "Error renumbering events" });
    }
  }
);

// Marquer un événement comme phare
router.patch(
  "/:id/feature",
  validateUrlId,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const event = await Event.findByIdAndUpdate(
        req.params.id,
        { isFeatured: true },
        { new: true }
      );
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Error featuring event");
      res.status(500).json({ message: "Error featuring event" });
    }
  }
);

// Retirer le statut phare d'un événement
router.patch(
  "/:id/unfeature",
  validateUrlId,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const event = await Event.findByIdAndUpdate(
        req.params.id,
        { isFeatured: false },
        { new: true }
      );
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Error unfeaturing event");
      res.status(500).json({ message: "Error unfeaturing event" });
    }
  }
);

// Marquer plusieurs événements comme phares
router.post(
  "/feature-multiple",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { eventIds } = req.body;
      if (!eventIds || !Array.isArray(eventIds)) {
        return res.status(400).json({ message: "Invalid event IDs provided" });
      }

      await Event.updateMany(
        { _id: { $in: eventIds } },
        { isFeatured: true }
      );

      res.json({ message: `${eventIds.length} event(s) marked as featured successfully` });
    } catch (error) {
      console.error("Error featuring events");
      res.status(500).json({ message: "Error featuring events" });
    }
  }
);

// Retirer le statut phare de plusieurs événements
router.post(
  "/unfeature-multiple",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { eventIds } = req.body;
      if (!eventIds || !Array.isArray(eventIds)) {
        return res.status(400).json({ message: "Invalid event IDs provided" });
      }

      await Event.updateMany(
        { _id: { $in: eventIds } },
        { isFeatured: false }
      );

      res.json({ message: `${eventIds.length} event(s) unmarked as featured successfully` });
    } catch (error) {
      console.error("Error unfeaturing events");
      res.status(500).json({ message: "Error unfeaturing events" });
    }
  }
);

export default router;
