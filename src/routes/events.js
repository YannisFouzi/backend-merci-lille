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
const express_1 = __importDefault(require("express"));
const cloudinary_1 = require("../config/cloudinary");
const auth_1 = require("../middleware/auth");
const Event_1 = require("../models/Event");
const router = express_1.default.Router();
// Helper function to ensure error has message
const isErrorWithMessage = (error) => {
    return (typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string");
};
const getErrorMessage = (error) => {
    if (isErrorWithMessage(error))
        return error.message;
    return "An unknown error occurred";
};
// Routes publiques
router.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const events = yield Event_1.Event.find().sort({ date: -1 });
        res.json(events);
    }
    catch (error) {
        console.error("Error fetching events:", error);
        res.status(500).json({ message: getErrorMessage(error) });
    }
}));
// Routes protégées avec upload d'image
router.post("/", auth_1.authMiddleware, cloudinary_1.upload.single("image"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("=== Début création événement ===");
        console.log("Body reçu:", JSON.stringify(req.body, null, 2));
        console.log("File reçu:", req.file);
        console.log("Headers:", JSON.stringify(req.headers, null, 2));
        console.log("Body:", JSON.stringify(req.body, null, 2));
        console.log("File:", req.file ? JSON.stringify(req.file, null, 2) : "No file");
        if (!req.file) {
            console.log("Erreur: Image manquante");
            return res.status(400).json({ message: "Image is required" });
        }
        const eventData = Object.assign(Object.assign({}, req.body), { imageSrc: req.file.path, imagePublicId: req.file.filename });
        console.log("EventData:", JSON.stringify(eventData, null, 2));
        try {
            const newEvent = new Event_1.Event(eventData);
            console.log("Nouvel événement créé:", JSON.stringify(newEvent, null, 2));
            const savedEvent = yield newEvent.save();
            console.log("Événement sauvegardé:", JSON.stringify(savedEvent, null, 2));
            res.status(201).json(savedEvent);
        }
        catch (mongoError) {
            console.error("Erreur MongoDB:", mongoError);
            console.error("Stack:", mongoError instanceof Error ? mongoError.stack : "No stack");
            throw mongoError;
        }
    }
    catch (error) {
        console.error("Erreur finale:", error);
        res.status(500).json({
            message: "Error creating event",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
}));
// Mise à jour avec nouvelle image optionnelle
router.put("/:id", auth_1.authMiddleware, cloudinary_1.upload.single("image"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Update - Body reçu:", req.body);
        console.log("Update - Fichier reçu:", req.file);
        const event = yield Event_1.Event.findById(req.params.id);
        if (!event) {
            console.log("Event not found:", req.params.id);
            return res.status(404).json({ message: "Event not found" });
        }
        const updateData = Object.assign({}, req.body);
        if (req.file) {
            console.log("Nouvelle image à uploader");
            if (event.imagePublicId) {
                console.log("Suppression ancienne image:", event.imagePublicId);
                yield (0, cloudinary_1.deleteImage)(event.imagePublicId);
            }
            updateData.imageSrc = req.file.path;
            updateData.imagePublicId = req.file.filename;
        }
        console.log("Données de mise à jour:", updateData);
        const updatedEvent = yield Event_1.Event.findByIdAndUpdate(req.params.id, Object.assign(Object.assign({}, updateData), { updatedAt: Date.now() }), { new: true });
        console.log("Événement mis à jour:", updatedEvent);
        res.json(updatedEvent);
    }
    catch (error) {
        console.error("Erreur mise à jour:", error);
        res.status(500).json({
            message: "Error updating event",
            error: getErrorMessage(error),
            details: error instanceof Error ? error.toString() : "Unknown error",
        });
    }
}));
// Suppression avec nettoyage de l'image
router.delete("/:id", auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Tentative de suppression de l'événement:", req.params.id);
        const event = yield Event_1.Event.findById(req.params.id);
        if (!event) {
            console.log("Event not found for deletion:", req.params.id);
            return res.status(404).json({ message: "Event not found" });
        }
        if (event.imagePublicId) {
            console.log("Suppression de l'image:", event.imagePublicId);
            yield (0, cloudinary_1.deleteImage)(event.imagePublicId);
        }
        yield Event_1.Event.findByIdAndDelete(req.params.id);
        console.log("Événement supprimé avec succès");
        res.json({ message: "Event deleted successfully" });
    }
    catch (error) {
        console.error("Erreur suppression:", error);
        res.status(500).json({
            message: "Error deleting event",
            error: getErrorMessage(error),
            details: error instanceof Error ? error.toString() : "Unknown error",
        });
    }
}));
exports.default = router;
