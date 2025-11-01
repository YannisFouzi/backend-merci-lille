import express, { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { shotgunService } from "../services/shotgun.service";
import { shotgunSyncService } from "../services/shotgun-sync.service";

const router = express.Router();

/**
 * Route pour tester la connexion à l'API Shotgun
 * GET /api/shotgun-sync/test
 */
router.get("/test", authMiddleware, async (req: Request, res: Response) => {
  try {
    const isConnected = await shotgunService.testConnection();

    if (isConnected) {
      res.json({
        success: true,
        message: "✅ Connection to Shotgun API successful",
      });
    } else {
      res.status(500).json({
        success: false,
        message: "❌ Failed to connect to Shotgun API",
      });
    }
  } catch (error) {
    console.error("Shotgun connection test failed:", error);
    res.status(500).json({
      success: false,
      message: "Error testing Shotgun connection",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Route pour synchroniser tous les événements depuis Shotgun
 * POST /api/shotgun-sync/sync-all
 */
router.post("/sync-all", authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log("🔄 Starting manual sync of all Shotgun events...");

    const result = await shotgunSyncService.syncAllEvents();

    res.json({
      success: true,
      message: `Synchronization completed: ${result.created} created, ${result.updated} updated`,
      data: {
        created: result.created,
        updated: result.updated,
        errors: result.errors,
        events: result.syncedEvents,
      },
    });
  } catch (error) {
    console.error("Shotgun sync failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync events from Shotgun",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Route pour synchroniser un événement spécifique par son ID Shotgun
 * POST /api/shotgun-sync/sync-event/:shotgunId
 */
router.post(
  "/sync-event/:shotgunId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const shotgunId = parseInt(req.params.shotgunId, 10);

      if (isNaN(shotgunId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Shotgun event ID",
        });
      }

      const event = await shotgunSyncService.syncEventById(shotgunId);

      res.json({
        success: true,
        message: `Event synchronized successfully`,
        data: event,
      });
    } catch (error) {
      console.error("Event sync failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to sync event",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * Route pour récupérer les événements depuis Shotgun (sans les sauvegarder)
 * GET /api/shotgun-sync/preview
 */
router.get("/preview", authMiddleware, async (req: Request, res: Response) => {
  try {
    const events = await shotgunService.fetchOrganizerEvents();

    res.json({
      success: true,
      message: `Found ${events.length} events on Shotgun`,
      data: events,
    });
  } catch (error) {
    console.error("Failed to fetch Shotgun events:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch events from Shotgun",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;

