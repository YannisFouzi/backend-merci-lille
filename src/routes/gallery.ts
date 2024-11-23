import express from "express";
import { deleteImage, galleryUpload } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { GalleryPhoto } from "../models/GalleryPhoto";

const router = express.Router();

// Récupérer toutes les photos
router.get("/", async (req, res) => {
  console.log("GET /gallery - début");
  try {
    const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
    console.log("Photos trouvées:", photos);
    res.json(photos);
  } catch (error) {
    console.error("Erreur GET /gallery:", error);
    res.status(500).json({ message: "Error fetching photos" });
  }
});

// Ajouter une photo
router.post(
  "/",
  authMiddleware,
  galleryUpload.single("image"),
  async (req, res) => {
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
  }
);

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
