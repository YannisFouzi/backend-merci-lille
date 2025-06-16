import express from "express";
import { deleteImage, uploadGallery } from "../config/cloudinary";
import { authMiddleware } from "../middleware/auth";
import { Gallery } from "../models/Gallery";

const router = express.Router();

// Routes publiques
router.get("/", async (req, res) => {
  try {
    const images = await Gallery.find().sort({ order: 1, createdAt: -1 });
    res.json(images);
  } catch (error) {
    console.error("Error fetching gallery images:", error);
    res.status(500).json({ message: "Error fetching gallery images" });
  }
});

// Routes protégées
router.post("/", authMiddleware, uploadGallery, async (req, res) => {
  try {
    console.log("Files received:", req.files);

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        message: "Images are required",
        details: "No files were uploaded",
      });
    }

    const uploadedFiles = req.files;
    const savedImages = [];

    // Récupérer le plus grand ordre existant
    const lastImage = await Gallery.findOne().sort({ order: -1 });
    let nextOrder = lastImage ? lastImage.order + 1 : 0;

    for (const file of uploadedFiles) {
      const newImage = new Gallery({
        imageSrc: file.path,
        imagePublicId: file.filename || `gallery_${Date.now()}`,
        order: nextOrder++,
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

// Route pour suppression multiple
router.post("/delete-multiple", authMiddleware, async (req, res) => {
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

// Route pour mise à jour de l'ordre
router.put("/update-order", authMiddleware, async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return res.status(400).json({ message: "Invalid ordered IDs provided" });
    }

    // Mettre à jour l'ordre de chaque image
    const updatePromises = orderedIds.map((id, index) =>
      Gallery.findByIdAndUpdate(id, { order: index }, { new: true })
    );

    await Promise.all(updatePromises);

    res.json({ message: "Image order updated successfully" });
  } catch (error) {
    console.error("Error updating image order:", error);
    res.status(500).json({ message: "Error updating image order" });
  }
});

// Route pour suppression unique
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
