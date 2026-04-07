import axios from "axios";
import type { Document } from "mongoose";
import { deleteImage } from "../config/cloudinary";
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
  shotgunCoverUrl: string;
};

type EventComparisonPayload = {
  title: string;
  city: string;
  country: string;
  date: string;
  time: string;
  genres: string[];
  ticketLink: string;
  shotgunId: number;
  shotgunCoverUrl: string;
};

type EventDocument = Document &
  Partial<EventPayload> & {
    _id: { toString(): string } | string;
    title: string;
    eventNumber?: string;
    order?: number;
    city: string;
    country?: string;
    date: Date;
    time: string;
    genres: string[];
    ticketLink: string;
    imageSrc: string;
    imagePublicId: string;
    shotgunId: number;
    shotgunCoverUrl?: string;
    isHidden?: boolean;
    isFeatured?: boolean;
    createdAt?: Date;
    save: () => Promise<EventDocument>;
  };

type PreparedEventPayload = {
  payload: EventPayload;
  imageChanged: boolean;
  previousImagePublicId?: string;
};

type PreviewEventCard = {
  _id: string;
  imageSrc: string;
  title: string;
  eventNumber: string;
  order?: number;
  city: string;
  country?: string;
  date: string;
  time: string;
  genres: string[];
  ticketLink: string;
  isPast?: boolean;
  imagePublicId?: string;
  isHidden?: boolean;
  isFeatured?: boolean;
  previewStatus?: "created" | "updated";
};

interface SyncResult {
  total: number;
  created: number;
  updated: number;
  errors: string[];
  syncedEvents: Array<Document & EventPayload>;
  createdEvents: SyncPreviewResult["createdEvents"];
  updatedEvents: SyncPreviewResult["updatedEvents"];
}

interface SyncPreviewResult {
  total: number;
  created: number;
  updated: number;
  previewEvents: PreviewEventCard[];
  createdEvents: Array<{
    shotgunId: number;
    title: string;
    startTime: string;
    isPast: boolean;
  }>;
  updatedEvents: Array<{
    shotgunId: number;
    title: string;
    changes: Array<{
      field: string;
      before: string;
      after: string;
    }>;
  }>;
}

type SyncEventByIdStatus = "created" | "updated" | "unchanged";

interface SyncEventByIdDetailedResult {
  status: SyncEventByIdStatus;
  event: Document & EventPayload;
}

type SyncPlan = {
  shotgunEvents: ShotgunEvent[];
  eventsByShotgunId: Map<number, EventDocument>;
  preview: SyncPreviewResult;
};

class ShotgunSyncService {
  private getDateKey(value: Date | string | number): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  private formatDate(dateKey: string): string {
    return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  private formatLocation(city: string, country: string): string {
    return country ? `${city}, ${country}` : city;
  }

  private formatGenres(genres: string[]): string {
    return genres.length > 0 ? genres.join(", ") : "Aucun genre";
  }

  private formatImageLabel(url: string): string {
    if (!url) {
      return "Aucune image";
    }

    try {
      const parsedUrl = new URL(url);
      const lastSegment = parsedUrl.pathname.split("/").filter(Boolean).pop();
      return lastSegment || url;
    } catch {
      return url;
    }
  }

  private getDocumentId(value: EventDocument["_id"]): string {
    return typeof value === "string" ? value : value.toString();
  }

  private getNumericEventNumber(eventNumber?: string): number | null {
    if (!eventNumber || !/^\d+$/.test(eventNumber)) {
      return null;
    }

    return Number(eventNumber);
  }

  private getPreviewImageSrc(
    shotgunEvent: ShotgunEvent,
    existingEvent?: EventDocument | null
  ): string {
    const shotgunCoverUrl = this.getShotgunCoverUrl(shotgunEvent);

    if (!existingEvent) {
      return shotgunCoverUrl;
    }

    const existingCoverUrl =
      typeof existingEvent.shotgunCoverUrl === "string" ? existingEvent.shotgunCoverUrl : "";

    if (shotgunCoverUrl && existingCoverUrl && existingCoverUrl !== shotgunCoverUrl) {
      return shotgunCoverUrl;
    }

    return existingEvent.imageSrc || shotgunCoverUrl;
  }

  private buildPreviewEventPayload(
    shotgunEvent: ShotgunEvent,
    existingEvent?: EventDocument | null
  ): EventPayload {
    const startDate = new Date(shotgunEvent.startTime);

    return {
      title: shotgunEvent.name,
      city: shotgunEvent.geolocation?.venue || shotgunEvent.geolocation?.city || "Lille",
      country: "",
      date: startDate,
      time: startDate.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      genres: this.normalizeGenres(
        shotgunEvent.genres ? shotgunEvent.genres.map((genre) => genre.name) : []
      ),
      ticketLink: shotgunEvent.url,
      isPast: startDate < new Date(),
      imageSrc: this.getPreviewImageSrc(shotgunEvent, existingEvent),
      imagePublicId: existingEvent?.imagePublicId || "",
      shotgunId: shotgunEvent.id,
      shotgunCoverUrl: this.getShotgunCoverUrl(shotgunEvent),
    };
  }

  private normalizeGenres(genres: string[]): string[] {
    return [...new Set(genres.map((genre) => genre.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
  }

  private getShotgunCoverUrl(shotgunEvent: ShotgunEvent): string {
    return shotgunEvent.coverUrl || shotgunEvent.coverThumbnailUrl || "";
  }

  private buildComparisonPayload(shotgunEvent: ShotgunEvent): EventComparisonPayload {
    const startDate = new Date(shotgunEvent.startTime);

    return {
      title: shotgunEvent.name,
      city: shotgunEvent.geolocation?.venue || shotgunEvent.geolocation?.city || "Lille",
      country: "",
      date: this.getDateKey(startDate),
      time: startDate.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      genres: this.normalizeGenres(
        shotgunEvent.genres ? shotgunEvent.genres.map((genre) => genre.name) : []
      ),
      ticketLink: shotgunEvent.url,
      shotgunId: shotgunEvent.id,
      shotgunCoverUrl: this.getShotgunCoverUrl(shotgunEvent),
    };
  }

  private buildStoredComparisonPayload(event: EventDocument): EventComparisonPayload {
    return {
      title: event.title,
      city: event.city,
      country: event.country || "",
      date: this.getDateKey(event.date),
      time: event.time,
      genres: this.normalizeGenres(Array.isArray(event.genres) ? event.genres : []),
      ticketLink: event.ticketLink,
      shotgunId: event.shotgunId,
      shotgunCoverUrl: typeof event.shotgunCoverUrl === "string" ? event.shotgunCoverUrl : "",
    };
  }

  private hasTrackedCoverUrl(event: EventDocument): boolean {
    return typeof event.shotgunCoverUrl === "string" && event.shotgunCoverUrl.trim().length > 0;
  }

  private hasEventChanged(event: EventDocument, comparison: EventComparisonPayload): boolean {
    return this.getFieldChanges(event, comparison).length > 0;
  }

  private getFieldChanges(
    event: EventDocument,
    comparison: EventComparisonPayload
  ): Array<{ field: string; before: string; after: string }> {
    const stored = this.buildStoredComparisonPayload(event);
    const changes: Array<{ field: string; before: string; after: string }> = [];

    if (stored.title !== comparison.title) {
      changes.push({
        field: "Titre",
        before: stored.title,
        after: comparison.title,
      });
    }

    if (stored.city !== comparison.city || stored.country !== comparison.country) {
      changes.push({
        field: "Lieu",
        before: this.formatLocation(stored.city, stored.country),
        after: this.formatLocation(comparison.city, comparison.country),
      });
    }

    if (stored.date !== comparison.date) {
      changes.push({
        field: "Date",
        before: this.formatDate(stored.date),
        after: this.formatDate(comparison.date),
      });
    }

    if (stored.time !== comparison.time) {
      changes.push({
        field: "Heure",
        before: stored.time,
        after: comparison.time,
      });
    }

    if (JSON.stringify(stored.genres) !== JSON.stringify(comparison.genres)) {
      changes.push({
        field: "Genres",
        before: this.formatGenres(stored.genres),
        after: this.formatGenres(comparison.genres),
      });
    }

    if (stored.ticketLink !== comparison.ticketLink) {
      changes.push({
        field: "Lien billetterie",
        before: stored.ticketLink,
        after: comparison.ticketLink,
      });
    }

    if (stored.shotgunId !== comparison.shotgunId) {
      changes.push({
        field: "Identifiant Shotgun",
        before: String(stored.shotgunId),
        after: String(comparison.shotgunId),
      });
    }

    if (this.hasTrackedCoverUrl(event) && stored.shotgunCoverUrl !== comparison.shotgunCoverUrl) {
      changes.push({
        field: "Image",
        before: this.formatImageLabel(stored.shotgunCoverUrl),
        after: this.formatImageLabel(comparison.shotgunCoverUrl),
      });
    }

    return changes;
  }

  private async getExistingEventsByShotgunIds(shotgunIds: number[]): Promise<Map<number, EventDocument>> {
    const existingEvents = (await Event.find({ shotgunId: { $in: shotgunIds } })) as EventDocument[];
    const eventsByShotgunId = new Map<number, EventDocument>();

    for (const event of existingEvents) {
      if (typeof event.shotgunId === "number") {
        eventsByShotgunId.set(event.shotgunId, event);
      }
    }

    return eventsByShotgunId;
  }

  private getShotgunEventTimestamp(shotgunEvent: ShotgunEvent): number {
    const timestamp = new Date(shotgunEvent.startTime).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private sortShotgunEventsForProcessing(shotgunEvents: ShotgunEvent[]): ShotgunEvent[] {
    return [...shotgunEvents].sort((a, b) => {
      const timestampDiff = this.getShotgunEventTimestamp(a) - this.getShotgunEventTimestamp(b);
      if (timestampDiff !== 0) {
        return timestampDiff;
      }

      return a.id - b.id;
    });
  }

  private async buildSyncPlan(): Promise<SyncPlan> {
    const shotgunEvents = this.sortShotgunEventsForProcessing(
      await shotgunService.fetchOrganizerEvents({ includePastEvents: true })
    );
    const allEvents = (await Event.find({})) as EventDocument[];

    if (shotgunEvents.length === 0) {
      return {
        shotgunEvents: [],
        eventsByShotgunId: new Map<number, EventDocument>(),
        preview: {
          total: 0,
          created: 0,
          updated: 0,
          previewEvents: allEvents.map((event) => ({
            _id: this.getDocumentId(event._id),
            imageSrc: event.imageSrc,
            title: event.title,
            eventNumber: event.eventNumber || "",
            order: event.order,
            city: event.city,
            country: event.country,
            date: new Date(event.date).toISOString(),
            time: event.time,
            genres: Array.isArray(event.genres) ? event.genres : [],
            ticketLink: event.ticketLink,
            isPast: event.isPast,
            imagePublicId: event.imagePublicId,
            isHidden: event.isHidden,
            isFeatured: event.isFeatured,
          })),
          createdEvents: [],
          updatedEvents: [],
        },
      };
    }

    const eventsByShotgunId = await this.getExistingEventsByShotgunIds(
      shotgunEvents.map((event) => event.id)
    );

    let created = 0;
    let updated = 0;
    const createdEvents: SyncPreviewResult["createdEvents"] = [];
    const updatedEvents: SyncPreviewResult["updatedEvents"] = [];
    const previewEvents: PreviewEventCard[] = allEvents.map((event) => ({
      _id: this.getDocumentId(event._id),
      imageSrc: event.imageSrc,
      title: event.title,
      eventNumber: event.eventNumber || "",
      order: event.order,
      city: event.city,
      country: event.country,
      date: new Date(event.date).toISOString(),
      time: event.time,
      genres: Array.isArray(event.genres) ? event.genres : [],
      ticketLink: event.ticketLink,
      isPast: event.isPast,
      imagePublicId: event.imagePublicId,
      isHidden: event.isHidden,
      isFeatured: event.isFeatured,
    }));
    const previewEventIndexById = new Map(previewEvents.map((event, index) => [event._id, index]));
    let nextVisibleEventNumber = allEvents.reduce((max, event) => {
      if (event.isHidden) {
        return max;
      }

      const numericEventNumber = this.getNumericEventNumber(event.eventNumber);
      return numericEventNumber !== null && numericEventNumber > max ? numericEventNumber : max;
    }, 0);

    for (const shotgunEvent of shotgunEvents) {
      const existingEvent = eventsByShotgunId.get(shotgunEvent.id);
      const previewPayload = this.buildPreviewEventPayload(shotgunEvent, existingEvent);

      if (!existingEvent) {
        created += 1;
        nextVisibleEventNumber += 1;
        createdEvents.push({
          shotgunId: shotgunEvent.id,
          title: shotgunEvent.name,
          startTime: shotgunEvent.startTime,
          isPast: new Date(shotgunEvent.startTime) < new Date(),
        });
        previewEvents.push({
          _id: `preview-shotgun-${shotgunEvent.id}`,
          imageSrc: previewPayload.imageSrc,
          title: previewPayload.title,
          eventNumber: String(nextVisibleEventNumber).padStart(3, "0"),
          order: 0,
          city: previewPayload.city,
          country: previewPayload.country,
          date: previewPayload.date.toISOString(),
          time: previewPayload.time,
          genres: previewPayload.genres,
          ticketLink: previewPayload.ticketLink,
          isPast: previewPayload.isPast,
          imagePublicId: previewPayload.imagePublicId,
          isHidden: false,
          isFeatured: false,
          previewStatus: "created",
        });
        continue;
      }

      const changes = this.getFieldChanges(existingEvent, this.buildComparisonPayload(shotgunEvent));
      if (changes.length > 0) {
        updated += 1;
        updatedEvents.push({
          shotgunId: shotgunEvent.id,
          title: shotgunEvent.name,
          changes,
        });

        const existingPreviewIndex = previewEventIndexById.get(this.getDocumentId(existingEvent._id));
        if (existingPreviewIndex !== undefined) {
          previewEvents[existingPreviewIndex] = {
            ...previewEvents[existingPreviewIndex],
            imageSrc: previewPayload.imageSrc,
            title: previewPayload.title,
            city: previewPayload.city,
            country: previewPayload.country,
            date: previewPayload.date.toISOString(),
            time: previewPayload.time,
            genres: previewPayload.genres,
            ticketLink: previewPayload.ticketLink,
            isPast: previewPayload.isPast,
            imagePublicId: previewPayload.imagePublicId,
            previewStatus: "updated",
          };
        }
      }
    }

    createdEvents.sort((a, b) => {
      const timestampDiff = new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
      if (timestampDiff !== 0) {
        return timestampDiff;
      }

      return a.shotgunId - b.shotgunId;
    });
    updatedEvents.sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));

    return {
      shotgunEvents,
      eventsByShotgunId,
      preview: {
        total: shotgunEvents.length,
        created,
        updated,
        previewEvents,
        createdEvents,
        updatedEvents,
      },
    };
  }

  private async buildSyncPreview(): Promise<SyncPreviewResult> {
    const plan = await this.buildSyncPlan();
    return plan.preview;
  }

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

  private async prepareEventPayload(
    shotgunEvent: ShotgunEvent,
    existingEvent?: EventDocument | null
  ): Promise<PreparedEventPayload> {
    const startDate = new Date(shotgunEvent.startTime);
    const shotgunCoverUrl = this.getShotgunCoverUrl(shotgunEvent);
    const hasExistingImage = Boolean(existingEvent?.imageSrc && existingEvent?.imagePublicId);
    const existingCoverUrl =
      existingEvent && typeof existingEvent.shotgunCoverUrl === "string"
        ? existingEvent.shotgunCoverUrl
        : "";

    let imageSrc = existingEvent?.imageSrc || "";
    let imagePublicId = existingEvent?.imagePublicId || "";
    let imageChanged = false;

    const mustUploadImage =
      !existingEvent ||
      !hasExistingImage ||
      (existingCoverUrl.length > 0 && existingCoverUrl !== shotgunCoverUrl);

    if (mustUploadImage && shotgunCoverUrl) {
      const imageBuffer = await this.downloadImage(shotgunCoverUrl);
      if (imageBuffer) {
        const uploadResult = await this.uploadImageToCloudinary(imageBuffer);
        if (uploadResult) {
          imageSrc = uploadResult.url;
          imagePublicId = uploadResult.publicId;
          imageChanged = Boolean(existingEvent);
        }
      }
    }

    return {
      payload: {
        title: shotgunEvent.name,
        city: shotgunEvent.geolocation?.venue || shotgunEvent.geolocation?.city || "Lille",
        country: "",
        date: startDate,
        time: startDate.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        genres: this.normalizeGenres(
          shotgunEvent.genres ? shotgunEvent.genres.map((genre) => genre.name) : []
        ),
        ticketLink: shotgunEvent.url,
        isPast: startDate < new Date(),
        imageSrc,
        imagePublicId,
        shotgunId: shotgunEvent.id,
        shotgunCoverUrl,
      },
      imageChanged,
      previousImagePublicId: existingEvent?.imagePublicId,
    };
  }

  private async cleanupPreviousImageIfNeeded(
    previousImagePublicId: string | undefined,
    nextImagePublicId: string | undefined,
    imageChanged: boolean
  ) {
    if (
      !imageChanged ||
      !previousImagePublicId ||
      !nextImagePublicId ||
      previousImagePublicId === nextImagePublicId
    ) {
      return;
    }

    try {
      await deleteImage(previousImagePublicId);
    } catch (error) {
      logger.warn(
        { err: error, previousImagePublicId },
        "Unable to delete previous Shotgun image from Cloudinary"
      );
    }
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
  }

  /**
   * Synchronise tous les evenements depuis Shotgun
   */
  async syncAllEvents(): Promise<SyncResult> {
    const result: SyncResult = {
      total: 0,
      created: 0,
      updated: 0,
      errors: [],
      syncedEvents: [],
      createdEvents: [],
      updatedEvents: [],
    };

    try {
      logger.info("Starting Shotgun events synchronization...");

      const plan = await this.buildSyncPlan();
      const { shotgunEvents, eventsByShotgunId, preview } = plan;
      result.total = preview.total;
      result.createdEvents = preview.createdEvents;
      result.updatedEvents = preview.updatedEvents;

      if (shotgunEvents.length === 0) {
        logger.info("No events found on Shotgun");
        return result;
      }

      logger.info(`Processing ${shotgunEvents.length} events...`);

      for (const shotgunEvent of shotgunEvents) {
        try {
          const existingEvent = eventsByShotgunId.get(shotgunEvent.id);
          const comparison = this.buildComparisonPayload(shotgunEvent);

          if (existingEvent && !this.hasEventChanged(existingEvent, comparison)) {
            logger.info(`Skipped (unchanged): ${shotgunEvent.name}`);
            continue;
          }

          const prepared = await this.prepareEventPayload(shotgunEvent, existingEvent);

          if (!prepared.payload.imageSrc) {
            logger.warn(`Skipping event "${shotgunEvent.name}" - no image available`);
            result.errors.push(`Event "${shotgunEvent.name}": Image upload failed`);
            continue;
          }

          if (existingEvent) {
            Object.assign(existingEvent, prepared.payload);
            await existingEvent.save();
            await this.cleanupPreviousImageIfNeeded(
              prepared.previousImagePublicId,
              existingEvent.imagePublicId,
              prepared.imageChanged
            );
            result.updated++;
            result.syncedEvents.push(existingEvent as Document & EventPayload);
            logger.info(`Updated: ${shotgunEvent.name}`);
          } else {
            const newEvent = new Event(prepared.payload) as EventDocument;
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
   * Previsualise la synchronisation sans modifier la base.
   */
  async previewSyncAllEvents(): Promise<SyncPreviewResult> {
    return this.buildSyncPreview();
  }

  /**
   * Synchronise un evenement specifique par son ID Shotgun
   */
  async syncEventByIdDetailed(shotgunEventId: number): Promise<SyncEventByIdDetailedResult> {
    try {
      const shotgunEvent = await shotgunService.fetchEventById(shotgunEventId);
      const existingEvent = (await Event.findOne({
        shotgunId: shotgunEvent.id,
      })) as EventDocument | null;
      const comparison = this.buildComparisonPayload(shotgunEvent);

      if (existingEvent && !this.hasEventChanged(existingEvent, comparison)) {
        return {
          status: "unchanged",
          event: existingEvent as Document & EventPayload,
        };
      }

      const prepared = await this.prepareEventPayload(shotgunEvent, existingEvent);

      if (!prepared.payload.imageSrc) {
        throw new Error(`Image upload failed for event ${shotgunEventId}`);
      }

      if (existingEvent) {
        Object.assign(existingEvent, prepared.payload);
        await existingEvent.save();
        await this.cleanupPreviousImageIfNeeded(
          prepared.previousImagePublicId,
          existingEvent.imagePublicId,
          prepared.imageChanged
        );
        return {
          status: "updated",
          event: existingEvent as Document & EventPayload,
        };
      }

      try {
        const newEvent = new Event(prepared.payload) as EventDocument;
        await newEvent.save();
        return {
          status: "created",
          event: newEvent as Document & EventPayload,
        };
      } catch (error) {
        if (this.isDuplicateKeyError(error)) {
          const concurrentEvent = (await Event.findOne({
            shotgunId: shotgunEvent.id,
          })) as EventDocument | null;

          if (concurrentEvent) {
            logger.warn({ shotgunEventId }, "Concurrent Shotgun sync detected, returning existing event");
            return {
              status: "unchanged",
              event: concurrentEvent as Document & EventPayload,
            };
          }
        }

        throw error;
      }
    } catch (error) {
      throw new Error(
        `Failed to sync event ${shotgunEventId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async syncEventById(shotgunEventId: number): Promise<Document & EventPayload> {
    const result = await this.syncEventByIdDetailed(shotgunEventId);
    return result.event;
  }
}

export const shotgunSyncService = new ShotgunSyncService();
export type { SyncResult, SyncPreviewResult, EventPayload, SyncEventByIdDetailedResult, SyncEventByIdStatus };
