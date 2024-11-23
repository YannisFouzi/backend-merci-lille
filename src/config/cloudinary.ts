import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";

dotenv.config();

// Vérification de la configuration
const requiredEnvVars = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing environment variable: ${varName}`);
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuration du storage pour les événements
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const uniqueFileName = `event_${Date.now()}`;
    return {
      folder: "mercilille-events",
      public_id: uniqueFileName,
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      resource_type: "raw",
      transformation: [
        {
          width: 1000,
          height: 1000,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    };
  },
});

// Configuration du storage pour la galerie
const galleryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const uniqueFileName = `gallery_${Date.now()}`;
    return {
      folder: "mercilille-gallery",
      public_id: uniqueFileName,
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      resource_type: "auto",
      transformation: [
        {
          width: 1000,
          height: 1000,
          crop: "limit",
          quality: "auto:eco",
          fetch_format: "auto",
          flags: "progressive",
        },
      ],
      eager: [
        {
          width: 400,
          height: 400,
          crop: "fill",
          quality: "auto:eco",
        },
      ],
      eager_async: true,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    };
  },
});

// Configuration Multer pour les événements
const eventLimits = {
  fileSize: 5 * 1024 * 1024, // 5MB
};

// Configuration Multer pour la galerie
const galleryLimits = {
  fileSize: 10 * 1024 * 1024, // 10MB
};

// Export des middlewares configurés séparément
export const upload = multer({
  storage: storage,
  limits: eventLimits,
}).single("image");

export const uploadGallery = multer({
  storage: galleryStorage,
  limits: galleryLimits,
}).array("images", 10);

// Fonction pour supprimer une image
export const deleteImage = async (publicId: string) => {
  try {
    console.log("Attempting to delete image:", publicId);
    const result = await cloudinary.uploader.destroy(publicId);
    console.log("Image deletion result:", result);
    return result;
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", {
      error,
      publicId,
    });
    throw error;
  }
};

export default { upload, uploadGallery, deleteImage };
