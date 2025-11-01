import axios from "axios";

interface ShotgunEvent {
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

interface ShotgunApiResponse {
  events: ShotgunEvent[];
  total: number;
}

class ShotgunService {
  private baseUrl = "https://smartboard-api.shotgun.live/api/shotgun";
  private _organizerId: string | null = null;
  private _apiKey: string | null = null;

  // Lazy loading des variables d'environnement
  private get organizerId(): string {
    if (this._organizerId === null) {
      this._organizerId = process.env.SHOTGUN_ORGANIZER_ID || "";
      if (!this._organizerId) {
        console.warn("⚠️  SHOTGUN_ORGANIZER_ID not configured");
      }
    }
    return this._organizerId;
  }

  private get apiKey(): string {
    if (this._apiKey === null) {
      this._apiKey = process.env.SHOTGUN_API_TOKEN || "";
      if (!this._apiKey) {
        console.warn("⚠️  SHOTGUN_API_TOKEN not configured");
      }
    }
    return this._apiKey;
  }

  /**
   * Récupère tous les événements de l'organisateur depuis l'API Shotgun
   * Gère la pagination pour récupérer TOUS les événements
   */
  async fetchOrganizerEvents(): Promise<ShotgunEvent[]> {
    try {
      console.log(`🔍 Fetching events for organizer ID: ${this.organizerId}`);
      console.log(`📡 API URL: ${this.baseUrl}/organizers/${this.organizerId}/events`);
      console.log(`🔑 API Key (first 20 chars): ${this.apiKey.substring(0, 20)}...`);

      const allEvents: ShotgunEvent[] = [];
      let page = 0;
      const limit = 100; // Récupérer 100 événements par page
      let hasMore = true;

      // Récupérer tous les événements en gérant la pagination
      while (hasMore) {
        console.log(`📄 Fetching page ${page + 1}...`);
        
        const response = await axios.get(
          `${this.baseUrl}/organizers/${this.organizerId}/events`,
          {
            params: {
              key: this.apiKey, // Authentification via paramètre query
              past_events: false, // Ne récupérer que les événements à venir
              page: page,
              limit: limit,
            },
            timeout: 10000, // 10 secondes timeout
          }
        );

        const events = response.data.data || [];
        allEvents.push(...events);
        
        console.log(`✅ Page ${page + 1}: ${events.length} events`);

        // Si on a récupéré moins que la limite, c'est qu'on est à la dernière page
        if (events.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      }

      console.log(`✅ Successfully fetched ${allEvents.length} total events from Shotgun`);
      return allEvents;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Shotgun API Error:", {
          url: error.config?.url,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
        throw new Error(
          `Failed to fetch Shotgun events: ${error.response?.data?.message || error.response?.statusText || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Récupère un événement spécifique par son ID
   */
  async fetchEventById(eventId: number): Promise<ShotgunEvent> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/organizers/${this.organizerId}/events`,
        {
          params: {
            key: this.apiKey,
            // Filtrer par ID si l'API le supporte, sinon on devra filtrer côté client
          },
        }
      );

      // Filtrer l'événement spécifique
      const events = response.data.data || [];
      const event = events.find((e: any) => e.id === eventId);
      
      if (!event) {
        throw new Error(`Event ${eventId} not found`);
      }
      
      return event;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Shotgun API Error:", {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
        });
      }
      throw error;
    }
  }

  /**
   * Vérifie si l'API est accessible et le token valide
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchOrganizerEvents();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export const shotgunService = new ShotgunService();
export type { ShotgunEvent };

