import express, { NextFunction, Request, Response } from "express";
import { deleteImage, uploadGallery } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import {
  validateImageIds,
  validateImageOrder,
  validateUrlId,
} from "../middleware/validation";
import { Gallery } from "../models/Gallery";
import { logger } from "../utils/logger";

const router = express.Router();

// Routes publiques
router.get("/", async (req, res) => {
  try {
    const images = await Gallery.find().sort({ order: 1, createdAt: -1 });
    res.json(images);
  } catch (error) {
    logger.error("Error fetching gallery images");
    res.status(500).json({ message: "Error fetching gallery images" });
  }
});

// Routes protÃ©gÃ©es
router.post(
  "/",
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    uploadGallery(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Fichier trop volumineux",
            details: "La taille maximale autorisÃ©e est de 5MB par image",
          });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            message: "Trop de fichiers",
            details: "Maximum 10 images autorisÃ©es par upload",
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
  async (req, res) => {
    try {
      // Log sÃ©curisÃ© pour debug sans exposer le contenu des fichiers
      logger.info(`Upload request: ${req.files?.length || 0} files received`);

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({
          message: "Images requises",
          details: "Aucun fichier n'a Ã©tÃ© uploadÃ©",
        });
      }

      const uploadedFiles = req.files;
      const savedImages = [];

      // DÃ©caler tous les ordres existants pour faire de la place au dÃ©but
      const existingImagesCount = await Gallery.countDocuments();
      if (existingImagesCount > 0) {
        await Gallery.updateMany({}, { $inc: { order: uploadedFiles.length } });
      }

      // Ajouter les nouvelles images au dÃ©but (ordre 0, 1, 2...)
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const newImage = new Gallery({
          imageSrc: file.path,
          imagePublicId: file.filename || `gallery_${Date.now()}_${i}`,
          order: i,
        });
        await newImage.save();
        savedImages.push(newImage);
      }

      res.status(201).json(savedImages);
    } catch (error) {
      logger.error("Error uploading gallery images");
      res.status(400).json({
        message: "Error uploading images",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Route pour suppression multiple avec validation
router.post(
  "/delete-multiple",
  authMiddleware,
  validateImageIds,
  async (req: Request, res: Response) => {
    try {
      const { imageIds } = req.body;
      if (!imageIds || !Array.isArray(imageIds)) {
        return res.status(400).json({ message: "Invalid image IDs provided" });
      }

      const results = [];
      for (const id of imageIds) {
        const image = await Gallery.findById(id);
        if (image) {
          await deleteImage(image.imagePublicId);
          await Gallery.findByIdAndDelete(id);
          results.push({ id, status: "deleted" });
        } else {
          results.push({ id, status: "not_found" });
        }
      }

      res.json({ message: "Images deleted successfully", results });
    } catch (error) {
      logger.error("Error deleting gallery images");
      res.status(500).json({ message: "Error deleting images" });
    }
  }
);

// Route pour mise Ã  jour de l'ordre avec validation
router.put(
  "/update-order",
  authMiddleware,
  validateImageOrder,
  async (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body;

      if (!orderedIds || !Array.isArray(orderedIds)) {
        return res
          .status(400)
          .json({ message: "Invalid ordered IDs provided" });
      }

      // Mettre Ã  jour l'ordre de chaque image
      const updatePromises = orderedIds.map((id, index) =>
        Gallery.findByIdAndUpdate(id, { order: index }, { new: true })
      );

      await Promise.all(updatePromises);

      res.json({ message: "Image order updated successfully" });
    } catch (error) {
      logger.error("Error updating image order");
      res.status(500).json({ message: "Error updating image order" });
    }
  }
);

// Route pour suppression unique avec validation d'URL
router.delete(
  "/:id",
  validateUrlId,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const image = await Gallery.findById(req.params.id);
      if (!image) {
        return res.status(404).json({ message: "Image not found" });
      }

      await deleteImage(image.imagePublicId);
      await Gallery.findByIdAndDelete(req.params.id);

      res.json({ message: "Image deleted successfully" });
    } catch (error) {
      logger.error("Error deleting gallery image");
      res.status(500).json({ message: "Error deleting image" });
    }
  }
);

export default router;

