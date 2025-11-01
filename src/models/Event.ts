import mongoose from "mongoose";
type CallbackError = Error | undefined;

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
  },
  eventNumber: {
    type: String,
    required: false,
    trim: true,
    unique: true,
    sparse: true, // Permet d'avoir plusieurs documents avec eventNumber null
  },
  order: {
    type: Number,
    default: 0,
  },
  city: {
    type: String,
    required: [true, "City is required"],
    trim: true,
  },
  country: {
    type: String,
    trim: true,
  },
  date: {
    type: Date,
    required: [true, "Date is required"],
  },
  time: {
    type: String,
    required: [true, "Time is required"],
    trim: true,
  },
  isFree: {
    type: Boolean,
    default: false,
  },
  price: {
    type: String,
    required: function (this: any) {
      return !this.isFree;
    },
  },
  genres: {
    type: [String],
    default: [],
    validate: {
      validator: function (v: string[]) {
        return Array.isArray(v);
      },
      message: "Genres must be an array",
    },
  },
  ticketLink: {
    type: String,
    required: [true, "Ticket link is required"],
    trim: true,
  },
  isPast: {
    type: Boolean,
    default: false,
  },
  imageSrc: {
    type: String,
    required: [true, "Image source is required"],
  },
  imagePublicId: {
    type: String,
    required: [true, "Image public ID is required"],
  },
  shotgunId: {
    type: Number,
    required: false,
    unique: true,
    sparse: true, // Permet d'avoir plusieurs documents avec shotgunId null
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware pour parser les genres si c'est une string JSON
eventSchema.pre("save", async function (next: (err?: CallbackError) => void) {
  // Générer un eventNumber approprié selon si l'événement est masqué ou non
  if (!this.eventNumber) {
    if (this.isHidden) {
      // Pour les événements masqués, utiliser HIDDEN_{id}
      this.eventNumber = `HIDDEN_${this._id}`;
    } else {
      // Pour les événements visibles, générer un numéro consécutif
      try {
        // Trouver le dernier événement NON masqué avec un numéro valide (pas HIDDEN_ ou TEMP_)
        const lastEvent = await mongoose
          .model("Event")
          .findOne({ 
            isHidden: { $ne: true },
            eventNumber: { $regex: /^[0-9]+$/ } // Seulement les numéros numériques
          })
          .sort({ eventNumber: -1 });

        const nextNumber = lastEvent && lastEvent.eventNumber
          ? String(Number(lastEvent.eventNumber) + 1)
          : "1";

        this.eventNumber = nextNumber.padStart(3, "0");
      } catch (error) {
        return next(error as CallbackError);
      }
    }
  } else if (this.eventNumber && !this.eventNumber.startsWith("HIDDEN_") && !this.eventNumber.startsWith("TEMP_")) {
    // Formater les numéros numériques existants
    this.eventNumber = this.eventNumber.padStart(3, "0");
  }
  try {
    if (this.genres) {
      this.genres = Array.isArray(this.genres)
        ? this.genres
        : typeof this.genres === "string"
        ? JSON.parse(this.genres)
        : [];
    }
  } catch (e) {
    console.error("Error processing genres:", e);
    this.genres = [];
  }

  next();
});

// Middleware pour logger les erreurs de validation (version sécurisée)
eventSchema.post("save", function (error: any, doc: any, next: any) {
  if (error.name === "ValidationError") {
    console.log("Event validation error occurred:", {
      errorCount: Object.keys(error.errors).length,
      fields: Object.keys(error.errors),
    });
  }
  next(error);
});

const Event = mongoose.model("Event", eventSchema);

// Fonction helper pour valider un event avant de le sauvegarder
export const validateEvent = async (eventData: any) => {
  try {
    const event = new Event(eventData);
    await event.validate();
    return { isValid: true, errors: null };
  } catch (error) {
    return {
      isValid: false,
      errors:
        error instanceof Error ? error.message : "Unknown validation error",
    };
  }
};

export { Event };
