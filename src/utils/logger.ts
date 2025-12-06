import pino from "pino";

const level = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level,
  // En dev, on laisse pino au format lisible via transport pretty-print si besoin
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
});

export type Logger = typeof logger;
