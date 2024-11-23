module.exports = {
  apps: [
    {
      name: "mercilille-api",
      script: "dist/index.js", // Le fichier compilé
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        MONGODB_URI:
          "mongodb+srv://mercilille:Hougasinge2023!@event.9ccez.mongodb.net/?retryWrites=true&w=majority&appName=event",
        JWT_SECRET: "a7e2f3098b5c1d4e6f9082h3j4k5l6m7n8p9q0r1s2t3u4v5w6x7y8z9",
        CLOUDINARY_CLOUD_NAME: "dkopgsetb",
        CLOUDINARY_API_KEY: "566397884333594",
        CLOUDINARY_API_SECRET: "PJojaHTfjNFgri_5z-g9aRGwnNg",
      },
    },
  ],
};
