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
exports.Event = exports.validateEvent = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const eventSchema = new mongoose_1.default.Schema({
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true,
    },
    eventNumber: {
        type: String,
        required: [true, "Event number is required"],
        trim: true,
    },
    city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
    },
    country: {
        type: String,
        trim: true,
    },
    date: {
        type: Date,
        required: [true, "Date is required"],
    },
    time: {
        type: String,
        required: [true, "Time is required"],
        trim: true,
    },
    isFree: {
        type: Boolean,
        default: false,
    },
    genres: {
        type: [String],
        default: [],
        validate: {
            validator: function (v) {
                return Array.isArray(v);
            },
            message: "Genres must be an array",
        },
    },
    ticketLink: {
        type: String,
        required: [true, "Ticket link is required"],
        trim: true,
    },
    isPast: {
        type: Boolean,
        default: false,
    },
    imageSrc: {
        type: String,
        required: [true, "Image source is required"],
    },
    imagePublicId: {
        type: String,
        required: [true, "Image public ID is required"],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});
// Middleware pour parser les genres si c'est une string JSON
eventSchema.pre("save", function (next) {
    if (this.genres && typeof this.genres === "string") {
        try {
            this.genres = JSON.parse(this.genres);
        }
        catch (e) {
            console.error("Error parsing genres:", e);
        }
    }
    next();
});
// Middleware pour logger les erreurs de validation
eventSchema.post("save", function (error, doc, next) {
    if (error.name === "ValidationError") {
        console.log("Validation Error:", {
            error: error.message,
            details: Object.values(error.errors).map((err) => ({
                field: err.path,
                message: err.message,
                value: err.value,
            })),
        });
    }
    next(error);
});
const Event = mongoose_1.default.model("Event", eventSchema);
exports.Event = Event;
// Fonction helper pour valider un event avant de le sauvegarder
const validateEvent = (eventData) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const event = new Event(eventData);
        yield event.validate();
        return { isValid: true, errors: null };
    }
    catch (error) {
        return {
            isValid: false,
            errors: error instanceof Error ? error.message : "Unknown validation error",
        };
    }
});
exports.validateEvent = validateEvent;
