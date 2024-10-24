import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
  },
  eventNumber: {
    type: String,
    required: [true, "Event number is required"],
    trim: true,
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
eventSchema.pre("save", function (next) {
  if (this.genres && typeof this.genres === "string") {
    try {
      this.genres = JSON.parse(this.genres);
    } catch (e) {
      console.error("Error parsing genres:", e);
    }
  }
  next();
});

// Middleware pour logger les erreurs de validation
eventSchema.post("save", function (error: any, doc: any, next: any) {
  if (error.name === "ValidationError") {
    console.log("Validation Error:", {
      error: error.message,
      details: Object.values(error.errors).map((err: any) => ({
        field: err.path,
        message: err.message,
        value: err.value,
      })),
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
