import mongoose from "mongoose";

const galleryPhotoSchema = new mongoose.Schema({
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

export const GalleryPhoto = mongoose.model("GalleryPhoto", galleryPhotoSchema);
