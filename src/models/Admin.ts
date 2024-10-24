import bcrypt from "bcryptjs";
import mongoose from "mongoose";

// Interface pour le document Admin
interface IAdmin {
  username: string;
  password: string;
  createdAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// Interface pour le modèle Admin
interface AdminModel extends mongoose.Model<IAdmin> {
  // Vous pouvez ajouter des méthodes statiques ici si nécessaire
}

const adminSchema = new mongoose.Schema<IAdmin>({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Définir la méthode comparePassword
adminSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const Admin = mongoose.model<IAdmin, AdminModel>("Admin", adminSchema);
