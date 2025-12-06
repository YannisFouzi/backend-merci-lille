import express, { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { shotgunService } from "../services/shotgun.service";
import { shotgunSyncService } from "../services/shotgun-sync.service";
import { logger } from "../utils/logger";

const router = express.Router();

/**
 * GET /api/shotgun-sync/test
 * Teste la connexion à l'API Shotgun.
 */
router.get("/test", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const isConnected = await shotgunService.testConnection();

    if (isConnected) {
      return res.json({
        success: true,
        message: "Connection to Shotgun API successful",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to connect to Shotgun API",
    });
  } catch (error) {
    logger.error({ err: error }, "Shotgun connection test failed");
    return res.status(500).json({
      success: false,
      message: "Error testing Shotgun connection",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/shotgun-sync/sync-all
 * Synchronise tous les événements Shotgun.
 */
router.post("/sync-all", authMiddleware, async (_req: Request, res: Response) => {
  try {
    logger.info("Starting manual sync of all Shotgun events");

    const result = await shotgunSyncService.syncAllEvents();

    return res.json({
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
    logger.error({ err: error }, "Shotgun sync failed");
    return res.status(500).json({
      success: false,
      message: "Failed to sync events from Shotgun",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/shotgun-sync/sync-event/:shotgunId
 * Synchronise un événement spécifique par son ID Shotgun.
 */
router.post("/sync-event/:shotgunId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const shotgunId = Number.parseInt(req.params.shotgunId, 10);

    if (Number.isNaN(shotgunId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shotgun event ID",
      });
    }

    const event = await shotgunSyncService.syncEventById(shotgunId);

    return res.json({
      success: true,
      message: "Event synchronized successfully",
      data: event,
    });
  } catch (error) {
    logger.error({ err: error }, "Event sync failed");
    return res.status(500).json({
      success: false,
      message: "Failed to sync event",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/shotgun-sync/preview
 * Récupère les événements depuis Shotgun sans les sauvegarder.
 */
router.get("/preview", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const events = await shotgunService.fetchOrganizerEvents();

    return res.json({
      success: true,
      message: `Found ${events.length} events on Shotgun`,
      data: events,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch Shotgun events");
    return res.status(500).json({
      success: false,
      message: "Failed to fetch events from Shotgun",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
