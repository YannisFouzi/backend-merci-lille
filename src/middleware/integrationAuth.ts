import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

const INTEGRATION_TIMESTAMP_HEADER = "x-integration-timestamp";
const INTEGRATION_SIGNATURE_HEADER = "x-integration-signature";
const SIGNATURE_PREFIX = "sha256=";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type ShotnotifEventDetectedIntegrationBody = {
  organizerId: string;
  shotgunEventId: number;
  requestId: string;
  detectedAt: string;
  trigger: "new_event_detected";
  source?: string;
  eventName?: string;
};

type IntegrationContext = {
  requestId?: string;
  source?: string;
};

export interface IntegrationRequest extends Request {
  integration?: IntegrationContext;
}

const getHeaderValue = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const timingSafeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const buildSignaturePayload = (req: Request, body: Partial<ShotnotifEventDetectedIntegrationBody>): string => {
  const requestPath = req.originalUrl.split("?")[0] || req.originalUrl;

  return [
    getHeaderValue(req.headers[INTEGRATION_TIMESTAMP_HEADER]) ?? "",
    req.method.toUpperCase(),
    requestPath,
    typeof body.organizerId === "string" ? body.organizerId : "",
    typeof body.shotgunEventId === "number" ? String(body.shotgunEventId) : "",
    typeof body.requestId === "string" ? body.requestId : "",
    typeof body.detectedAt === "string" ? body.detectedAt : "",
    typeof body.trigger === "string" ? body.trigger : "",
  ].join("\n");
};

const buildExpectedSignature = (
  req: Request,
  body: Partial<ShotnotifEventDetectedIntegrationBody>,
  secret: string
): string => {
  const payload = buildSignaturePayload(req, body);
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
};

export const shotnotifIntegrationAuth = (
  req: IntegrationRequest,
  res: Response,
  next: NextFunction
) => {
  const sharedSecret = process.env.SHOTNOTIF_INTEGRATION_SECRET;

  if (!sharedSecret) {
    logger.error("SHOTNOTIF_INTEGRATION_SECRET is not configured");
    return res.status(500).json({
      success: false,
      message: "Integration is not configured",
    });
  }

  const timestampHeader = getHeaderValue(req.headers[INTEGRATION_TIMESTAMP_HEADER]);
  const signatureHeader = getHeaderValue(req.headers[INTEGRATION_SIGNATURE_HEADER]);

  if (!timestampHeader || !signatureHeader) {
    return res.status(401).json({
      success: false,
      message: "Integration authentication headers are missing",
    });
  }

  const timestampSeconds = Number.parseInt(timestampHeader, 10);
  if (Number.isNaN(timestampSeconds)) {
    return res.status(401).json({
      success: false,
      message: "Invalid integration timestamp",
    });
  }

  const now = Date.now();
  const requestTimestamp = timestampSeconds * 1000;
  if (Math.abs(now - requestTimestamp) > MAX_CLOCK_SKEW_MS) {
    return res.status(401).json({
      success: false,
      message: "Integration request timestamp is expired",
    });
  }

  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return res.status(401).json({
      success: false,
      message: "Invalid integration signature format",
    });
  }

  const body = req.body as Partial<ShotnotifEventDetectedIntegrationBody>;
  const expectedSignature = buildExpectedSignature(req, body, sharedSecret);

  if (!timingSafeEqual(signatureHeader, expectedSignature)) {
    logger.warn(
      {
        path: req.originalUrl,
        requestId: body.requestId,
        shotgunEventId: body.shotgunEventId,
      },
      "Integration signature verification failed"
    );

    return res.status(401).json({
      success: false,
      message: "Invalid integration signature",
    });
  }

  req.integration = {
    requestId: typeof body.requestId === "string" ? body.requestId : undefined,
    source: typeof body.source === "string" ? body.source : undefined,
  };

  return next();
};
