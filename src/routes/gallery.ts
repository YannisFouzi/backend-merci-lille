import express from "express";
import { deleteImage, uploadGallery } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { Gallery } from "../models/Gallery";

const router = express.Router();

// Routes publiques
router.get("/", async (req, res) => {
  try {
    const images = await Gallery.find().sort({ createdAt: -1 });
    res.json(images);
  } catch (error) {
    console.error("Error fetching gallery images:", error);
    res.status(500).json({ message: "Error fetching gallery images" });
  }
});

// Routes protégées
router.post("/", authMiddleware, uploadGallery, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "Images are required",
        details: "No files were uploaded",
      });
    }

    const uploadedFiles = req.files as Express.Multer.File[];
    const savedImages = [];

    for (const file of uploadedFiles) {
      const newImage = new Gallery({
        imageSrc: file.path,
        imagePublicId: file.filename || `gallery_${Date.now()}`,
      });
      await newImage.save();
      savedImages.push(newImage);
    }

    res.status(201).json(savedImages);
  } catch (error) {
    console.error("Error uploading gallery images:", error);
    res.status(400).json({
      message: "Error uploading images",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Route pour suppression multiple - DOIT ÊTRE AVANT LA ROUTE AVEC ID
router.delete("/batch", authMiddleware, async (req, res) => {
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
    console.error("Error deleting gallery images:", error);
    res.status(500).json({ message: "Error deleting images" });
  }
});

// Route pour suppression unique - DOIT ÊTRE APRÈS /batch
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const image = await Gallery.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    await deleteImage(image.imagePublicId);
    await Gallery.findByIdAndDelete(req.params.id);

    res.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting gallery image:", error);
    res.status(500).json({ message: "Error deleting image" });
  }
});

export default router;
