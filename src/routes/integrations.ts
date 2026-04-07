import express, { Response } from "express";
import {
  IntegrationRequest,
  ShotnotifEventDetectedIntegrationBody,
  shotnotifIntegrationAuth,
} from "../middleware/integrationAuth";
import { validateShotnotifEventDetectedIntegration } from "../middleware/validation";
import { shotgunSyncService } from "../services/shotgun-sync.service";
import { logger } from "../utils/logger";

const router = express.Router();

/**
 * POST /api/integrations/shotnotif/events/detected
 *
 * Machine-to-machine endpoint called by the shotnotif worker when it detects
 * a new event that should be imported into Merci Lille.
 *
 * Required headers:
 * - X-Integration-Timestamp: unix timestamp in seconds
 * - X-Integration-Signature: sha256=<hex_hmac>
 *
 * Signed payload format:
 *   <timestamp>\n<METHOD>\n<PATH>\n<organizerId>\n<shotgunEventId>\n<requestId>\n<detectedAt>\n<trigger>
 */
router.post(
  "/shotnotif/events/detected",
  shotnotifIntegrationAuth,
  validateShotnotifEventDetectedIntegration,
  async (req: IntegrationRequest, res: Response) => {
    const body = req.body as ShotnotifEventDetectedIntegrationBody;
    const configuredOrganizerId = process.env.SHOTGUN_ORGANIZER_ID;

    if (configuredOrganizerId && body.organizerId !== configuredOrganizerId) {
      logger.warn(
        {
          requestId: body.requestId,
          organizerId: body.organizerId,
          configuredOrganizerId,
          shotgunEventId: body.shotgunEventId,
        },
        "Rejected shotnotif integration request because organizerId does not match backend configuration"
      );

      return res.status(403).json({
        success: false,
        message: "Organizer is not allowed for this integration",
      });
    }

    try {
      logger.info(
        {
          requestId: body.requestId,
          organizerId: body.organizerId,
          shotgunEventId: body.shotgunEventId,
          source: req.integration?.source || body.source || "shotnotif",
          eventName: body.eventName,
          detectedAt: body.detectedAt,
        },
        "Processing shotnotif event-detected integration"
      );

      const result = await shotgunSyncService.syncEventByIdDetailed(body.shotgunEventId);

      return res.json({
        success: true,
        message: "Event synchronized successfully",
        data: {
          requestId: body.requestId,
          organizerId: body.organizerId,
          shotgunEventId: body.shotgunEventId,
          status: result.status,
          event: result.event,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        {
          err: error,
          requestId: body.requestId,
          shotgunEventId: body.shotgunEventId,
        },
        "Shotnotif event-detected integration failed"
      );

      const statusCode = message.includes("not found") ? 404 : 500;
      return res.status(statusCode).json({
        success: false,
        message: "Failed to synchronize event from integration request",
        error: message,
      });
    }
  }
);

export default router;
