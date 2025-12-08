import mongoose from "mongoose";

// Interface pour le document RefreshToken
interface IRefreshToken {
  tokenHash: string;
  adminId: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  isRevoked: boolean;
}

// Interface pour le modèle RefreshToken
interface RefreshTokenModel extends mongoose.Model<IRefreshToken> {
  // Méthodes statiques peuvent être ajoutées ici si nécessaire
}

const refreshTokenSchema = new mongoose.Schema<IRefreshToken>({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true, // Index pour recherche rapide
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
    index: true, // Index pour recherche par admin
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  lastUsedAt: {
    type: Date,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
  },
  userAgent: {
    type: String,
    default: null,
  },
  isRevoked: {
    type: Boolean,
    default: false,
    required: true,
  },
});

// Index TTL : MongoDB supprimera automatiquement les documents expirés
// Le délai de 0 signifie "supprimer dès que expiresAt est dépassé"
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken, RefreshTokenModel>(
  "RefreshToken",
  refreshTokenSchema
);
