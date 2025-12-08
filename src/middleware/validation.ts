import type { NextFunction, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";

// Middleware pour gÃ©rer les erreurs de validation
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "DonnÃ©es invalides",
      errors: errors.array().map((error) => ({
        field: error.type === "field" ? error.path : "unknown",
        message: error.msg,
      })),
    });
  }
  next();
};

// Validation pour l'authentification
export const validateLogin = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Le nom d'utilisateur doit contenir entre 3 et 100 caractÃ¨res")
    // Permet les usernames classiques ET les emails
    .matches(/^[a-zA-Z0-9_.@-]+$/)
    .withMessage("Le nom d'utilisateur contient des caractÃ¨res non autorisÃ©s"),

  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Le mot de passe doit contenir entre 8 et 128 caractÃ¨res"),

  handleValidationErrors,
];

// Validation pour la crÃ©ation d'Ã©vÃ©nements
export const validateEvent = [
  body("title")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Le titre est requis et doit faire moins de 200 caractÃ¨res")
    .escape(),

  body("city")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("La ville est requise et doit faire moins de 100 caractÃ¨res")
    .escape(),

  body("country")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Le pays doit faire moins de 100 caractÃ¨res")
    .escape(),

  body("date").isISO8601().withMessage("La date doit Ãªtre au format ISO8601 valide").toDate(),

  body("time")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("L'heure doit Ãªtre au format HH:MM (24h)"),

  body("ticketLink")
    .trim()
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Le lien de billetterie doit Ãªtre une URL valide")
    .isLength({ max: 500 })
    .withMessage("Le lien de billetterie doit faire moins de 500 caractÃ¨res"),

  body("eventNumber")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Le numÃ©ro d'Ã©vÃ©nement doit faire moins de 10 caractÃ¨res")
    .matches(/^[0-9]+$/)
    .withMessage("Le numÃ©ro d'Ã©vÃ©nement ne peut contenir que des chiffres"),

  body("genres.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Chaque genre doit contenir entre 1 et 50 caractÃ¨res")
    .escape(),

  handleValidationErrors,
];

// Validation pour la mise Ã  jour d'Ã©vÃ©nements (champs optionnels)
export const validateEventUpdate = [
  body("title")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Le titre doit faire entre 1 et 200 caractÃ¨res")
    .escape(),

  body("city")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("La ville doit faire entre 1 et 100 caractÃ¨res")
    .escape(),

  body("country")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Le pays doit faire moins de 100 caractÃ¨res")
    .escape(),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("La date doit Ãªtre au format ISO8601 valide")
    .toDate(),

  body("time")
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("L'heure doit Ãªtre au format HH:MM (24h)"),

  body("ticketLink")
    .optional()
    .trim()
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Le lien de billetterie doit Ãªtre une URL valide")
    .isLength({ max: 500 })
    .withMessage("Le lien de billetterie doit faire moins de 500 caractÃ¨res"),

  body("genres.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Chaque genre doit contenir entre 1 et 50 caractÃ¨res")
    .escape(),

  handleValidationErrors,
];

// Validation pour les paramÃ¨tres MongoDB ID dans l'URL
export const validateUrlId = [
  param("id").isMongoId().withMessage("ID invalide dans l'URL"),

  handleValidationErrors,
];

// Validation pour les IDs MongoDB dans le body (existant)
export const validateMongoId = (paramName: string = "id") => [
  body(paramName).optional().isMongoId().withMessage(`${paramName} doit Ãªtre un ID MongoDB valide`),

  handleValidationErrors,
];

// Validation pour la suppression multiple d'images
export const validateImageIds = [
  body("imageIds")
    .isArray({ min: 1, max: 50 })
    .withMessage("imageIds doit etre un tableau de 1 a 50 elements"),

  body("imageIds.*").isMongoId().withMessage("Chaque ID d'image doit etre un ID MongoDB valide"),

  body("imageIds")
    .custom((ids) => Array.isArray(ids) && new Set(ids).size === ids.length)
    .withMessage("imageIds ne doit pas contenir de doublons"),

  handleValidationErrors,
];

// Validation pour la mise a jour de l'ordre des images
export const validateImageOrder = [
  body("orderedIds")
    .isArray({ min: 1, max: 100 })
    .withMessage("orderedIds doit etre un tableau de 1 a 100 elements"),

  body("orderedIds.*").isMongoId().withMessage("Chaque ID doit etre un ID MongoDB valide"),

  body("orderedIds")
    .custom((ids) => Array.isArray(ids) && new Set(ids).size === ids.length)
    .withMessage("orderedIds ne doit pas contenir de doublons"),

  handleValidationErrors,
];

