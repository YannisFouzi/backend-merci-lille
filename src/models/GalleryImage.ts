import mongoose from "mongoose";

const galleryImageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
  },
  description: {
    type: String,
    required: false,
    trim: true,
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

export const GalleryImage = mongoose.model("GalleryImage", galleryImageSchema);
