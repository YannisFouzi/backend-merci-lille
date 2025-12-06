import axios from "axios";
import { logger } from "../utils/logger";

export interface ShotgunEvent {
  id: number;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  slug: string;
  timezone: string;
  coverUrl?: string;
  coverThumbnailUrl?: string;
  url: string;
  geolocation?: {
    street?: string;
    venue?: string;
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  genres?: Array<{ name: string }>;
  deals?: Array<{
    name: string;
    price: number;
  }>;
  leftTicketsCount?: number;
  publishedAt?: string;
  cancelledAt?: string;
}

class ShotgunService {
  private readonly baseUrl = "https://smartboard-api.shotgun.live/api/shotgun";
  private _organizerId: string | null = null;
  private _apiKey: string | null = null;

  private get organizerId(): string {
    if (this._organizerId === null) {
      this._organizerId = process.env.SHOTGUN_ORGANIZER_ID || "";
      if (!this._organizerId) {
        logger.warn("SHOTGUN_ORGANIZER_ID not configured");
      }
    }
    return this._organizerId;
  }

  private get apiKey(): string {
    if (this._apiKey === null) {
      this._apiKey = process.env.SHOTGUN_API_TOKEN || "";
      if (!this._apiKey) {
        logger.warn("SHOTGUN_API_TOKEN not configured");
      }
    }
    return this._apiKey;
  }

  /**
   * Récupère tous les événements de l'organisateur (pagination gérée).
   */
  async fetchOrganizerEvents(): Promise<ShotgunEvent[]> {
    const organizerId = this.organizerId;
    const apiKey = this.apiKey;

    if (!organizerId || !apiKey) {
      throw new Error("Shotgun credentials are not configured");
    }

    const allEvents: ShotgunEvent[] = [];
    let page = 0;
    const limit = 100;
    let hasMore = true;

    logger.debug({ organizerId }, "Fetching Shotgun events");

    while (hasMore) {
      const response = await axios.get<{ data: ShotgunEvent[] }>(
        `${this.baseUrl}/organizers/${organizerId}/events`,
        {
          params: {
            key: apiKey,
            past_events: false,
            page,
            limit,
          },
          timeout: 10000,
        }
      );

      const events = response.data?.data ?? [];
      allEvents.push(...events);

      logger.debug({ page: page + 1, count: events.length }, "Fetched Shotgun page");

      hasMore = events.length === limit;
      page += 1;
    }

    logger.info({ total: allEvents.length }, "Fetched Shotgun events");
    return allEvents;
  }

  /**
   * Récupère un événement spécifique par son ID Shotgun.
   */
  async fetchEventById(eventId: number): Promise<ShotgunEvent> {
    const events = await this.fetchOrganizerEvents();
    const event = events.find((e) => e.id === eventId);

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    return event;
  }

  /**
   * Vérifie l'accessibilité de l'API et la validité du token.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchOrganizerEvents();
      return true;
    } catch (error) {
      logger.error({ err: error }, "Shotgun connection test failed");
      return false;
    }
  }
}

export const shotgunService = new ShotgunService();
