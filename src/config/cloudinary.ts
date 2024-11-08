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

// Configuration de Cloudinary avec logs
console.log(
  "Initializing Cloudinary with cloud_name:",
  process.env.CLOUDINARY_CLOUD_NAME
);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuration du storage pour Multer avec logs détaillés
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    console.log("Processing file:", file);
    const uniqueFileName = `event_${Date.now()}`;

    const params = {
      folder: "mercilille-events",
      public_id: uniqueFileName,
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      transformation: [
        {
          width: 1000,
          height: 1000,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
          dpr: "auto",
          loading: "lazy",
        },
      ],
      format: "auto",
    };
    return params;
  },
});

// Middleware de upload avec gestion d'erreur améliorée
const uploadMiddleware = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // limite à 5MB
  },
  fileFilter: (req, file, cb) => {
    console.log("Checking file:", file.originalname, file.mimetype);

    // Vérifier le type MIME
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedMimes.includes(file.mimetype)) {
      console.log("Rejected file type:", file.mimetype);
      return cb(new Error("Invalid file type"));
    }

    console.log("File accepted");
    cb(null, true);
  },
}).single("image");

// Wrapper pour meilleure gestion des erreurs
export const upload = {
  single: (fieldName: string) => {
    return (req: any, res: any, next: any) => {
      uploadMiddleware(req, res, (err: any) => {
        if (err) {
          console.error("Upload error:", {
            message: err.message,
            code: err.code,
            stack: err.stack,
          });

          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              message: "File too large",
              maxSize: "5MB",
            });
          }

          return res.status(400).json({
            message: "File upload error",
            error: err.message,
          });
        }
        next();
      });
    };
  },
};

// Fonction pour supprimer une image avec plus de logs
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

// Fonction de test de connexion
export const testCloudinaryConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log("Cloudinary connection test successful:", result);
    return true;
  } catch (error) {
    console.error("Cloudinary connection test failed:", error);
    return false;
  }
};

// Test de connexion au démarrage
testCloudinaryConnection();

export default { upload, deleteImage };
