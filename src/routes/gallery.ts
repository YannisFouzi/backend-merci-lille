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
    if (!req.file) {
      return res.status(400).json({
        message: "Image is required",
        details: "No file was uploaded",
      });
    }

    const newImage = new Gallery({
      imageSrc: req.file.path,
      imagePublicId: (req.file as any).filename || `gallery_${Date.now()}`,
    });

    await newImage.save();
    res.status(201).json(newImage);
  } catch (error) {
    console.error("Error uploading gallery image:", error);
    res.status(400).json({
      message: "Error uploading image",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

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
