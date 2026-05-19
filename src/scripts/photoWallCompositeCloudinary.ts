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
  version?: number;
  width?: number;
  height?: number;
  bytes?: number;
  secure_url?: string;
};

type UploadReportItem = {
  fileName: string;
  publicId: string;
  status?: string;
  secureUrl?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  version?: number;
};

const DEFAULT_LOCAL_DIR = path.resolve(
  process.cwd(),
  "../frontend-merci-lille/tmp/photo-wall-composites"
);
const DEFAULT_MANIFEST_PATH = path.resolve(
  process.cwd(),
  "../frontend-merci-lille/src/data/photoWallComposites.ts"
);
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), "tmp/photo-wall-composite-cloudinary");

const trimFolder = (folder: string): string => folder.replace(/^\/+|\/+$/g, "");

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {
    mode: "manifest",
    execute: false,
    localDir: DEFAULT_LOCAL_DIR,
    targetFolder: "mercilille-photo-wall-composites",
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

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

const stripExtension = (fileName: string): string => fileName.replace(/\.[^.]+$/, "");

const readCompositeFiles = async (localDir: string): Promise<string[]> => {
  const entries = await fs.readdir(localDir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() && /^photo-wall-composite-(desktop|tablet|mobile)\.jpe?g$/i.test(entry.name)
    )
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
      max_results: 100,
      next_cursor: nextCursor,
    } as Record<string, unknown>);

    resources.push(...((response.resources || []) as CloudinaryResource[]));
    nextCursor = typeof response.next_cursor === "string" ? response.next_cursor : undefined;
  } while (nextCursor);

  return resources.sort((a, b) => a.public_id.localeCompare(b.public_id));
};

const getVariant = (publicIdOrFileName: string): "desktop" | "tablet" | "mobile" => {
  if (publicIdOrFileName.includes("mobile")) {
    return "mobile";
  }

  if (publicIdOrFileName.includes("tablet")) {
    return "tablet";
  }

  return "desktop";
};

const getDeliveryWidth = (variant: string, width: number): number => {
  if (variant === "mobile") {
    return Math.min(width || 980, 980);
  }

  if (variant === "tablet") {
    return Math.min(width || 1500, 1500);
  }

  return Math.min(width || 2200, 2200);
};

const getDeliveryUrl = (resource: CloudinaryResource): string => {
  const variant = getVariant(resource.public_id);
  const width = getDeliveryWidth(variant, resource.width || 0);
  const version = resource.version ? `/v${resource.version}` : "";

  return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/f_auto/q_auto:good/c_limit,w_${width}${version}/${resource.public_id}`;
};

const runUpload = async (options: CliOptions) => {
  const files = await readCompositeFiles(options.localDir);
  const existing = await listCloudinaryResources(options.targetFolder);
  const existingPublicIds = new Set(existing.map((resource) => resource.public_id));
  const uploaded: UploadReportItem[] = [];
  const skipped: UploadReportItem[] = [];
  const wouldUpload: UploadReportItem[] = [];

  for (const fileName of files) {
    const publicId = `${options.targetFolder}/${stripExtension(fileName)}`;

    if (!options.execute) {
      const status = existingPublicIds.has(publicId) ? "would_overwrite" : "would_upload";
      wouldUpload.push({ fileName, publicId, status });
      continue;
    }

    const uploadResult = await cloudinary.uploader.upload(path.join(options.localDir, fileName), {
      folder: options.targetFolder,
      public_id: stripExtension(fileName),
      resource_type: "image",
      overwrite: true,
      invalidate: true,
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
      version: uploadResult.version,
    });
  }

  await ensureDir(options.outDir);
  const reportPath = path.join(
    options.outDir,
    `photo-wall-composite-upload-${options.execute ? "execute" : "dry-run"}-${timestamp()}.json`
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
  const items = resources
    .filter((resource) => /photo-wall-composite-(desktop|tablet|mobile)$/.test(resource.public_id))
    .map((resource) => {
      const variant = getVariant(resource.public_id);

      return {
        variant,
        publicId: resource.public_id,
        width: resource.width || 0,
        height: resource.height || 0,
        bytes: resource.bytes || 0,
        src: getDeliveryUrl(resource),
      };
    })
    .sort((a, b) => {
      const order = ["mobile", "tablet", "desktop"];
      return order.indexOf(a.variant) - order.indexOf(b.variant);
    });

  await ensureDir(path.dirname(options.manifestPath));
  const content = `export type PhotoWallComposite = {\n  variant: "desktop" | "tablet" | "mobile";\n  publicId: string;\n  width: number;\n  height: number;\n  bytes: number;\n  src: string;\n};\n\nexport const photoWallComposites = ${JSON.stringify(
    items,
    null,
    2
  )} satisfies PhotoWallComposite[];\n`;

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
