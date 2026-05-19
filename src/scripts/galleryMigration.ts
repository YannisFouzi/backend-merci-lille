import dotenv from "dotenv";
import dns from "dns";
import fs from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";

import { Gallery } from "../models/Gallery";

dotenv.config();

type Mode = "audit" | "upload" | "apply" | "rollback";
type MappingAction = "keep" | "replace" | "remove" | "add";

type CliOptions = {
  mode: Mode;
  execute: boolean;
  onlyMapped: boolean;
  localDirs: string[];
  targetFolder: string;
  existingFolder: string;
  outDir: string;
  mappingPath: string;
  backupPath: string;
};

type LocalImage = {
  absolutePath: string;
  relativePath: string;
  sourceKey: string;
  fileName: string;
  baseName: string;
  normalizedName: string;
  bytes: number;
};

type CloudinaryResource = {
  publicId: string;
  secureUrl: string;
  originalFilename?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  createdAt?: string;
  normalizedPublicId: string;
  normalizedBaseName: string;
  normalizedOriginalFilename?: string;
};

type GalleryDocument = {
  id: string;
  imageSrc: string;
  imagePublicId: string;
  order: number;
  createdAt?: string;
  normalizedPublicId: string;
  normalizedUrlBaseName: string;
};

type SuggestedMatch = {
  galleryId: string;
  currentImagePublicId: string;
  currentImageSrc: string;
  suggestedLocalPath?: string;
  suggestedLocalName?: string;
  suggestedCloudinaryPublicId?: string;
  suggestedImageSrc?: string;
  reason: string;
};

type MappingItem = {
  action: MappingAction;
  galleryId?: string;
  currentOrder?: number;
  currentImagePublicId?: string;
  currentImageSrc?: string;
  newLocalPath?: string;
  newCloudinaryPublicId?: string;
  newImageSrc?: string;
  order: number;
};

type MappingFile = {
  version: number;
  generatedAt?: string;
  notes?: string[];
  items: MappingItem[];
};

type BackupFile = {
  generatedAt: string;
  docs: Array<{
    _id: string;
    imageSrc: string;
    imagePublicId: string;
    order: number;
    createdAt?: string;
  }>;
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

const DEFAULT_LOCAL_DIRS = [
  path.resolve(process.cwd(), "../frontend-merci-lille/src/media/photo-wall"),
  path.resolve(process.cwd(), "../frontend-merci-lille/src/media/gallery"),
];

const DEFAULT_OUT_DIR = path.resolve(process.cwd(), "tmp/gallery-migration");

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {
    mode: "audit",
    execute: false,
    onlyMapped: false,
    localDirs: [],
    targetFolder: "mercilille-gallery-migration",
    existingFolder: "mercilille-gallery",
    outDir: DEFAULT_OUT_DIR,
    mappingPath: "",
    backupPath: "",
  };

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--execute") {
      options.execute = true;
      continue;
    }

    if (arg === "--only-mapped") {
      options.onlyMapped = true;
      continue;
    }

    if (!next || next.startsWith("--")) {
      continue;
    }

    if (arg === "--mode") {
      options.mode = next as Mode;
      index++;
    } else if (arg === "--local-dir") {
      options.localDirs.push(path.resolve(process.cwd(), next));
      index++;
    } else if (arg === "--target-folder") {
      options.targetFolder = trimFolder(next);
      index++;
    } else if (arg === "--existing-folder") {
      options.existingFolder = trimFolder(next);
      index++;
    } else if (arg === "--out-dir") {
      options.outDir = path.resolve(process.cwd(), next);
      index++;
    } else if (arg === "--mapping") {
      options.mappingPath = path.resolve(process.cwd(), next);
      index++;
    } else if (arg === "--backup") {
      options.backupPath = path.resolve(process.cwd(), next);
      index++;
    }
  }

  if (!["audit", "upload", "apply", "rollback"].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }

  if (options.localDirs.length === 0) {
    options.localDirs = DEFAULT_LOCAL_DIRS;
  }

  if (!options.mappingPath) {
    options.mappingPath = path.join(options.outDir, "gallery-migration-map.json");
  }

  return options;
};

const trimFolder = (folder: string): string => folder.replace(/^\/+|\/+$/g, "");

const ensureEnv = (names: string[]) => {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
};

const configureDns = () => {
  const servers = (process.env.MIGRATION_DNS_SERVERS || "1.1.1.1,8.8.8.8")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length > 0) {
    dns.setServers(servers);
  }
};

const configureCloudinary = () => {
  ensureEnv(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]);

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};

const connectMongo = async () => {
  ensureEnv(["MONGODB_URI"]);
  configureDns();
  await mongoose.connect(process.env.MONGODB_URI as string);
};

const normalizeName = (value: string): string =>
  stripExtension(decodeURIComponent(value))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const stripExtension = (value: string): string => {
  const parsed = path.parse(value);
  return parsed.name || value;
};

const getUrlBaseName = (value: string): string => {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return stripExtension(parts[parts.length - 1] || value);
  } catch (_error) {
    return stripExtension(path.basename(value.split("?")[0] || value));
  }
};

const getPublicIdBaseName = (publicId: string): string => {
  const parts = publicId.split("/");
  return parts[parts.length - 1] || publicId;
};

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
};

const walkImageFiles = async (dir: string): Promise<string[]> => {
  if (!(await pathExists(dir))) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await walkImageFiles(entryPath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files;
};

const readLocalImages = async (localDirs: string[]): Promise<LocalImage[]> => {
  const images: LocalImage[] = [];

  for (const dir of localDirs) {
    const sourceKey = path.basename(dir);
    const files = await walkImageFiles(dir);

    for (const file of files) {
      const stat = await fs.stat(file);
      const fileName = path.basename(file);
      const baseName = stripExtension(fileName);

      images.push({
        absolutePath: file,
        relativePath: path.relative(process.cwd(), file).replace(/\\/g, "/"),
        sourceKey,
        fileName,
        baseName,
        normalizedName: normalizeName(baseName),
        bytes: stat.size,
      });
    }
  }

  return images.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
};

const readGalleryDocuments = async (): Promise<GalleryDocument[]> => {
  const docs = await Gallery.find().sort({ order: 1, createdAt: -1 }).lean();

  return docs.map((doc) => {
    const imagePublicId = String(doc.imagePublicId);
    const imageSrc = String(doc.imageSrc);

    return {
      id: String(doc._id),
      imageSrc,
      imagePublicId,
      order: Number(doc.order || 0),
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
      normalizedPublicId: normalizeName(getPublicIdBaseName(imagePublicId)),
      normalizedUrlBaseName: normalizeName(getUrlBaseName(imageSrc)),
    };
  });
};

const listCloudinaryResources = async (folder: string): Promise<CloudinaryResource[]> => {
  const resources: CloudinaryResource[] = [];
  let nextCursor: string | undefined;

  do {
    const response = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix: folder,
      max_results: 500,
      next_cursor: nextCursor,
    } as Record<string, unknown>);

    const responseResources = Array.isArray(response.resources) ? response.resources : [];
    for (const resource of responseResources) {
      const item = resource as Record<string, unknown>;
      const publicId = String(item.public_id || "");
      const secureUrl = String(item.secure_url || "");
      const originalFilename =
        typeof item.original_filename === "string" ? item.original_filename : undefined;
      const baseName = getPublicIdBaseName(publicId);

      resources.push({
        publicId,
        secureUrl,
        originalFilename,
        format: typeof item.format === "string" ? item.format : undefined,
        bytes: typeof item.bytes === "number" ? item.bytes : undefined,
        width: typeof item.width === "number" ? item.width : undefined,
        height: typeof item.height === "number" ? item.height : undefined,
        createdAt: typeof item.created_at === "string" ? item.created_at : undefined,
        normalizedPublicId: normalizeName(publicId),
        normalizedBaseName: normalizeName(baseName),
        normalizedOriginalFilename: originalFilename ? normalizeName(originalFilename) : undefined,
      });
    }

    nextCursor = typeof response.next_cursor === "string" ? response.next_cursor : undefined;
  } while (nextCursor);

  return resources;
};

const indexByName = <T extends { normalizedName: string }>(items: T[]): Map<string, T[]> => {
  const byName = new Map<string, T[]>();
  for (const item of items) {
    const existing = byName.get(item.normalizedName) || [];
    existing.push(item);
    byName.set(item.normalizedName, existing);
  }
  return byName;
};

const indexCloudinaryResources = (
  resources: CloudinaryResource[]
): Map<string, CloudinaryResource[]> => {
  const byName = new Map<string, CloudinaryResource[]>();

  for (const resource of resources) {
    const names = [
      resource.normalizedPublicId,
      resource.normalizedBaseName,
      resource.normalizedOriginalFilename,
    ].filter(Boolean) as string[];

    for (const name of names) {
      const existing = byName.get(name) || [];
      existing.push(resource);
      byName.set(name, existing);
    }
  }

  return byName;
};

const getTargetPublicId = (entry: LocalImage, targetFolder: string): string =>
  `${targetFolder}/${entry.sourceKey}/${entry.baseName}`;

const getDeliveryUrl = (publicId: string): string =>
  cloudinary.url(publicId, {
    secure: true,
    quality: "auto:good",
    fetch_format: "auto",
  });

const writeJson = async (filePath: string, data: unknown) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const readJson = async <T>(filePath: string): Promise<T> => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
};

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

const createBackup = async (outDir: string): Promise<string> => {
  const docs = await Gallery.find().sort({ order: 1, createdAt: -1 }).lean();
  const backup: BackupFile = {
    generatedAt: new Date().toISOString(),
    docs: docs.map((doc) => ({
      _id: String(doc._id),
      imageSrc: String(doc.imageSrc),
      imagePublicId: String(doc.imagePublicId),
      order: Number(doc.order || 0),
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    })),
  };

  const backupPath = path.join(outDir, `gallery-backup-${timestamp()}.json`);
  await writeJson(backupPath, backup);
  return backupPath;
};

const runAudit = async (options: CliOptions) => {
  configureCloudinary();
  await connectMongo();

  try {
    const localImages = await readLocalImages(options.localDirs);
    const galleryDocs = await readGalleryDocuments();
    const existingResources = await listCloudinaryResources(options.existingFolder);
    const targetResources = await listCloudinaryResources(options.targetFolder);

    const localByName = indexByName(localImages);
    const targetByName = indexCloudinaryResources(targetResources);
    const existingByPublicId = new Map(existingResources.map((item) => [item.publicId, item]));

    const suggestions: SuggestedMatch[] = galleryDocs.map((doc) => {
      const existingResource = existingByPublicId.get(doc.imagePublicId);
      const candidateNames = [
        doc.normalizedPublicId,
        doc.normalizedUrlBaseName,
        existingResource?.normalizedOriginalFilename,
      ].filter(Boolean) as string[];

      let suggestedLocal: LocalImage | undefined;
      let reason = "no filename match found";

      for (const candidateName of candidateNames) {
        const matches = localByName.get(candidateName);
        if (matches && matches.length === 1) {
          suggestedLocal = matches[0];
          reason = `matched local filename with ${candidateName}`;
          break;
        }
      }

      const targetMatch = suggestedLocal
        ? targetByName.get(suggestedLocal.normalizedName)?.[0]
        : undefined;

      return {
        galleryId: doc.id,
        currentImagePublicId: doc.imagePublicId,
        currentImageSrc: doc.imageSrc,
        suggestedLocalPath: suggestedLocal?.relativePath,
        suggestedLocalName: suggestedLocal?.fileName,
        suggestedCloudinaryPublicId: targetMatch?.publicId,
        suggestedImageSrc: targetMatch ? getDeliveryUrl(targetMatch.publicId) : undefined,
        reason,
      };
    });

    const auditPath = path.join(options.outDir, `gallery-audit-${timestamp()}.json`);
    await writeJson(auditPath, {
      generatedAt: new Date().toISOString(),
      dryRun: true,
      localDirs: options.localDirs,
      targetFolder: options.targetFolder,
      existingFolder: options.existingFolder,
      stats: {
        localImages: localImages.length,
        galleryDocs: galleryDocs.length,
        existingCloudinaryResources: existingResources.length,
        targetCloudinaryResources: targetResources.length,
        suggestedFilenameMatches: suggestions.filter((item) => item.suggestedLocalPath).length,
        suggestedReadyReplacements: suggestions.filter((item) => item.suggestedCloudinaryPublicId)
          .length,
      },
      localImages,
      galleryDocs,
      existingResources,
      targetResources,
      suggestions,
    });

    const mapping: MappingFile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      notes: [
        "Default action is keep unless a target Cloudinary asset is already available.",
        "Use mode upload --execute before apply if newCloudinaryPublicId is empty.",
        "Use action replace/remove/add only after visually checking the mapping.",
        "Apply mode never deletes old Cloudinary assets.",
      ],
      items: galleryDocs.map((doc) => {
        const suggestion = suggestions.find((item) => item.galleryId === doc.id);
        const shouldReplace = Boolean(suggestion?.suggestedCloudinaryPublicId);

        return {
          action: shouldReplace ? "replace" : "keep",
          galleryId: doc.id,
          currentOrder: doc.order,
          currentImagePublicId: doc.imagePublicId,
          currentImageSrc: doc.imageSrc,
          newLocalPath: suggestion?.suggestedLocalPath || "",
          newCloudinaryPublicId: suggestion?.suggestedCloudinaryPublicId || "",
          newImageSrc: suggestion?.suggestedImageSrc || "",
          order: doc.order,
        };
      }),
    };

    await writeJson(options.mappingPath, mapping);

    console.log(`Audit written: ${auditPath}`);
    console.log(`Mapping template written: ${options.mappingPath}`);
    console.log(`Local images: ${localImages.length}`);
    console.log(`Gallery documents: ${galleryDocs.length}`);
    console.log(
      `Suggested filename matches: ${suggestions.filter((item) => item.suggestedLocalPath).length}`
    );
    console.log(
      `Ready replacements: ${suggestions.filter((item) => item.suggestedCloudinaryPublicId).length}`
    );
  } finally {
    await mongoose.disconnect();
  }
};

const runUpload = async (options: CliOptions) => {
  configureCloudinary();

  let localImages = await readLocalImages(options.localDirs);
  if (options.onlyMapped) {
    const mapping = await readJson<MappingFile>(options.mappingPath);
    const mappedPaths = new Set(
      mapping.items
        .filter((item) => item.action === "replace" || item.action === "add")
        .map((item) => item.newLocalPath)
        .filter(Boolean)
    );
    localImages = localImages.filter((image) => mappedPaths.has(image.relativePath));
  }

  const targetResources = await listCloudinaryResources(options.targetFolder);
  const existingPublicIds = new Set(targetResources.map((resource) => resource.publicId));
  const report = [];

  for (const image of localImages) {
    const publicId = getTargetPublicId(image, options.targetFolder);
    const folder = `${options.targetFolder}/${image.sourceKey}`;

    if (existingPublicIds.has(publicId)) {
      report.push({
        status: "exists",
        localPath: image.relativePath,
        publicId,
        imageSrc: getDeliveryUrl(publicId),
      });
      continue;
    }

    if (!options.execute) {
      report.push({
        status: "would_upload",
        localPath: image.relativePath,
        publicId,
        imageSrc: getDeliveryUrl(publicId),
      });
      continue;
    }

    const uploadResult = await cloudinary.uploader.upload(image.absolutePath, {
      folder,
      public_id: image.baseName,
      resource_type: "image",
      overwrite: false,
      unique_filename: false,
      use_filename: false,
      transformation: [
        {
          width: 1600,
          height: 1600,
          crop: "limit",
          quality: "auto:good",
          flags: "progressive",
        },
      ],
    });

    report.push({
      status: "uploaded",
      localPath: image.relativePath,
      publicId: uploadResult.public_id,
      imageSrc: getDeliveryUrl(uploadResult.public_id),
      bytes: uploadResult.bytes,
      width: uploadResult.width,
      height: uploadResult.height,
    });
  }

  const reportPath = path.join(
    options.outDir,
    `gallery-upload-${options.execute ? "execute" : "dry-run"}-${timestamp()}.json`
  );
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    execute: options.execute,
    targetFolder: options.targetFolder,
    localDirs: options.localDirs,
    stats: {
      localImages: localImages.length,
      existing: report.filter((item) => item.status === "exists").length,
      wouldUpload: report.filter((item) => item.status === "would_upload").length,
      uploaded: report.filter((item) => item.status === "uploaded").length,
    },
    items: report,
  });

  console.log(`${options.execute ? "Upload" : "Upload dry-run"} report written: ${reportPath}`);
  console.log(`Existing: ${report.filter((item) => item.status === "exists").length}`);
  console.log(`Would upload: ${report.filter((item) => item.status === "would_upload").length}`);
  console.log(`Uploaded: ${report.filter((item) => item.status === "uploaded").length}`);
};

const resolveReplacement = (item: MappingItem): { imageSrc: string; imagePublicId: string } => {
  if (!item.newCloudinaryPublicId) {
    throw new Error(`Missing newCloudinaryPublicId for mapping item at order ${item.order}`);
  }

  return {
    imagePublicId: item.newCloudinaryPublicId,
    imageSrc: item.newImageSrc || getDeliveryUrl(item.newCloudinaryPublicId),
  };
};

const runApply = async (options: CliOptions) => {
  configureCloudinary();
  await connectMongo();

  try {
    const mapping = await readJson<MappingFile>(options.mappingPath);
    const items = mapping.items || [];
    const operations = items.filter((item) => item.action !== "keep");

    if (!options.execute) {
      console.log(`Dry-run only. Mapping items: ${items.length}`);
      console.log(`Replace: ${items.filter((item) => item.action === "replace").length}`);
      console.log(`Remove: ${items.filter((item) => item.action === "remove").length}`);
      console.log(`Add: ${items.filter((item) => item.action === "add").length}`);
      console.log("Run again with --execute to write MongoDB.");
      return;
    }

    const backupPath = await createBackup(options.outDir);
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      for (const item of items) {
        if (item.action === "keep") {
          if (item.galleryId) {
            await Gallery.findByIdAndUpdate(
              item.galleryId,
              { order: item.order },
              { session, runValidators: true }
            );
          }
          continue;
        }

        if (item.action === "replace") {
          if (!item.galleryId) {
            throw new Error(`Missing galleryId for replace item at order ${item.order}`);
          }

          const replacement = resolveReplacement(item);
          await Gallery.findByIdAndUpdate(
            item.galleryId,
            {
              imageSrc: replacement.imageSrc,
              imagePublicId: replacement.imagePublicId,
              order: item.order,
            },
            { session, runValidators: true }
          );
          continue;
        }

        if (item.action === "remove") {
          if (!item.galleryId) {
            throw new Error(`Missing galleryId for remove item at order ${item.order}`);
          }

          await Gallery.findByIdAndDelete(item.galleryId, { session });
          continue;
        }

        if (item.action === "add") {
          const replacement = resolveReplacement(item);
          await Gallery.create(
            [
              {
                imageSrc: replacement.imageSrc,
                imagePublicId: replacement.imagePublicId,
                order: item.order,
              },
            ],
            { session }
          );
        }
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    console.log(`MongoDB updated from mapping: ${options.mappingPath}`);
    console.log(`Backup written before changes: ${backupPath}`);
    console.log(`Changed operations: ${operations.length}`);
    console.log("Old Cloudinary assets were not deleted.");
  } finally {
    await mongoose.disconnect();
  }
};

const runRollback = async (options: CliOptions) => {
  if (!options.backupPath) {
    throw new Error("Rollback requires --backup path/to/gallery-backup.json");
  }

  await connectMongo();

  try {
    const backup = await readJson<BackupFile>(options.backupPath);

    if (!options.execute) {
      console.log(`Dry-run only. Backup docs: ${backup.docs.length}`);
      console.log("Run again with --execute to restore the gallery collection.");
      return;
    }

    const docs = backup.docs.map((doc) => ({
      _id: new mongoose.Types.ObjectId(doc._id),
      imageSrc: doc.imageSrc,
      imagePublicId: doc.imagePublicId,
      order: doc.order,
      createdAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
    }));

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB connection is not ready");
    }

    const collection = db.collection("galleries");
    await collection.deleteMany({});
    if (docs.length > 0) {
      await collection.insertMany(docs);
    }

    console.log(`Gallery collection restored from backup: ${options.backupPath}`);
    console.log(`Restored documents: ${docs.length}`);
  } finally {
    await mongoose.disconnect();
  }
};

const main = async () => {
  const options = parseCliOptions();

  if (options.mode === "audit") {
    await runAudit(options);
  } else if (options.mode === "upload") {
    await runUpload(options);
  } else if (options.mode === "apply") {
    await runApply(options);
  } else if (options.mode === "rollback") {
    await runRollback(options);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
