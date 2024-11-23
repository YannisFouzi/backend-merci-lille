import express from "express";
import { deleteImage, upload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { GalleryPhoto } from "../models/GalleryPhoto";

const router = express.Router();

// Récupérer toutes les photos
router.get("/", async (req, res) => {
  try {
    const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
    res.json(photos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching photos" });
  }
});

// Ajouter une photo
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image is required" });
    }

    const photoData = {
      imageSrc: req.file.path,
      imagePublicId: req.file.filename || `gallery_${Date.now()}`,
      title: req.body.title,
      description: req.body.description,
    };

    const newPhoto = new GalleryPhoto(photoData);
    await newPhoto.save();

    res.status(201).json(newPhoto);
  } catch (error) {
    res.status(400).json({
      message: "Error adding photo",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Supprimer une photo
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const photo = await GalleryPhoto.findById(req.params.id);
    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }

    // Supprimer l'image de Cloudinary
    if (photo.imagePublicId) {
      await deleteImage(photo.imagePublicId);
    }

    await GalleryPhoto.findByIdAndDelete(req.params.id);
    res.json({ message: "Photo deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting photo" });
  }
});

export default router;
