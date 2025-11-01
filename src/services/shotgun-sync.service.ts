import axios from "axios";
import { Event } from "../models/Event";
import { shotgunService, ShotgunEvent } from "./shotgun.service";

interface SyncResult {
  created: number;
  updated: number;
  errors: string[];
  syncedEvents: any[];
}

class ShotgunSyncService {
  /**
   * Télécharge une image depuis une URL et retourne un buffer
   */
  private async downloadImage(imageUrl: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`❌ Failed to download image from ${imageUrl}:`, error);
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
            folder: "merci-lille-events",
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
      console.error("❌ Failed to upload to Cloudinary:", error);
      return null;
    }
  }

  /**
   * Convertit un événement Shotgun vers le format de notre modèle Event
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

    // Télécharger et uploader l'image
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

    // Déterminer si c'est gratuit ou payant
    const minPrice = shotgunEvent.deals && shotgunEvent.deals.length > 0
      ? Math.min(...shotgunEvent.deals.map(d => d.price))
      : 0;
    
    const isFree = minPrice === 0;
    const price = isFree ? "0" : minPrice.toString();

    // Déterminer si l'événement est passé
    const isPast = startDate < new Date();

    // Extraire les genres
    const genres = shotgunEvent.genres
      ? shotgunEvent.genres.map(g => g.name)
      : [];

    return {
      title: shotgunEvent.name,
      city: shotgunEvent.geolocation?.venue || shotgunEvent.geolocation?.city || "Lille", // Utiliser le nom du venue en priorité
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
      // Stocker l'ID Shotgun pour éviter les doublons
      shotgunId: shotgunEvent.id,
    };
  }

  /**
   * Synchronise tous les événements depuis Shotgun
   */
  async syncAllEvents(): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      errors: [],
      syncedEvents: [],
    };

    try {
      console.log("🔄 Starting Shotgun events synchronization...");

      // Récupérer les événements depuis Shotgun
      const shotgunEvents = await shotgunService.fetchOrganizerEvents();

      if (shotgunEvents.length === 0) {
        console.log("ℹ️  No events found on Shotgun");
        return result;
      }

      console.log(`📥 Processing ${shotgunEvents.length} events...`);

      // Traiter chaque événement
      for (const shotgunEvent of shotgunEvents) {
        try {
          // Vérifier si l'événement existe déjà (par ID Shotgun)
          const existingEvent = await Event.findOne({
            shotgunId: shotgunEvent.id,
          });

          const mappedData = await this.mapShotgunEventToEvent(shotgunEvent);

          if (!mappedData.imageSrc) {
            console.warn(
              `⚠️  Skipping event "${shotgunEvent.name}" - no image available`
            );
            result.errors.push(
              `Event "${shotgunEvent.name}": Image upload failed`
            );
            continue;
          }

          if (existingEvent) {
            // Mettre à jour l'événement existant
            Object.assign(existingEvent, mappedData);
            await existingEvent.save();
            result.updated++;
            result.syncedEvents.push(existingEvent);
            console.log(`✏️  Updated: ${shotgunEvent.name}`);
          } else {
            // Créer un nouvel événement
            const newEvent = new Event(mappedData);
            await newEvent.save();
            result.created++;
            result.syncedEvents.push(newEvent);
            console.log(`✅ Created: ${shotgunEvent.name}`);
          }
        } catch (error) {
          const errorMessage = `Failed to sync event "${shotgunEvent.name}": ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          console.error(`❌ ${errorMessage}`);
          result.errors.push(errorMessage);
        }
      }

      console.log(
        `✅ Sync completed: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`
      );
    } catch (error) {
      const errorMessage = `Sync failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      console.error(`❌ ${errorMessage}`);
      result.errors.push(errorMessage);
    }

    return result;
  }

  /**
   * Synchronise un événement spécifique par son ID Shotgun
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

