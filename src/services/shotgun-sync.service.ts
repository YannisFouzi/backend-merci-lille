import axios from "axios";
import { Event } from "../models/Event";
import { logger } from "../utils/logger";
import { shotgunService, ShotgunEvent } from "./shotgun.service";

interface SyncResult {
  created: number;
  updated: number;
  errors: string[];
  syncedEvents: any[];
}

class ShotgunSyncService {
  /**
   * TÃ©lÃ©charge une image depuis une URL et retourne un buffer
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
      const cloudinary = require("cloudinary").v2;

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "mercilille-events",
            resource_type: "image",
          },
          (error: any, result: any) => {
            if (error) {
              reject(error);
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
   * Convertit un Ã©vÃ©nement Shotgun vers le format de notre modÃ¨le Event
   */
  private async mapShotgunEventToEvent(
    shotgunEvent: ShotgunEvent
  ): Promise<Partial<any>> {
    // Extraire la date et l'heure
    const startDate = new Date(shotgunEvent.startTime);
    const time = startDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // TÃ©lÃ©charger et uploader l'image
    let imageSrc = "";
    let imagePublicId = "";

    if (shotgunEvent.coverUrl || shotgunEvent.coverThumbnailUrl) {
      const imageUrl = shotgunEvent.coverUrl || shotgunEvent.coverThumbnailUrl;
      const imageBuffer = await this.downloadImage(imageUrl!);
      if (imageBuffer) {
        const uploadResult = await this.uploadImageToCloudinary(imageBuffer);
        if (uploadResult) {
          imageSrc = uploadResult.url;
          imagePublicId = uploadResult.publicId;
        }
      }
    }

    // DÃ©terminer si c'est gratuit ou payant
    const minPrice = shotgunEvent.deals && shotgunEvent.deals.length > 0
      ? Math.min(...shotgunEvent.deals.map(d => d.price))
      : 0;
    
    const isFree = minPrice === 0;
    const price = isFree ? "0" : minPrice.toString();

    // DÃ©terminer si l'Ã©vÃ©nement est passÃ©
    const isPast = startDate < new Date();

    // Extraire les genres
    const genres = shotgunEvent.genres
      ? shotgunEvent.genres.map(g => g.name)
      : [];

    return {
      title: shotgunEvent.name,
      city: shotgunEvent.geolocation?.venue || shotgunEvent.geolocation?.city || "Lille", // Utiliser le nom du venue en prioritÃ©
      country: "", // Laisser vide pour afficher uniquement le venue
      date: startDate,
      time: time,
      isFree: isFree,
      price: price,
      genres: genres,
      ticketLink: shotgunEvent.url,
      isPast: isPast,
      imageSrc: imageSrc,
      imagePublicId: imagePublicId,
      // Stocker l'ID Shotgun pour Ã©viter les doublons
      shotgunId: shotgunEvent.id,
    };
  }

  /**
   * Synchronise tous les Ã©vÃ©nements depuis Shotgun
   */
  async syncAllEvents(): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      errors: [],
      syncedEvents: [],
    };

    try {
      logger.info("ðŸ”„ Starting Shotgun events synchronization...");

      // RÃ©cupÃ©rer les Ã©vÃ©nements depuis Shotgun
      const shotgunEvents = await shotgunService.fetchOrganizerEvents();

      if (shotgunEvents.length === 0) {
        logger.info("â„¹ï¸  No events found on Shotgun");
        return result;
      }

      logger.info(`ðŸ“¥ Processing ${shotgunEvents.length} events...`);

      // Traiter chaque Ã©vÃ©nement
      for (const shotgunEvent of shotgunEvents) {
        try {
          // VÃ©rifier si l'Ã©vÃ©nement existe dÃ©jÃ  (par ID Shotgun)
          const existingEvent = await Event.findOne({
            shotgunId: shotgunEvent.id,
          });

          const mappedData = await this.mapShotgunEventToEvent(shotgunEvent);

          if (!mappedData.imageSrc) {
            logger.warn(
              `âš ï¸  Skipping event "${shotgunEvent.name}" - no image available`
            );
            result.errors.push(
              `Event "${shotgunEvent.name}": Image upload failed`
            );
            continue;
          }

          if (existingEvent) {
            // Mettre Ã  jour l'Ã©vÃ©nement existant
            Object.assign(existingEvent, mappedData);
            await existingEvent.save();
            result.updated++;
            result.syncedEvents.push(existingEvent);
            logger.info(`âœï¸  Updated: ${shotgunEvent.name}`);
          } else {
            // CrÃ©er un nouvel Ã©vÃ©nement
            const newEvent = new Event(mappedData);
            await newEvent.save();
            result.created++;
            result.syncedEvents.push(newEvent);
            logger.info(`âœ… Created: ${shotgunEvent.name}`);
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
        `âœ… Sync completed: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`
      );
    } catch (error) {
      const errorMessage = `Sync failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      logger.error({ errorMessage }, "Shotgun sync error");
      result.errors.push(errorMessage);
    }

    return result;
  }

  /**
   * Synchronise un Ã©vÃ©nement spÃ©cifique par son ID Shotgun
   */
  async syncEventById(shotgunEventId: number): Promise<any> {
    try {
      const shotgunEvent = await shotgunService.fetchEventById(shotgunEventId);
      const mappedData = await this.mapShotgunEventToEvent(shotgunEvent);

      const existingEvent = await Event.findOne({
        shotgunId: shotgunEvent.id,
      });

      if (existingEvent) {
        Object.assign(existingEvent, mappedData);
        await existingEvent.save();
        return existingEvent;
      } else {
        const newEvent = new Event(mappedData);
        await newEvent.save();
        return newEvent;
      }
    } catch (error) {
      throw new Error(
        `Failed to sync event ${shotgunEventId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

export const shotgunSyncService = new ShotgunSyncService();
export type { SyncResult };



