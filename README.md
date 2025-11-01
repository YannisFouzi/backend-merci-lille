# 🎉 Merci Lille - Backend API

![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript)
![Express](https://img.shields.io/badge/Express-4.18-black?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-8.0-green?logo=mongodb)
![Cloudinary](https://img.shields.io/badge/Cloudinary-1.41-blue)

API REST sécurisée pour la gestion d'événements musicaux avec authentification JWT, upload d'images vers Cloudinary, et synchronisation avec l'API Shotgun.

## 📋 Table des matières

- [Aperçu](#-aperçu)
- [Technologies](#-technologies)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Scripts disponibles](#-scripts-disponibles)
- [Architecture](#-architecture)
- [API Endpoints](#-api-endpoints)
- [Sécurité](#-sécurité)
- [Intégration Shotgun](#-intégration-shotgun)
- [Déploiement](#-déploiement)

## 🎯 Aperçu

API Node.js/Express complète pour gérer :

- **Authentification administrateur** avec JWT et refresh tokens
- **Gestion d'événements** (CRUD complet)
- **Gestion de galerie photo** avec upload vers Cloudinary
- **Synchronisation Shotgun** pour import automatique des événements
- **Rate limiting** et protections contre les attaques
- **Validation des données** et sanitisation

## 🚀 Technologies

### Core

- **Node.js 20+** - Environnement d'exécution
- **TypeScript 5.2** - Typage statique
- **Express 4.18** - Framework web
- **MongoDB 8.0** - Base de données NoSQL
- **Mongoose 8.0** - ODM pour MongoDB

### Authentification & Sécurité

- **jsonwebtoken 9.0** - Génération et validation JWT
- **bcryptjs 2.4** - Hashing des mots de passe
- **cookie-parser 1.4** - Parsing des cookies
- **helmet 7.1** - Headers de sécurité HTTP
- **express-mongo-sanitize 2.2** - Protection contre les injections NoSQL
- **express-rate-limit 7.1** - Rate limiting global
- **rate-limiter-flexible 8.1** - Rate limiting avancé avec MongoDB
- **express-validator 7.0** - Validation des requêtes

### Upload & Storage

- **cloudinary 1.41** - Stockage d'images cloud
- **multer 1.4** - Gestion des uploads multipart
- **multer-storage-cloudinary 4.0** - Intégration Multer-Cloudinary

### Intégrations

- **axios 1.6** - Client HTTP pour API Shotgun
- **cors 2.8** - Gestion CORS

### Développement

- **ts-node 10.9** - Exécution TypeScript direct
- **nodemon 3.0** - Hot reload en développement
- **dotenv 16.4** - Gestion des variables d'environnement

## 📦 Installation

### Prérequis

- Node.js 18+ 
- npm ou yarn
- MongoDB (local ou Atlas)
- Compte Cloudinary
- Compte Shotgun (organisateur)

### Étapes d'installation

```bash
# Cloner le repository
git clone <votre-repo>

# Naviguer vers le dossier backend
cd backend-merci-lille

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env

# Compiler TypeScript
npm run build

# Lancer le serveur
npm start
```

Pour le développement avec hot reload :

```bash
npm run dev
```

Le serveur démarrera sur `http://localhost:3000`

## ⚙️ Configuration

### Variables d'environnement

Créez un fichier `.env` à la racine du projet backend :

```env
# ======================
# BASE DE DONNÉES
# ======================
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# ======================
# SERVEUR
# ======================
PORT=3000
NODE_ENV=development

# ======================
# JWT - AUTHENTIFICATION
# ======================
# Secret pour les tokens JWT (32+ caractères recommandés)
JWT_SECRET=votre_secret_jwt_tres_long_et_securise_minimum_32_caracteres

# ======================
# CLOUDINARY - STOCKAGE IMAGES
# ======================
CLOUDINARY_CLOUD_NAME=votre_cloud_name
CLOUDINARY_API_KEY=votre_api_key
CLOUDINARY_API_SECRET=votre_api_secret

# ======================
# SHOTGUN API - SYNCHRONISATION
# ======================
SHOTGUN_ORGANIZER_ID=183206
SHOTGUN_API_TOKEN=votre_token_shotgun_jwt
```

### Créer un administrateur

Après avoir configuré MongoDB, créez le premier compte administrateur :

```bash
npm run setup-admin
```

Le script vous demandera :
- Nom d'utilisateur
- Mot de passe

Le mot de passe sera automatiquement hashé avec bcrypt.

## 🛠 Scripts disponibles

```bash
# Développement - Lance avec hot reload
npm run dev

# Build - Compile TypeScript vers JavaScript
npm run build

# Production - Lance le serveur compilé
npm start

# Setup - Créer un compte administrateur
npm run setup-admin
```

## 🏗 Architecture

```
backend-merci-lille/
├── src/
│   ├── config/                 # Configuration
│   │   ├── auth.js            # Configuration JWT
│   │   ├── cloudinary.ts      # Configuration Cloudinary + Multer
│   │   └── database.ts        # Connexion MongoDB
│   │
│   ├── middleware/            # Middlewares Express
│   │   ├── auth.ts           # Authentification JWT
│   │   ├── rateLimiter.ts    # Rate limiting
│   │   └── validation.ts     # Validation des données
│   │
│   ├── models/               # Modèles Mongoose
│   │   ├── Admin.ts         # Administrateur
│   │   ├── Event.ts         # Événement
│   │   ├── Gallery.ts       # Image de galerie
│   │   └── RefreshToken.ts  # Token de rafraîchissement
│   │
│   ├── routes/              # Routes API
│   │   ├── auth.ts         # Authentification
│   │   ├── events.ts       # Événements (CRUD)
│   │   ├── gallery.ts      # Galerie (upload)
│   │   └── shotgun-sync.ts # Synchronisation Shotgun
│   │
│   ├── services/           # Services métier
│   │   ├── shotgun.service.ts      # Client API Shotgun
│   │   └── shotgun-sync.service.ts # Logique de synchronisation
│   │
│   ├── env-loader.js       # Chargeur de variables d'environnement
│   └── index.ts           # Point d'entrée principal
│
├── dist/                  # Fichiers compilés (après build)
├── setup-admin.js        # Script de création d'admin
├── tsconfig.json         # Configuration TypeScript
└── package.json
```

## 🔌 API Endpoints

### Base URL

```
http://localhost:3000/api
```

En production : `https://votre-domaine.com/api`

---

### 🔐 Authentification (`/api/auth`)

#### `POST /api/auth/login`
Connexion administrateur

**Body:**
```json
{
  "username": "admin",
  "password": "motdepasse"
}
```

**Réponse:**
```json
{
  "message": "Login successful",
  "expiresIn": 900
}
```

**Cookies définis:**
- `accessToken` (HttpOnly, 15min)
- `refreshToken` (HttpOnly, 7 jours)

**Rate limit:** 5 tentatives / 15min par IP

---

#### `POST /api/auth/refresh`
Rafraîchir le token d'accès

**Headers:** Cookie avec `refreshToken`

**Réponse:**
```json
{
  "message": "Token refreshed successfully",
  "expiresIn": 900
}
```

**Cookie mis à jour:**
- `accessToken` (nouveau token)

---

#### `POST /api/auth/logout`
Déconnexion

**Headers:** Cookie avec `accessToken`

**Réponse:**
```json
{
  "message": "Logged out successfully"
}
```

**Cookies supprimés:** `accessToken`, `refreshToken`

---

#### `GET /api/auth/verify`
Vérifier la validité du token

**Headers:** 
- Cookie avec `accessToken`
- `X-Requested-With: XMLHttpRequest`

**Réponse:**
```json
{
  "valid": true,
  "admin": {
    "id": "admin_id"
  }
}
```

---

### 📅 Événements (`/api/events`)

#### `GET /api/events`
Récupérer tous les événements (publics uniquement)

**Query params:**
- `includeHidden=true` (admin uniquement) - Inclure les événements masqués

**Réponse:**
```json
[
  {
    "_id": "event_id",
    "title": "Soirée Électro #001",
    "eventNumber": "001",
    "city": "Lille",
    "country": "France",
    "date": "2024-12-31T20:00:00.000Z",
    "time": "20h00",
    "isFree": false,
    "price": "10€",
    "genres": ["Techno", "House"],
    "ticketLink": "https://shotgun.live/...",
    "isPast": false,
    "isHidden": false,
    "isFeatured": true,
    "imageSrc": "https://res.cloudinary.com/...",
    "imagePublicId": "mercilille-events/event_...",
    "shotgunId": 123456,
    "order": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

#### `GET /api/events/:id`
Récupérer un événement spécifique

**Réponse:** Objet événement (voir ci-dessus)

---

#### `POST /api/events` 🔒
Créer un nouvel événement

**Headers:** 
- Cookie avec `accessToken`
- `Content-Type: multipart/form-data`
- `X-Requested-With: XMLHttpRequest`

**Body (FormData):**
```
title: "Soirée Électro #001"
city: "Lille"
country: "France"
date: "2024-12-31"
time: "20h00"
isFree: false
price: "10€"
genres: ["Techno", "House"]  // JSON string
ticketLink: "https://shotgun.live/..."
image: [File]  // Image (max 3MB)
```

**Validations:**
- `title`: requis, 3-200 caractères
- `city`: requis, 2-100 caractères
- `date`: requis, format date valide
- `time`: requis
- `price`: requis si `isFree=false`
- `ticketLink`: requis, URL valide
- `image`: requis, types autorisés: jpg, jpeg, png, gif, webp

**Réponse:** Objet événement créé

**Rate limit:** 10 uploads / minute

---

#### `PUT /api/events/:id` 🔒
Mettre à jour un événement

**Headers:** Identiques à POST
**Body:** Identique à POST (tous les champs sont optionnels sauf si logique métier)

---

#### `DELETE /api/events/:id` 🔒
Supprimer un événement

**Headers:** 
- Cookie avec `accessToken`
- `X-Requested-With: XMLHttpRequest`

**Réponse:**
```json
{
  "message": "Event deleted successfully"
}
```

**Note:** Supprime également l'image de Cloudinary et renuméroте les événements visibles.

---

#### `PUT /api/events/update-order` 🔒
Réorganiser l'ordre des événements

**Body:**
```json
{
  "orderedIds": ["id1", "id2", "id3"]
}
```

---

#### `PATCH /api/events/:id/hide` 🔒
Masquer un événement

#### `PATCH /api/events/:id/unhide` 🔒
Afficher un événement masqué

#### `POST /api/events/hide-multiple` 🔒
Masquer plusieurs événements

**Body:**
```json
{
  "eventIds": ["id1", "id2"]
}
```

#### `POST /api/events/unhide-multiple` 🔒
Afficher plusieurs événements

#### `PATCH /api/events/:id/feature` 🔒
Marquer comme événement phare

#### `PATCH /api/events/:id/unfeature` 🔒
Retirer le statut phare

#### `POST /api/events/feature-multiple` 🔒
Marquer plusieurs comme phares

#### `POST /api/events/unfeature-multiple` 🔒
Retirer le statut phare de plusieurs

#### `POST /api/events/renumber-all` 🔒
Forcer la renumérotation de tous les événements visibles

---

### 🖼️ Galerie (`/api/gallery`)

#### `GET /api/gallery`
Récupérer toutes les images

**Réponse:**
```json
[
  {
    "_id": "image_id",
    "imageSrc": "https://res.cloudinary.com/...",
    "imagePublicId": "mercilille-gallery/gallery_...",
    "order": 0,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

#### `POST /api/gallery` 🔒
Upload d'images dans la galerie

**Headers:**
- Cookie avec `accessToken`
- `Content-Type: multipart/form-data`
- `X-Requested-With: XMLHttpRequest`

**Body (FormData):**
```
images: [File, File, ...]  // Max 10 images, 5MB chacune
```

**Réponse:** Array des images créées

**Rate limit:** 10 uploads / minute

---

#### `DELETE /api/gallery/:id` 🔒
Supprimer une image

#### `POST /api/gallery/delete-multiple` 🔒
Supprimer plusieurs images

**Body:**
```json
{
  "imageIds": ["id1", "id2"]
}
```

#### `PUT /api/gallery/update-order` 🔒
Réorganiser l'ordre des images

**Body:**
```json
{
  "orderedIds": ["id1", "id2", "id3"]
}
```

---

### 🎫 Synchronisation Shotgun (`/api/shotgun-sync`) 🔒

Toutes les routes nécessitent une authentification.

#### `GET /api/shotgun-sync/test`
Tester la connexion à l'API Shotgun

**Réponse:**
```json
{
  "success": true,
  "message": "✅ Connection to Shotgun API successful"
}
```

---

#### `GET /api/shotgun-sync/preview`
Prévisualiser les événements Shotgun sans les importer

**Réponse:**
```json
{
  "success": true,
  "message": "Found 10 events on Shotgun",
  "data": [
    {
      "id": 123456,
      "name": "Soirée Électro",
      "startTime": "2024-12-31T20:00:00Z",
      "url": "https://shotgun.live/...",
      "coverUrl": "https://...",
      // ... autres champs
    }
  ]
}
```

---

#### `POST /api/shotgun-sync/sync-all`
Synchroniser tous les événements Shotgun

**Réponse:**
```json
{
  "success": true,
  "message": "Synchronization completed: 5 created, 2 updated",
  "data": {
    "created": 5,
    "updated": 2,
    "errors": [],
    "events": [/* ... */]
  }
}
```

**Traitement:**
1. Récupère tous les événements depuis Shotgun API
2. Pour chaque événement :
   - Vérifie s'il existe déjà (via `shotgunId`)
   - Télécharge l'image de couverture
   - Upload vers Cloudinary
   - Crée ou met à jour l'événement en base
3. Retourne le résumé

---

#### `POST /api/shotgun-sync/sync-event/:shotgunId`
Synchroniser un événement spécifique

**Params:** `shotgunId` - ID de l'événement sur Shotgun

**Réponse:**
```json
{
  "success": true,
  "message": "Event synchronized successfully",
  "data": {/* événement créé/mis à jour */}
}
```

---

### 🏥 Health Check

#### `GET /health`
Vérifier l'état du serveur

**Réponse:**
```json
{
  "status": "OK",
  "timestamp": "2024-11-01T12:00:00.000Z",
  "uptime": 3600
}
```

**Note:** Pas de rate limiting sur cette route (utilisée pour monitoring)

---

## 🔒 Sécurité

### Authentification

- ✅ **JWT avec Access + Refresh Tokens**
  - Access Token : 15 minutes (cookie HttpOnly)
  - Refresh Token : 7 jours (cookie HttpOnly)
- ✅ **Bcrypt** pour hasher les mots de passe (10 rounds)
- ✅ **Cookie-based** avec flags sécurisés :
  - `httpOnly: true` - Inaccessible depuis JavaScript
  - `secure: true` (en HTTPS) - Transmission uniquement en HTTPS
  - `sameSite: 'strict'` - Protection CSRF

### Protection contre les attaques

#### Rate Limiting

**Global** (toutes les routes):
- 100 requêtes / 15 minutes par IP

**Login** (`/api/auth/login`):
- 5 tentatives / 15 minutes par IP
- Utilise MongoDB pour persistance (rate-limiter-flexible)

**Upload** (`/api/gallery`, `/api/events`):
- 10 uploads / minute

#### Headers de sécurité (Helmet)

```javascript
- Content-Security-Policy
- X-DNS-Prefetch-Control
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
```

#### Sanitisation des données

- ✅ **express-mongo-sanitize** - Protection contre les injections NoSQL
- ✅ **express-validator** - Validation stricte des entrées
- ✅ **Multer file filter** - Vérification du type MIME des uploads

#### Protection CSRF

- Header `X-Requested-With` obligatoire pour toutes les requêtes non-GET
- Vérification côté serveur dans le middleware CSRF

#### Autres protections

- ✅ **Trust proxy** configuré pour Render/Heroku
- ✅ **Limite de taille des requêtes** : 5MB
- ✅ **CORS** strictement configuré
- ✅ **Logs sécurisés** sans données sensibles
- ✅ **Validation d'URL** pour prévenir les injections

### Révocation des tokens

- ✅ Les refresh tokens sont stockés en base MongoDB
- ✅ Révocation automatique au logout
- ✅ Limitation à 5 tokens actifs par admin (multi-device)
- ✅ Expiration automatique avec TTL MongoDB

### Rapport de sécurité complet

Consultez `/SECURITY_AUDIT_REPORT.md` et `/SECURITY_IMPLEMENTATION_PLAN.md` à la racine du projet.

## 🎫 Intégration Shotgun

L'API permet la synchronisation automatique avec Shotgun, une plateforme de billetterie événementielle.

### Configuration

```env
SHOTGUN_ORGANIZER_ID=183206
SHOTGUN_API_TOKEN=votre_token_jwt_shotgun
```

### Obtenir un token Shotgun

1. Connectez-vous à votre compte organisateur Shotgun
2. Accédez à votre profil / API
3. Générez un token JWT
4. Copiez-le dans `.env`

### Fonctionnement

Le service `shotgun.service.ts` :
- Se connecte à l'API Smartboard Shotgun
- Récupère les événements de votre compte organisateur
- Gère la pagination (100 événements par page)
- Filtre les événements passés

Le service `shotgun-sync.service.ts` :
- Mappe les données Shotgun vers le modèle Event
- Télécharge les images de couverture
- Upload vers Cloudinary
- Crée ou met à jour les événements
- Gère les doublons via `shotgunId`

### Guide complet

Consultez `/SHOTGUN_INTEGRATION_GUIDE.md` pour plus de détails.

## 📊 Base de données MongoDB

### Collections

#### `admins`
Administrateurs du système

```javascript
{
  username: String (unique),
  password: String (bcrypt hash),
  createdAt: Date
}
```

#### `events`
Événements

```javascript
{
  title: String (required),
  eventNumber: String (unique, sparse),
  order: Number,
  city: String (required),
  country: String,
  date: Date (required),
  time: String (required),
  isFree: Boolean,
  price: String,
  genres: [String],
  ticketLink: String (required),
  isPast: Boolean,
  imageSrc: String (required),
  imagePublicId: String (required),
  shotgunId: Number (unique, sparse),
  isHidden: Boolean,
  isFeatured: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### `galleries`
Images de galerie

```javascript
{
  imageSrc: String (required),
  imagePublicId: String (required),
  order: Number,
  createdAt: Date
}
```

#### `refreshtokens`
Tokens de rafraîchissement

```javascript
{
  token: String (unique),
  adminId: ObjectId (ref: Admin),
  expiresAt: Date,
  ipAddress: String,
  userAgent: String,
  isRevoked: Boolean,
  lastUsedAt: Date,
  createdAt: Date
}
```

**Index TTL:** Suppression automatique après expiration

### Connexion

La connexion MongoDB est gérée dans `src/config/database.ts` avec retry automatique.

## 🚀 Déploiement

### Render / Heroku

1. **Créer le service web**
   - Connecter votre repo GitHub
   - Sélectionner `backend-merci-lille` comme root directory

2. **Variables d'environnement**
   - Configurer toutes les variables listées dans `.env`
   - `NODE_ENV=production`

3. **Build Command**
   ```bash
   npm install && npm run build
   ```

4. **Start Command**
   ```bash
   npm start
   ```

### Configuration pour production

#### Trust Proxy

Déjà configuré dans `src/index.ts` :

```typescript
app.set('trust proxy', 1);
```

#### CORS

Mettre à jour les origines autorisées :

```typescript
cors({
  origin: [
    'https://votre-frontend.com',
    'http://localhost:5173' // Retirer en production
  ],
  credentials: true
})
```

#### Base de données

Utilisez MongoDB Atlas pour la production :
- Créer un cluster
- Configurer les IP whitelist
- Copier la connection string dans `MONGODB_URI`

### Monitoring

#### Logs

Les logs sont écrits dans la console. Utilisez un service comme :
- **Render** : Logs intégrés
- **Loggly**
- **Papertrail**
- **Datadog**

#### Health Check

Configurez le monitoring avec l'endpoint `/health`

### Performance

#### Optimisations activées

- ✅ Index MongoDB sur les champs fréquemment requêtés
- ✅ Compression des images via Cloudinary
- ✅ Rate limiting pour éviter l'abus
- ✅ TTL sur les refresh tokens pour nettoyer la base

## 🐛 Debugging

### Logs

Les logs sont sécurisés (pas de données sensibles) mais informatifs :

```bash
# Connexion MongoDB
📱 Connecté à MongoDB

# Shotgun sync
🔍 Fetching events for organizer ID: 183206
✅ Successfully fetched 10 total events from Shotgun
```

### Problèmes courants

**Erreur de connexion MongoDB**
- Vérifiez `MONGODB_URI`
- Vérifiez que l'IP du serveur est whitelistée sur MongoDB Atlas

**Images ne s'uploadent pas**
- Vérifiez les credentials Cloudinary
- Vérifiez les limites de taille (3MB événements, 5MB galerie)
- Vérifiez le format (jpg, jpeg, png, gif, webp uniquement)

**Shotgun sync échoue**
- Vérifiez `SHOTGUN_API_TOKEN` et `SHOTGUN_ORGANIZER_ID`
- Testez avec `/api/shotgun-sync/test`
- Vérifiez les logs du serveur

**Rate limiting trop strict**
- Ajustez les valeurs dans `src/index.ts`
- Pour le dev, vous pouvez temporairement les désactiver

## 🧪 Tests

### Test manuel avec cURL

**Test de connexion:**
```bash
curl http://localhost:3000/health
```

**Test login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{"username":"admin","password":"motdepasse"}' \
  -c cookies.txt
```

**Test route protégée:**
```bash
curl http://localhost:3000/api/events?includeHidden=true \
  -b cookies.txt
```

### Test avec Postman

Collection disponible sur demande.

## 📄 License

Ce projet est la propriété de **Merci Lille**.

## 👨‍💻 Développement

Développé par [fouzi-dev.fr](https://fouzi-dev.fr)

## 📞 Support

Pour toute question ou problème :
- Consultez la documentation frontend : `/frontend-merci-lille/README.md`
- Consultez le guide Shotgun : `/SHOTGUN_INTEGRATION_GUIDE.md`
- Consultez le rapport de sécurité : `/SECURITY_AUDIT_REPORT.md`

## 🤝 Contribution

Pour contribuer au projet :

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

---

**© 2024 Merci Lille. Tous droits réservés.**

