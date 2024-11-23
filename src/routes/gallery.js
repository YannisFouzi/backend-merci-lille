"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });

const express_1 = require("express");
const cloudinary_1 = require("../config/cloudinary");
const auth_1 = require("../middleware/auth");
const GalleryPhoto_1 = require("../models/GalleryPhoto");

const router = express_1.Router();

router.get("/", (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      const photos = yield GalleryPhoto_1.GalleryPhoto.find().sort({
        createdAt: -1,
      });
      res.json(photos);
    } catch (error) {
      res.status(500).json({ message: "Error fetching photos" });
    }
  })
);

router.post(
  "/",
  auth_1.authMiddleware,
  cloudinary_1.upload.single("image"),
  (req, res) =>
    __awaiter(void 0, void 0, void 0, function* () {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Image is required" });
        }
        const photoData = {
          imageSrc: req.file.path,
          imagePublicId: req.file.filename || `gallery_${Date.now()}`,
          title: req.body.title,
          description: req.body.description,
        };
        const newPhoto = new GalleryPhoto_1.GalleryPhoto(photoData);
        yield newPhoto.save();
        res.status(201).json(newPhoto);
      } catch (error) {
        res.status(400).json({
          message: "Error adding photo",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })
);

router.delete("/:id", auth_1.authMiddleware, (req, res) =>
  __awaiter(void 0, void 0, void 0, function* () {
    try {
      const photo = yield GalleryPhoto_1.GalleryPhoto.findById(req.params.id);
      if (!photo) {
        return res.status(404).json({ message: "Photo not found" });
      }
      if (photo.imagePublicId) {
        yield cloudinary_1.deleteImage(photo.imagePublicId);
      }
      yield GalleryPhoto_1.GalleryPhoto.findByIdAndDelete(req.params.id);
      res.json({ message: "Photo deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting photo" });
    }
  })
);

exports.default = router;
