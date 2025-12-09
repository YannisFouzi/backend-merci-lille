import axios from "axios";
import type { Document } from "mongoose";
import { Event } from "../models/Event";
import { logger } from "../utils/logger";
import { shotgunService, ShotgunEvent } from "./shotgun.service";

type EventPayload = {
  title: string;
  city: string;
  country: string;
  date: Date;
  time: string;
  genres: string[];
  ticketLink: string;
  isPast: boolean;
  imageSrc: string;
  imagePublicId: string;
  shotgunId: number;
};

interface SyncResult {
  created: number;
  updated: number;
  errors: string[];
  syncedEvents: Array<Document & EventPayload>;
}

class ShotgunSyncService {
  /**
   * Telecharge une image depuis une URL et retourne un buffer
   */
  private async downloadImage(imageUrl: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data);
    } catch (error) {
      logger.error({ err: error, imageUrl }, "Failed to download image");
      return null;
    }
  }

  /**
   * Upload une image sur Cloudinary
   */
  private async uploadImageToCloudinary(
    imageBuffer: Buffer
  ): Promise<{ url: string; publicId: string } | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cloudinary = require("cloudinary").v2;

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "mercilille-events",
            resource_type: "image",
          },
          (error: unknown, result?: { secure_url: string; public_id: string }) => {
            if (error || !result) {
              reject(error ?? new Error("Cloudinary upload returned no result"));
            } else {
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
              });
            }
          }
        );

        uploadStream.end(imageBuffer);
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to upload to Cloudinary");
      return null;
    }
  }

  /**
   * Convertit un evenement Shotgun vers le format de notre modele Event
   */
  private async mapShotgunEventToEvent(shotgunEvent: ShotgunEvent): Promise<EventPayload> {
    const startDate = new Date(shotgunEvent.startTime);
    const time = startDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let imageSrc = "";
    let imagePublicId = "";

    const imageUrl = shotgunEvent.coverUrl || shotgunEvent.coverThumbnailUrl;
    if (imageUrl) {
      const imageBuffer = await this.downloadImage(imageUrl);
      if (imageBuffer) {
        const uploadResult = await this.uploadImageToCloudinary(imageBuffer);
        if (uploadResult) {
          imageSrc = uploadResult.url;
          imagePublicId = uploadResult.publicId;
        }
      }
    }

    const isPast = startDate < new Date();
    const genres = shotgunEvent.genres ? shotgunEvent.genres.map((g) => g.name) : [];

    return {
      title: shotgunEvent.name,
      city: shotgunEvent.geolocation?.venue || shotgunEvent.geolocation?.city || "Lille",
      country: "",
      date: startDate,
      time: time,
      genres: genres,
      ticketLink: shotgunEvent.url,
      isPast: isPast,
      imageSrc: imageSrc,
      imagePublicId: imagePublicId,
      shotgunId: shotgunEvent.id,
    };
  }

  /**
   * Synchronise tous les evenements depuis Shotgun
   */
  async syncAllEvents(): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      errors: [],
      syncedEvents: [],
    };

    try {
      logger.info("Starting Shotgun events synchronization...");

      const shotgunEvents = await shotgunService.fetchOrganizerEvents();

      if (shotgunEvents.length === 0) {
        logger.info("No events found on Shotgun");
        return result;
      }

      logger.info(`Processing ${shotgunEvents.length} events...`);

      for (const shotgunEvent of shotgunEvents) {
        try {
          const existingEvent = await Event.findOne({
            shotgunId: shotgunEvent.id,
          });

          const mappedData = await this.mapShotgunEventToEvent(shotgunEvent);

          if (!mappedData.imageSrc) {
            logger.warn(`Skipping event "${shotgunEvent.name}" - no image available`);
            result.errors.push(`Event "${shotgunEvent.name}": Image upload failed`);
            continue;
          }

          if (existingEvent) {
            Object.assign(existingEvent, mappedData);
            await existingEvent.save();
            result.updated++;
            result.syncedEvents.push(existingEvent as Document & EventPayload);
            logger.info(`Updated: ${shotgunEvent.name}`);
          } else {
            const newEvent = new Event(mappedData);
            await newEvent.save();
            result.created++;
            result.syncedEvents.push(newEvent as Document & EventPayload);
            logger.info(`Created: ${shotgunEvent.name}`);
          }
        } catch (error) {
          const errorMessage = `Failed to sync event "${shotgunEvent.name}": ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          logger.error({ errorMessage }, "Shotgun sync error");
          result.errors.push(errorMessage);
        }
      }

      logger.info(
        `Sync completed: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`
      );
    } catch (error) {
      const errorMessage = `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      logger.error({ errorMessage }, "Shotgun sync error");
      result.errors.push(errorMessage);
    }

    return result;
  }

  /**
   * Synchronise un evenement specifique par son ID Shotgun
   */
  async syncEventById(shotgunEventId: number): Promise<Document & EventPayload> {
    try {
      const shotgunEvent = await shotgunService.fetchEventById(shotgunEventId);
      const mappedData = await this.mapShotgunEventToEvent(shotgunEvent);

      const existingEvent = await Event.findOne({
        shotgunId: shotgunEvent.id,
      });

      if (existingEvent) {
        Object.assign(existingEvent, mappedData);
        await existingEvent.save();
        return existingEvent as Document & EventPayload;
      } else {
        const newEvent = new Event(mappedData);
        await newEvent.save();
        return newEvent as Document & EventPayload;
      }
    } catch (error) {
      throw new Error(
        `Failed to sync event ${shotgunEventId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

export const shotgunSyncService = new ShotgunSyncService();
export type { SyncResult, EventPayload };
