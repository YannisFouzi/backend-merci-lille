import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

type Mode = "upload" | "manifest";

type CliOptions = {
  mode: Mode;
  execute: boolean;
  localDir: string;
  targetFolder: string;
  manifestPath: string;
  outDir: string;
};

type CloudinaryResource = {
  public_id: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  secure_url?: string;
};

const DEFAULT_LOCAL_DIR = path.resolve(
  process.cwd(),
  "../frontend-merci-lille/src/media/photo-wall"
);
const DEFAULT_MANIFEST_PATH = path.resolve(
  process.cwd(),
  "../frontend-merci-lille/src/data/photoWallImages.ts"
);
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), "tmp/photo-wall-cloudinary");

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {
    mode: "manifest",
    execute: false,
    localDir: DEFAULT_LOCAL_DIR,
    targetFolder: "mercilille-photo-wall",
    manifestPath: DEFAULT_MANIFEST_PATH,
    outDir: DEFAULT_OUT_DIR,
  };

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--execute") {
      options.execute = true;
      continue;
    }

    if (!next || next.startsWith("--")) {
      continue;
    }

    if (arg === "--mode") {
      options.mode = next as Mode;
      index++;
    } else if (arg === "--local-dir") {
      options.localDir = path.resolve(process.cwd(), next);
      index++;
    } else if (arg === "--target-folder") {
      options.targetFolder = trimFolder(next);
      index++;
    } else if (arg === "--manifest") {
      options.manifestPath = path.resolve(process.cwd(), next);
      index++;
    } else if (arg === "--out-dir") {
      options.outDir = path.resolve(process.cwd(), next);
      index++;
    }
  }

  if (!["upload", "manifest"].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
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

const configureCloudinary = () => {
  ensureEnv(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]);

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};

const stripExtension = (fileName: string): string => fileName.replace(/\.[^.]+$/, "");

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const readLocalImages = async (localDir: string): Promise<string[]> => {
  const entries = await fs.readdir(localDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(jpe?g|png|webp|avif)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const listCloudinaryResources = async (prefix: string): Promise<CloudinaryResource[]> => {
  const resources: CloudinaryResource[] = [];
  let nextCursor: string | undefined;

  do {
    const response = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix,
      max_results: 500,
      next_cursor: nextCursor,
    } as Record<string, unknown>);

    resources.push(...((response.resources || []) as CloudinaryResource[]));
    nextCursor = typeof response.next_cursor === "string" ? response.next_cursor : undefined;
  } while (nextCursor);

  return resources.sort((a, b) => a.public_id.localeCompare(b.public_id));
};

const getDeliveryUrl = (publicId: string): string =>
  `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto:good,c_limit,w_360/${publicId}`;

const getCategory = (fileName: string): string => {
  if (fileName.includes("photo-wall-final-")) {
    return "final";
  }

  if (fileName.includes("photo-wall-heliu-")) {
    return "heliu";
  }

  if (fileName.includes("photo-wall-mathis-")) {
    return "mathis";
  }

  if (fileName.includes("photo-wall-slalom-")) {
    return "slalom";
  }

  return "merci-lille";
};

const runUpload = async (options: CliOptions) => {
  const files = await readLocalImages(options.localDir);
  const existing = await listCloudinaryResources(options.targetFolder);
  const existingPublicIds = new Set(existing.map((resource) => resource.public_id));
  const uploaded = [];
  const skipped = [];
  const wouldUpload = [];

  for (const fileName of files) {
    const publicId = `${options.targetFolder}/${stripExtension(fileName)}`;

    if (existingPublicIds.has(publicId)) {
      skipped.push({ fileName, publicId, status: "exists" });
      continue;
    }

    if (!options.execute) {
      wouldUpload.push({ fileName, publicId, status: "would_upload" });
      continue;
    }

    const uploadResult = await cloudinary.uploader.upload(path.join(options.localDir, fileName), {
      folder: options.targetFolder,
      public_id: stripExtension(fileName),
      resource_type: "image",
      overwrite: false,
      unique_filename: false,
      use_filename: false,
    });

    uploaded.push({
      fileName,
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      width: uploadResult.width,
      height: uploadResult.height,
      bytes: uploadResult.bytes,
      format: uploadResult.format,
    });

    if ((uploaded.length + skipped.length) % 25 === 0) {
      console.log(`${uploaded.length + skipped.length}/${files.length}`);
    }
  }

  await ensureDir(options.outDir);
  const reportPath = path.join(
    options.outDir,
    `photo-wall-upload-${options.execute ? "execute" : "dry-run"}-${timestamp()}.json`
  );
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        execute: options.execute,
        localDir: options.localDir,
        targetFolder: options.targetFolder,
        total: files.length,
        uploaded: uploaded.length,
        skipped: skipped.length,
        wouldUpload: wouldUpload.length,
        uploadedItems: uploaded,
        skippedItems: skipped,
        wouldUploadItems: wouldUpload,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`report ${reportPath}`);
  console.log(`uploaded ${uploaded.length}`);
  console.log(`skipped ${skipped.length}`);
  console.log(`would upload ${wouldUpload.length}`);
};

const runManifest = async (options: CliOptions) => {
  const resources = await listCloudinaryResources(options.targetFolder);
  const items = resources.map((resource) => {
    const baseName = resource.public_id.split("/").pop() || resource.public_id;
    const fileName = `${baseName}.${resource.format || "jpg"}`;

    return {
      fileName,
      publicId: resource.public_id,
      category: getCategory(fileName),
      width: resource.width || 0,
      height: resource.height || 0,
      src: getDeliveryUrl(resource.public_id),
    };
  });

  await ensureDir(path.dirname(options.manifestPath));
  const content = `export type PhotoWallImage = {\n  fileName: string;\n  publicId: string;\n  category: string;\n  width: number;\n  height: number;\n  src: string;\n};\n\nexport const photoWallImages = ${JSON.stringify(
    items,
    null,
    2
  )} satisfies PhotoWallImage[];\n`;

  await fs.writeFile(options.manifestPath, content, "utf8");

  console.log(`manifest ${options.manifestPath}`);
  console.log(`items ${items.length}`);
};

const main = async () => {
  const options = parseCliOptions();
  configureCloudinary();

  if (options.mode === "upload") {
    await runUpload(options);
  } else {
    await runManifest(options);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
