import { NextFunction, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";

// Middleware pour gérer les erreurs de validation
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Données invalides",
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
    .withMessage("Le nom d'utilisateur doit contenir entre 3 et 100 caractères")
    // Permet les usernames classiques ET les emails
    .matches(/^[a-zA-Z0-9_.@-]+$/)
    .withMessage("Le nom d'utilisateur contient des caractères non autorisés"),

  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Le mot de passe doit contenir entre 8 et 128 caractères"),

  handleValidationErrors,
];

// Validation pour la création d'événements
export const validateEvent = [
  body("title")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Le titre est requis et doit faire moins de 200 caractères")
    .escape(),

  body("city")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("La ville est requise et doit faire moins de 100 caractères")
    .escape(),

  body("country")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Le pays doit faire moins de 100 caractères")
    .escape(),

  body("date")
    .isISO8601()
    .withMessage("La date doit être au format ISO8601 valide")
    .toDate(),

  body("time")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("L'heure doit être au format HH:MM (24h)"),

  body("price")
    .optional()
    .isFloat({ min: 0, max: 9999.99 })
    .withMessage("Le prix doit être un nombre entre 0 et 9999.99")
    .toFloat(),

  body("isFree")
    .optional()
    .isBoolean()
    .withMessage("isFree doit être un booléen")
    .toBoolean(),

  body("ticketLink")
    .trim()
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Le lien de billetterie doit être une URL valide")
    .isLength({ max: 500 })
    .withMessage("Le lien de billetterie doit faire moins de 500 caractères"),

  body("eventNumber")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Le numéro d'événement doit faire moins de 10 caractères")
    .matches(/^[0-9]+$/)
    .withMessage("Le numéro d'événement ne peut contenir que des chiffres"),

  body("genres.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Chaque genre doit contenir entre 1 et 50 caractères")
    .escape(),

  handleValidationErrors,
];

// Validation pour la mise à jour d'événements (champs optionnels)
export const validateEventUpdate = [
  body("title")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Le titre doit faire entre 1 et 200 caractères")
    .escape(),

  body("city")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("La ville doit faire entre 1 et 100 caractères")
    .escape(),

  body("country")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Le pays doit faire moins de 100 caractères")
    .escape(),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("La date doit être au format ISO8601 valide")
    .toDate(),

  body("time")
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("L'heure doit être au format HH:MM (24h)"),

  body("price")
    .optional()
    .isFloat({ min: 0, max: 9999.99 })
    .withMessage("Le prix doit être un nombre entre 0 et 9999.99")
    .toFloat(),

  body("isFree")
    .optional()
    .isBoolean()
    .withMessage("isFree doit être un booléen")
    .toBoolean(),

  body("ticketLink")
    .optional()
    .trim()
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Le lien de billetterie doit être une URL valide")
    .isLength({ max: 500 })
    .withMessage("Le lien de billetterie doit faire moins de 500 caractères"),

  body("genres.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Chaque genre doit contenir entre 1 et 50 caractères")
    .escape(),

  handleValidationErrors,
];

// Validation pour les paramètres MongoDB ID dans l'URL
export const validateUrlId = [
  param("id").isMongoId().withMessage("ID invalide dans l'URL"),

  handleValidationErrors,
];

// Validation pour les IDs MongoDB dans le body (existant)
export const validateMongoId = (paramName: string = "id") => [
  body(paramName)
    .optional()
    .isMongoId()
    .withMessage(`${paramName} doit être un ID MongoDB valide`),

  handleValidationErrors,
];

// Validation pour la suppression multiple d'images
export const validateImageIds = [
  body("imageIds")
    .isArray({ min: 1, max: 50 })
    .withMessage("imageIds doit être un tableau de 1 à 50 éléments"),

  body("imageIds.*")
    .isMongoId()
    .withMessage("Chaque ID d'image doit être un ID MongoDB valide"),

  handleValidationErrors,
];

// Validation pour la mise à jour de l'ordre des images
export const validateImageOrder = [
  body("orderedIds")
    .isArray({ min: 1, max: 100 })
    .withMessage("orderedIds doit être un tableau de 1 à 100 éléments"),

  body("orderedIds.*")
    .isMongoId()
    .withMessage("Chaque ID doit être un ID MongoDB valide"),

  handleValidationErrors,
];
