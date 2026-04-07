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

  private async fetchFutureOrganizerEvents(
    organizerId: string,
    apiKey: string
  ): Promise<ShotgunEvent[]> {
    const response = await axios.get<{ data: ShotgunEvent[] }>(
      `${this.baseUrl}/organizers/${organizerId}/events`,
      {
        params: {
          key: apiKey,
        },
        timeout: 10000,
      }
    );

    const events = response.data?.data ?? [];
    logger.debug({ count: events.length }, "Fetched Shotgun future events");
    return events;
  }

  private async fetchPastOrganizerEvents(
    organizerId: string,
    apiKey: string
  ): Promise<ShotgunEvent[]> {
    const allPastEvents: ShotgunEvent[] = [];
    let page = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get<{ data: ShotgunEvent[] }>(
        `${this.baseUrl}/organizers/${organizerId}/events`,
        {
          params: {
            key: apiKey,
            past_events: true,
            page,
            limit,
          },
          timeout: 10000,
        }
      );

      const events = response.data?.data ?? [];
      allPastEvents.push(...events);

      logger.debug({ page: page + 1, count: events.length }, "Fetched Shotgun past events page");

      hasMore = events.length === limit;
      page += 1;
    }

    return allPastEvents;
  }

  /**
   * Recupere les evenements futurs, ou futurs + passes si demande.
   */
  async fetchOrganizerEvents(
    options: {
      includePastEvents?: boolean;
    } = {}
  ): Promise<ShotgunEvent[]> {
    const organizerId = this.organizerId;
    const apiKey = this.apiKey;
    const includePastEvents = options.includePastEvents ?? true;

    if (!organizerId || !apiKey) {
      throw new Error("Shotgun credentials are not configured");
    }

    logger.debug({ organizerId, includePastEvents }, "Fetching Shotgun events");

    const futureEvents = await this.fetchFutureOrganizerEvents(organizerId, apiKey);

    if (!includePastEvents) {
      logger.info(
        { total: futureEvents.length, future: futureEvents.length, past: 0 },
        "Fetched Shotgun events"
      );
      return futureEvents;
    }

    const pastEvents = await this.fetchPastOrganizerEvents(organizerId, apiKey);
    const eventsById = new Map<number, ShotgunEvent>();

    for (const event of [...futureEvents, ...pastEvents]) {
      eventsById.set(event.id, event);
    }

    const allEvents = Array.from(eventsById.values());

    logger.info(
      { total: allEvents.length, future: futureEvents.length, past: pastEvents.length },
      "Fetched Shotgun events"
    );

    return allEvents;
  }

  /**
   * Recupere un evenement specifique par son ID Shotgun.
   */
  async fetchEventById(eventId: number): Promise<ShotgunEvent> {
    const events = await this.fetchOrganizerEvents({ includePastEvents: true });
    const event = events.find((candidate) => candidate.id === eventId);

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    return event;
  }

  /**
   * Verifie l'accessibilite de l'API et la validite du token.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchOrganizerEvents({ includePastEvents: true });
      return true;
    } catch (error) {
      logger.error({ err: error }, "Shotgun connection test failed");
      return false;
    }
  }
}

export const shotgunService = new ShotgunService();
