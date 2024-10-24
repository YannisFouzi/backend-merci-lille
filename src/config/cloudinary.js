"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCloudinaryConnection = exports.deleteImage = exports.upload = void 0;
const cloudinary_1 = require("cloudinary");
const dotenv_1 = __importDefault(require("dotenv"));
const multer_1 = __importDefault(require("multer"));
const multer_storage_cloudinary_1 = require("multer-storage-cloudinary");
dotenv_1.default.config();
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
console.log("Initializing Cloudinary with cloud_name:", process.env.CLOUDINARY_CLOUD_NAME);
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Configuration du storage pour Multer avec logs détaillés
const storage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: (req, file) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("Processing file upload:", {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
        });
        const timestamp = Date.now();
        const uniqueFileName = `event_${timestamp}`;
        console.log("Generated filename:", uniqueFileName);
        const params = {
            resource_type: "auto",
            folder: "mercilille-events",
            allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
            transformation: [
                {
                    width: 1000,
                    height: 1000,
                    crop: "limit",
                    quality: "auto",
                },
            ],
            public_id: uniqueFileName,
        };
        console.log("Cloudinary upload params:", params);
        return params;
    }),
});
// Middleware de upload avec gestion d'erreur améliorée
const uploadMiddleware = (0, multer_1.default)({
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
exports.upload = {
    single: (fieldName) => {
        return (req, res, next) => {
            uploadMiddleware(req, res, (err) => {
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
const deleteImage = (publicId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Attempting to delete image:", publicId);
        const result = yield cloudinary_1.v2.uploader.destroy(publicId);
        console.log("Image deletion result:", result);
        return result;
    }
    catch (error) {
        console.error("Error deleting image from Cloudinary:", {
            error,
            publicId,
        });
        throw error;
    }
});
exports.deleteImage = deleteImage;
// Fonction de test de connexion
const testCloudinaryConnection = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield cloudinary_1.v2.api.ping();
        console.log("Cloudinary connection test successful:", result);
        return true;
    }
    catch (error) {
        console.error("Cloudinary connection test failed:", error);
        return false;
    }
});
exports.testCloudinaryConnection = testCloudinaryConnection;
// Test de connexion au démarrage
(0, exports.testCloudinaryConnection)();
exports.default = { upload: exports.upload, deleteImage: exports.deleteImage };
