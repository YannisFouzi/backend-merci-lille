import express from "express";
import { deleteImage, galleryUpload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { GalleryImage } from "../models/GalleryImage";

const router = express.Router();

// Obtenir toutes les images
router.get("/", async (req, res) => {
  try {
    const images = await GalleryImage.find().sort({ createdAt: -1 });
    res.json(images);
  } catch (error) {
    console.error("Error fetching gallery images:", error);
    res.status(500).json({
      message: "Error fetching gallery images",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Ajouter une nouvelle image
router.post(
  "/",
  authMiddleware,
  galleryUpload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Image is required",
          details: "No file was uploaded",
        });
      }

      const imageData = {
        title: req.body.title,
        description: req.body.description,
        imageSrc: req.file.path,
        imagePublicId: (req.file as any).filename || `gallery_${Date.now()}`,
      };

      const newImage = new GalleryImage(imageData);
      await newImage.save();

      res.status(201).json(newImage);
    } catch (error) {
      console.error("Error adding gallery image:", error);
      res.status(400).json({
        message: "Error adding gallery image",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Supprimer une image
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    // Supprimer l'image de Cloudinary
    if (image.imagePublicId) {
      await deleteImage(image.imagePublicId);
    }

    await GalleryImage.findByIdAndDelete(req.params.id);
    res.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting gallery image:", error);
    res.status(500).json({
      message: "Error deleting gallery image",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
