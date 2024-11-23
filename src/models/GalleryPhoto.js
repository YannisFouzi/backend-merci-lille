"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.GalleryPhoto = void 0;

const mongoose_1 = __importDefault(require("mongoose"));

const galleryPhotoSchema = new mongoose_1.default.Schema({
  imageSrc: {
    type: String,
    required: true,
  },
  imagePublicId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: false,
  },
  description: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

exports.GalleryPhoto = mongoose_1.default.model(
  "GalleryPhoto",
  galleryPhotoSchema
);
