import express, { NextFunction, Request, Response } from "express";
import { deleteImage, upload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import {
  validateEvent,
  validateEventUpdate,
  validateUrlId,
} from "../middleware/validation";
import { Event } from "../models/Event";
import { logger } from "../utils/logger";

const router = express.Router();

/**
 * Fonction utilitaire pour renumÃ©roter tous les Ã©vÃ©nements NON masquÃ©s
 * Les Ã©vÃ©nements masquÃ©s auront un eventNumber null
 * Utilise une stratÃ©gie en 3 temps pour Ã©viter les conflits de clÃ©s uniques
 */
async function renumberVisibleEvents() {
  try {
    logger.info("ðŸ”„ DÃ©but de la renumÃ©rotation...");
    
    // Ã‰TAPE 0 : IMPORTANT - Mettre les Ã©vÃ©nements masquÃ©s Ã  des valeurs uniques
    // On ne peut pas utiliser null car l'index unique ne permet qu'un seul null
    const hiddenEvents = await Event.find({ isHidden: true });
    for (const event of hiddenEvents) {
      await Event.findByIdAndUpdate(event._id, {
        eventNumber: `HIDDEN_${event._id}`, // Utiliser l'ID pour garantir l'unicitÃ©
      });
    }
    logger.info(`âœ… ${hiddenEvents.length} Ã©vÃ©nement(s) masquÃ©(s) marquÃ©(s)`);

    // RÃ©cupÃ©rer tous les Ã©vÃ©nements NON masquÃ©s, triÃ©s par order puis par date de crÃ©ation
    const visibleEvents = await Event.find({ isHidden: { $ne: true } })
      .sort({ order: 1, createdAt: -1 });

    logger.info(`ðŸ“‹ ${visibleEvents.length} Ã©vÃ©nements visibles Ã  renumÃ©roter`);

    // Ã‰TAPE 1 : Mettre des numÃ©ros temporaires pour Ã©viter les conflits
    for (let i = 0; i < visibleEvents.length; i++) {
      await Event.findByIdAndUpdate(visibleEvents[i]._id, {
        eventNumber: `TEMP_${i}_${Date.now()}`, // Timestamp pour garantir l'unicitÃ©
      });
    }
    logger.info("âœ… NumÃ©ros temporaires appliquÃ©s");

    // Ã‰TAPE 2 : Mettre les vrais numÃ©ros (001, 002, 003...)
    for (let i = 0; i < visibleEvents.length; i++) {
      const newNumber = String(i + 1).padStart(3, "0");
      await Event.findByIdAndUpdate(visibleEvents[i]._id, {
        eventNumber: newNumber,
      });
    }
    logger.info("âœ… NumÃ©ros dÃ©finitifs appliquÃ©s");

    logger.info(`âœ… RenumÃ©rotation terminÃ©e : ${visibleEvents.length} Ã©vÃ©nements visibles`);
  } catch (error) {
    logger.error({ err: error }, "Erreur lors de la renumerotation");
    throw error;
  }
}

// Routes publiques
router.get("/", async (req: Request, res: Response) => {
  try {
    // Si c'est une requÃªte admin (via query param), retourner TOUS les Ã©vÃ©nements
    // Sinon, filtrer les Ã©vÃ©nements masquÃ©s
    const includeHidden = req.query.includeHidden === "true";
    const filter = includeHidden ? {} : { isHidden: { $ne: true } };
    
    const events = await Event.find(filter).sort({ order: 1, createdAt: -1 });
    res.json(events);
  } catch (error) {
    logger.error("Error fetching events");
    res.status(500).json({ message: "Error fetching events" });
  }
});

// Validation d'URL ajoutÃ©e
router.get("/:id", validateUrlId, async (req: Request, res: Response) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    logger.error("Error fetching event");
    res.status(500).json({ message: "Error fetching event" });
  }
});

// Routes protÃ©gÃ©es
router.post(
  "/",
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Fichier trop volumineux",
            details: "La taille maximale autorisÃ©e est de 3MB",
          });
        }
        if (err.message.includes("Type de fichier non autorisÃ©")) {
          return res.status(400).json({
            message: "Type de fichier non autorisÃ©",
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
          details: "Aucun fichier n'a Ã©tÃ© uploadÃ©",
        });
      }

      const isFree = req.body.isFree === "true" || req.body.isFree === true;
      const priceValue = isFree
        ? 0
        : req.body.price
        ? Number.parseFloat(req.body.price)
        : 0;

      const eventData = {
        ...req.body,
        isFree,
        price: Number.isFinite(priceValue) ? priceValue : 0,
        imageSrc: req.file.path,
        imagePublicId: (req.file as any).filename,
      };

      const newEvent = new Event(eventData);
      await newEvent.save();
      res.status(201).json(newEvent);
    } catch (error) {
      logger.error({ err: error }, "Error creating event");
      res.status(400).json({
        message: "Error creating event",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Route pour mettre Ã  jour l'ordre des Ã©vÃ©nements (AVANT /:id pour Ã©viter les conflits)
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

      // Ã‰TAPE 1 : Mettre des eventNumber temporaires pour Ã©viter les conflits de unique constraint
      // On utilise des prÃ©fixes "TEMP_" pour Ã©viter les doublons pendant la mise Ã  jour
      for (let i = 0; i < orderedIds.length; i++) {
        await Event.findByIdAndUpdate(
          orderedIds[i],
          { 
            order: i,
            eventNumber: `TEMP_${i}_${Date.now()}`  // Timestamp pour garantir l'unicitÃ©
          }
        );
      }

      // Ã‰TAPE 2 : RenumÃ©roter avec les vrais numÃ©ros (ordre inversÃ©)
      // Le premier visuel (en haut) = dernier numÃ©ro, le dernier visuel (en bas) = #001
      // Car on affiche les Ã©vÃ©nements rÃ©cents en premier
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
      logger.error({ err: error }, "Error updating event order");
      res.status(500).json({ message: "Error updating event order" });
    }
  }
);

// Mise Ã  jour avec validation d'URL
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
            details: "La taille maximale autoris?e est de 3MB",
          });
        }
        if (err.message.includes("Type de fichier non autorise")) {
          return res.status(400).json({
            message: "Type de fichier non autorise",
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

      // Si une nouvelle image est uploadee
      if (req.file) {
        // Supprimer l'ancienne image si elle existe
        if (event.imagePublicId) {
          await deleteImage(event.imagePublicId);
        }
        event.imageSrc = req.file.path;
        event.imagePublicId = (req.file as any).filename;
      }

      const isFree =
        req.body.isFree === "true" ||
        req.body.isFree === true ||
        req.body.isFree === "on";

      const priceValue = isFree
        ? 0
        : req.body.price !== undefined
        ? Number.parseFloat(req.body.price)
        : event.price ?? 0;

      const updatedFields = {
        ...req.body,
        isFree,
        price: Number.isFinite(priceValue) ? priceValue : 0,
      };

      // Mettre a jour les autres champs
      Object.assign(event, updatedFields);

      await event.save();
      res.json(event);
    } catch (error) {
      logger.error("Error updating event");
      res.status(400).json({
        message: "Error updating event",
        error: "Erreur de mise a jour",
      });
    }
  }
);

// Suppression avec validation d'URL et logs nettoyÃ©s
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
      
      // RenumÃ©roter tous les Ã©vÃ©nements visibles aprÃ¨s suppression
      await renumberVisibleEvents();
      
      res.json({ message: "Event deleted successfully" });
    } catch (error) {
      logger.error("Error deleting event");
      res.status(500).json({
        message: "Error deleting event",
      });
    }
  }
);

// Masquer un Ã©vÃ©nement
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
      
      // RenumÃ©roter tous les Ã©vÃ©nements visibles
      await renumberVisibleEvents();
      
      res.json(event);
    } catch (error) {
      logger.error("Error hiding event");
      res.status(500).json({ message: "Error hiding event" });
    }
  }
);

// DÃ©masquer un Ã©vÃ©nement
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
      
      // RenumÃ©roter tous les Ã©vÃ©nements visibles
      await renumberVisibleEvents();
      
      res.json(event);
    } catch (error) {
      logger.error("Error unhiding event");
      res.status(500).json({ message: "Error unhiding event" });
    }
  }
);

// Masquer plusieurs Ã©vÃ©nements
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

      // RenumÃ©roter tous les Ã©vÃ©nements visibles
      await renumberVisibleEvents();

      res.json({ message: `${eventIds.length} event(s) hidden successfully` });
    } catch (error) {
      logger.error("Error hiding events");
      res.status(500).json({ message: "Error hiding events" });
    }
  }
);

// DÃ©masquer plusieurs Ã©vÃ©nements
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

      // RenumÃ©roter tous les Ã©vÃ©nements visibles
      await renumberVisibleEvents();

      res.json({ message: `${eventIds.length} event(s) unhidden successfully` });
    } catch (error) {
      logger.error("Error unhiding events");
      res.status(500).json({ message: "Error unhiding events" });
    }
  }
);

// Route utilitaire pour forcer la renumÃ©rotation (pour corriger manuellement si besoin)
router.post(
  "/renumber-all",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      await renumberVisibleEvents();
      res.json({ message: "All visible events renumbered successfully" });
    } catch (error) {
      logger.error("Error renumbering events");
      res.status(500).json({ message: "Error renumbering events" });
    }
  }
);

// Marquer un Ã©vÃ©nement comme phare
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
      logger.error("Error featuring event");
      res.status(500).json({ message: "Error featuring event" });
    }
  }
);

// Retirer le statut phare d'un Ã©vÃ©nement
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
      logger.error("Error unfeaturing event");
      res.status(500).json({ message: "Error unfeaturing event" });
    }
  }
);

// Marquer plusieurs Ã©vÃ©nements comme phares
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
      logger.error("Error featuring events");
      res.status(500).json({ message: "Error featuring events" });
    }
  }
);

// Retirer le statut phare de plusieurs Ã©vÃ©nements
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
      logger.error("Error unfeaturing events");
      res.status(500).json({ message: "Error unfeaturing events" });
    }
  }
);

export default router;




