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

// Configuration Multer pour les événements avec validation MIME
const eventLimits = {
  fileSize: 3 * 1024 * 1024, // 3MB (réduit de 5MB)
};

// Configuration Multer pour la galerie avec validation MIME
const galleryLimits = {
  fileSize: 5 * 1024 * 1024, // 5MB (réduit de 10MB)
  files: 10, // Max 10 fichiers (réduit de 100)
};

// Validation des types MIME autorisés
const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

// Fonction de filtrage des fichiers
const fileFilter = (req: any, file: any, cb: any) => {
  // Vérifier le type MIME
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Type de fichier non autorisé. Types acceptés: ${allowedMimeTypes.join(
          ", "
        )}`
      ),
      false
    );
  }
};

// Export des middlewares configurés séparément avec validation
export const upload = multer({
  storage: storage,
  limits: eventLimits,
  fileFilter: fileFilter,
}).single("image");

export const uploadGallery = multer({
  storage: galleryStorage,
  limits: galleryLimits,
  fileFilter: fileFilter,
}).array("images", 10); // Max 10 images au lieu de 100

// Fonction pour supprimer une image
export const deleteImage = async (publicId: string) => {
  try {
    console.log("Attempting to delete image from Cloudinary");
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(
      `Image deletion ${result.result === "ok" ? "successful" : "failed"}`
    );
    return result;
  } catch (error) {
    console.error("Error deleting image from Cloudinary - operation failed");
    throw error;
  }
};

export default { upload, uploadGallery, deleteImage };
