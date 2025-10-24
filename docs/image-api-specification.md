# Image API Specification

## Overview

This document specifies the design and implementation of an image management API that provides CRUD operations for images, stores metadata in a Cloudflare D1 database, and leverages Cloudflare Images for storage.

### Key Features

- RESTful API endpoints for image CRUD operations
- Comprehensive metadata extraction (EXIF, IPTC, C2PA)
- Content authenticity verification via C2PA (Content Authenticity Initiative)
- Integration with Cloudflare Images for storage
- D1 database for structured metadata storage

---

## Database Schema (D1)

### Images Table

```sql
CREATE TABLE images (
  -- Primary identification
  id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  cloudflare_image_id TEXT NOT NULL UNIQUE,

  -- Basic metadata
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,

  -- Upload information
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by TEXT,

  -- EXIF metadata (JSON blob)
  exif_data TEXT, -- JSON string containing all EXIF data

  -- IPTC metadata (JSON blob)
  iptc_data TEXT, -- JSON string containing all IPTC data

  -- C2PA Content Authenticity
  c2pa_manifest TEXT, -- JSON string containing C2PA manifest
  c2pa_verified BOOLEAN DEFAULT FALSE,
  c2pa_signature_valid BOOLEAN,
  c2pa_issuer TEXT,

  -- Cloudflare Images URLs
  cloudflare_url_base TEXT,
  cloudflare_url_public TEXT,

  -- Image variants (JSON array of available variants)
  variants TEXT, -- JSON array of variant names/sizes

  -- Additional metadata
  description TEXT,
  tags TEXT, -- JSON array of tags

  -- Status and flags
  status TEXT DEFAULT 'active', -- active, archived, deleted
  is_public BOOLEAN DEFAULT FALSE,

  -- Timestamps
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_images_cloudflare_id ON images(cloudflare_image_id);
CREATE INDEX idx_images_uploaded_at ON images(uploaded_at);
CREATE INDEX idx_images_status ON images(status);
CREATE INDEX idx_images_uploaded_by ON images(uploaded_by);
CREATE INDEX idx_images_c2pa_verified ON images(c2pa_verified);
```

---

## Drizzle ORM Schema

### Overview

This project uses [Drizzle ORM](https://orm.drizzle.team/) for type-safe database operations with Cloudflare D1. Drizzle provides compile-time type checking, excellent TypeScript integration, and a lightweight runtime.

### Images Table Definition

**Location:** `packages/db/schema.ts`

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const images = sqliteTable("images", {
  // Primary identification
  id: text("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  cloudflareImageId: text("cloudflare_image_id").notNull().unique(),

  // Basic metadata
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  width: integer("width"),
  height: integer("height"),

  // Upload information
  uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" }).notNull(),
  uploadedBy: text("uploaded_by"),

  // EXIF metadata (JSON blob)
  exifData: text("exif_data"),  // JSON string containing all EXIF data

  // IPTC metadata (JSON blob)
  iptcData: text("iptc_data"),  // JSON string containing all IPTC data

  // C2PA Content Authenticity
  c2paManifest: text("c2pa_manifest"),  // JSON string containing C2PA manifest
  c2paVerified: integer("c2pa_verified", { mode: "boolean" }).default(false),
  c2paSignatureValid: integer("c2pa_signature_valid", { mode: "boolean" }),
  c2paIssuer: text("c2pa_issuer"),

  // Cloudflare Images URLs
  cloudflareUrlBase: text("cloudflare_url_base"),
  cloudflareUrlPublic: text("cloudflare_url_public"),

  // Image variants (JSON array of available variants)
  variants: text("variants"),  // JSON array of variant names/sizes

  // Additional metadata
  description: text("description"),
  tags: text("tags"),  // JSON array of tags

  // Status and flags
  status: text("status").default("active"),  // active, archived, deleted
  isPublic: integer("is_public", { mode: "boolean" }).default(false),

  // Timestamps
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" })
});

// Type inference for TypeScript
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
```

### Schema Field Mappings

| TypeScript Field      | Database Column          | Type      | Purpose                                    |
|-----------------------|--------------------------|-----------|-------------------------------------------|
| `id`                  | `id`                     | text      | Unique image identifier (primary key)     |
| `originalFilename`    | `original_filename`      | text      | Original uploaded filename                |
| `cloudflareImageId`   | `cloudflare_image_id`    | text      | Cloudflare Images unique ID (unique)      |
| `mimeType`            | `mime_type`              | text      | Image MIME type (e.g., image/jpeg)        |
| `fileSize`            | `file_size`              | integer   | File size in bytes                        |
| `width`               | `width`                  | integer   | Image width in pixels                     |
| `height`              | `height`                 | integer   | Image height in pixels                    |
| `uploadedAt`          | `uploaded_at`            | timestamp | Upload timestamp (milliseconds)           |
| `uploadedBy`          | `uploaded_by`            | text      | User ID who uploaded                      |
| `exifData`            | `exif_data`              | text      | JSON-encoded EXIF metadata                |
| `iptcData`            | `iptc_data`              | text      | JSON-encoded IPTC metadata                |
| `c2paManifest`        | `c2pa_manifest`          | text      | JSON-encoded C2PA manifest                |
| `c2paVerified`        | `c2pa_verified`          | boolean   | Whether C2PA verification passed          |
| `c2paSignatureValid`  | `c2pa_signature_valid`   | boolean   | Whether C2PA signature is valid           |
| `c2paIssuer`          | `c2pa_issuer`            | text      | C2PA certificate issuer                   |
| `cloudflareUrlBase`   | `cloudflare_url_base`    | text      | Base URL for Cloudflare delivery          |
| `cloudflareUrlPublic` | `cloudflare_url_public`  | text      | Public variant URL                        |
| `variants`            | `variants`               | text      | JSON array of available variant names     |
| `description`         | `description`            | text      | User-provided description                 |
| `tags`                | `tags`                   | text      | JSON array of tags                        |
| `status`              | `status`                 | text      | Record status (active/archived/deleted)   |
| `isPublic`            | `is_public`              | boolean   | Whether image is publicly accessible      |
| `updatedAt`           | `updated_at`             | timestamp | Last update timestamp (milliseconds)      |
| `deletedAt`           | `deleted_at`             | timestamp | Soft delete timestamp (milliseconds)      |

### Type Safety Features

**Type Inference:**
```typescript
// Selecting (reading) from database - includes all fields
type Image = {
  id: string;
  originalFilename: string;
  cloudflareImageId: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  uploadedAt: Date;
  uploadedBy: string | null;
  exifData: string | null;
  iptcData: string | null;
  c2paManifest: string | null;
  c2paVerified: boolean;
  c2paSignatureValid: boolean | null;
  c2paIssuer: string | null;
  cloudflareUrlBase: string | null;
  cloudflareUrlPublic: string | null;
  variants: string | null;
  description: string | null;
  tags: string | null;
  status: string;
  isPublic: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
};

// Inserting (creating) records - omits auto-generated/optional fields
type NewImage = {
  id: string;
  originalFilename: string;
  cloudflareImageId: string;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  uploadedAt: Date;
  uploadedBy?: string | null;
  exifData?: string | null;
  iptcData?: string | null;
  c2paManifest?: string | null;
  c2paVerified?: boolean;
  c2paSignatureValid?: boolean | null;
  c2paIssuer?: string | null;
  cloudflareUrlBase?: string | null;
  cloudflareUrlPublic?: string | null;
  variants?: string | null;
  description?: string | null;
  tags?: string | null;
  status?: string;
  isPublic?: boolean;
  updatedAt: Date;
  deletedAt?: Date | null;
};
```

### JSON Field Handling

Several fields store JSON data as text and require parsing/serialization:

**EXIF Data Structure:**
```typescript
interface ExifData {
  Make?: string;
  Model?: string;
  DateTime?: string;
  DateTimeOriginal?: string;
  DateTimeDigitized?: string;
  FocalLength?: string;
  FNumber?: number;
  ISO?: number;
  ShutterSpeed?: string;
  WhiteBalance?: string;
  Flash?: string;
  Lens?: string;
  GPS?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  Width?: number;
  Height?: number;
  Resolution?: number;
  ColorSpace?: string;
  Orientation?: number;
}
```

**IPTC Data Structure:**
```typescript
interface IptcData {
  caption?: string;
  headline?: string;
  keywords?: string[];
  category?: string;
  creator?: string;
  creatorContactInfo?: {
    city?: string;
    country?: string;
    address?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  copyright?: string;
  usageTerms?: string;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  sublocation?: string;
  copyrightStatus?: string;
  rightsUsageTerms?: string;
  webStatement?: string;
}
```

**C2PA Manifest Structure:**
```typescript
interface C2paManifest {
  claim_generator: string;
  claim_generator_info?: any[];
  signature_valid: boolean;
  issuer: string;
  assertions: Array<{
    label: string;
    data: any;
  }>;
  ingredients: Array<{
    title: string;
    format: string;
    relationship: string;
  }>;
  signature_info: {
    alg: string;
    time: string;
    issuer: string;
  };
}
```

**Variants Array:**
```typescript
type Variants = string[]; // e.g., ["public", "thumbnail", "medium", "large"]
```

**Tags Array:**
```typescript
type Tags = string[]; // e.g., ["nature", "landscape", "sunset"]
```

### Helper Functions for JSON Fields

```typescript
// Serialize/deserialize EXIF data
function serializeExif(exif: ExifData): string {
  return JSON.stringify(exif);
}

function deserializeExif(exifString: string | null): ExifData | null {
  if (!exifString) return null;
  try {
    return JSON.parse(exifString);
  } catch {
    return null;
  }
}

// Serialize/deserialize IPTC data
function serializeIptc(iptc: IptcData): string {
  return JSON.stringify(iptc);
}

function deserializeIptc(iptcString: string | null): IptcData | null {
  if (!iptcString) return null;
  try {
    return JSON.parse(iptcString);
  } catch {
    return null;
  }
}

// Serialize/deserialize C2PA manifest
function serializeC2pa(manifest: C2paManifest): string {
  return JSON.stringify(manifest);
}

function deserializeC2pa(manifestString: string | null): C2paManifest | null {
  if (!manifestString) return null;
  try {
    return JSON.parse(manifestString);
  } catch {
    return null;
  }
}

// Serialize/deserialize variants
function serializeVariants(variants: string[]): string {
  return JSON.stringify(variants);
}

function deserializeVariants(variantsString: string | null): string[] {
  if (!variantsString) return [];
  try {
    return JSON.parse(variantsString);
  } catch {
    return [];
  }
}

// Serialize/deserialize tags
function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

function deserializeTags(tagsString: string | null): string[] {
  if (!tagsString) return [];
  try {
    return JSON.parse(tagsString);
  } catch {
    return [];
  }
}
```

### Drizzle Usage Examples

**Querying a single image:**
```typescript
import { db } from './db/client';
import { images } from './db/schema';
import { eq } from 'drizzle-orm';

const image = await db
  .select()
  .from(images)
  .where(eq(images.id, 'img_abc123'))
  .get();

// Parse JSON fields
const exif = deserializeExif(image.exifData);
const iptc = deserializeIptc(image.iptcData);
const c2pa = deserializeC2pa(image.c2paManifest);
```

**Inserting a new image:**
```typescript
const newImage: NewImage = {
  id: generateId(),
  originalFilename: 'photo.jpg',
  cloudflareImageId: 'cf_xyz789',
  mimeType: 'image/jpeg',
  fileSize: 2048576,
  width: 4032,
  height: 3024,
  uploadedAt: new Date(),
  uploadedBy: 'user123',
  exifData: serializeExif(extractedExif),
  iptcData: serializeIptc(extractedIptc),
  c2paManifest: serializeC2pa(extractedC2pa),
  c2paVerified: true,
  c2paSignatureValid: true,
  c2paIssuer: 'Adobe Content Credentials',
  cloudflareUrlPublic: 'https://...',
  variants: serializeVariants(['public', 'thumbnail']),
  status: 'active',
  isPublic: false,
  updatedAt: new Date()
};

await db.insert(images).values(newImage);
```

**Filtering and pagination:**
```typescript
import { and, eq, gte, lte, desc } from 'drizzle-orm';

const results = await db
  .select()
  .from(images)
  .where(
    and(
      eq(images.status, 'active'),
      eq(images.uploadedBy, 'user123'),
      gte(images.uploadedAt, startDate),
      lte(images.uploadedAt, endDate)
    )
  )
  .orderBy(desc(images.uploadedAt))
  .limit(20)
  .offset(0);
```

**Updating image metadata:**
```typescript
await db
  .update(images)
  .set({
    description: 'Updated description',
    tags: serializeTags(['new', 'tags']),
    updatedAt: new Date()
  })
  .where(eq(images.id, 'img_abc123'));
```

**Soft delete:**
```typescript
await db
  .update(images)
  .set({
    status: 'deleted',
    deletedAt: new Date(),
    updatedAt: new Date()
  })
  .where(eq(images.id, 'img_abc123'));
```

**Hard delete:**
```typescript
await db
  .delete(images)
  .where(eq(images.id, 'img_abc123'));
```

### Benefits of Drizzle ORM

1. **Type Safety:** Full TypeScript support with compile-time type checking
2. **Lightweight:** Minimal runtime overhead compared to heavier ORMs
3. **SQL-like Syntax:** Familiar query builder that resembles SQL
4. **Edge-Ready:** Optimized for Cloudflare Workers and edge runtimes
5. **Migration Support:** Built-in schema migration tools
6. **Flexibility:** Can drop down to raw SQL when needed
7. **Auto-completion:** IDE support for schema fields and queries

---

## API Endpoints

### Base URL
```
/api/v1/images
```

### 1. Create (Upload) Image

**Endpoint:** `POST /api/v1/images`

**Description:** Upload a new image, extract metadata, and store in Cloudflare Images

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  ```
  image: File (required)
  description: String (optional)
  tags: Array<String> (optional)
  is_public: Boolean (optional, default: false)
  uploaded_by: String (optional)
  ```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "original_filename": "photo.jpg",
    "cloudflare_image_id": "cf_xyz789",
    "mime_type": "image/jpeg",
    "file_size": 2048576,
    "width": 4032,
    "height": 3024,
    "uploaded_at": "2025-10-24T12:00:00Z",
    "exif_data": {
      "Make": "Canon",
      "Model": "EOS R5",
      "DateTime": "2025:10:20 14:30:00",
      "FocalLength": "50mm",
      "FNumber": 2.8,
      "ISO": 100,
      "GPS": {
        "latitude": 42.3923,
        "longitude": -83.0495
      }
    },
    "iptc_data": {
      "caption": "Sample photo",
      "creator": "John Doe",
      "copyright": "© 2025 John Doe",
      "keywords": ["nature", "landscape"]
    },
    "c2pa_manifest": {
      "claim_generator": "Adobe Photoshop 24.0",
      "signature_valid": true,
      "issuer": "Adobe Content Credentials",
      "assertions": [...],
      "ingredients": [...]
    },
    "c2pa_verified": true,
    "c2pa_signature_valid": true,
    "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/public",
    "variants": ["public", "thumbnail", "medium", "large"]
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid file type or missing required fields
- `413 Payload Too Large` - File exceeds maximum size
- `500 Internal Server Error` - Upload or processing failed

---

### 2. Read (Get) Image

**Endpoint:** `GET /api/v1/images/:id`

**Description:** Retrieve metadata for a specific image

**Parameters:**
- `id` (path): Image ID

**Query Parameters:**
- `include_metadata` (boolean): Include full EXIF/IPTC/C2PA data (default: true)

**Implementation Details:**

This endpoint uses Drizzle ORM to query the images table and transform the data for API consumption:

```typescript
import { db } from '@/db/client';
import { images } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function getImageById(id: string, includeMetadata = true) {
  // Query the database using Drizzle
  const image = await db
    .select()
    .from(images)
    .where(eq(images.id, id))
    .get();

  if (!image) {
    throw new NotFoundError('Image not found');
  }

  // Parse JSON fields from the database
  const exifData = deserializeExif(image.exifData);
  const iptcData = deserializeIptc(image.iptcData);
  const c2paManifest = deserializeC2pa(image.c2paManifest);
  const variants = deserializeVariants(image.variants);
  const tags = deserializeTags(image.tags);

  // Transform database record to API response format
  const response = {
    id: image.id,
    original_filename: image.originalFilename,
    cloudflare_image_id: image.cloudflareImageId,
    mime_type: image.mimeType,
    file_size: image.fileSize,
    width: image.width,
    height: image.height,
    uploaded_at: image.uploadedAt.toISOString(),
    uploaded_by: image.uploadedBy,
    description: image.description,
    tags: tags,
    status: image.status,
    is_public: image.isPublic,
    cloudflare_url_public: image.cloudflareUrlPublic,
    variants: variants,
    updated_at: image.updatedAt.toISOString(),
  };

  // Conditionally include metadata based on query parameter
  if (includeMetadata) {
    return {
      ...response,
      exif_data: exifData,
      iptc_data: iptcData,
      c2pa_manifest: c2paManifest,
      c2pa_verified: image.c2paVerified,
      c2pa_signature_valid: image.c2paSignatureValid,
      c2pa_issuer: image.c2paIssuer,
    };
  }

  return response;
}
```

**Data Transformation Flow:**

1. **Query Database:** Use Drizzle to select the image record by ID
2. **Deserialize JSON Fields:** Parse stored JSON strings into typed objects
   - `exifData` → `ExifData` object
   - `iptcData` → `IptcData` object
   - `c2paManifest` → `C2paManifest` object
   - `variants` → string array
   - `tags` → string array
3. **Transform Field Names:** Convert camelCase (TypeScript) to snake_case (API)
4. **Format Timestamps:** Convert Date objects to ISO 8601 strings
5. **Conditional Metadata:** Include/exclude full metadata based on query parameter

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "original_filename": "photo.jpg",
    "cloudflare_image_id": "cf_xyz789",
    "mime_type": "image/jpeg",
    "file_size": 2048576,
    "width": 4032,
    "height": 3024,
    "uploaded_at": "2025-10-24T12:00:00Z",
    "uploaded_by": "user123",
    "description": "Sample description",
    "tags": ["nature", "landscape"],
    "status": "active",
    "is_public": false,
    "exif_data": {
      "Make": "Canon",
      "Model": "EOS R5",
      "DateTime": "2025:10:20 14:30:00",
      "FocalLength": "50mm",
      "FNumber": 2.8,
      "ISO": 100,
      "GPS": {
        "latitude": 42.3923,
        "longitude": -83.0495
      }
    },
    "iptc_data": {
      "caption": "Beautiful sunset over the lake",
      "creator": "John Doe",
      "copyright": "© 2025 John Doe",
      "keywords": ["nature", "landscape", "sunset"]
    },
    "c2pa_manifest": {
      "claim_generator": "Adobe Photoshop 24.0",
      "signature_valid": true,
      "issuer": "Adobe Content Credentials",
      "assertions": [
        {
          "label": "c2pa.actions",
          "data": {
            "actions": [
              {
                "action": "c2pa.edited",
                "when": "2025-10-20T14:30:00Z",
                "softwareAgent": "Adobe Photoshop 24.0"
              }
            ]
          }
        }
      ],
      "ingredients": [
        {
          "title": "original_photo.jpg",
          "format": "image/jpeg",
          "relationship": "parentOf"
        }
      ]
    },
    "c2pa_verified": true,
    "c2pa_signature_valid": true,
    "c2pa_issuer": "Adobe Content Credentials",
    "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/public",
    "variants": ["public", "thumbnail", "medium", "large"],
    "updated_at": "2025-10-24T12:00:00Z"
  }
}
```

**Response with `include_metadata=false`:**
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "original_filename": "photo.jpg",
    "cloudflare_image_id": "cf_xyz789",
    "mime_type": "image/jpeg",
    "file_size": 2048576,
    "width": 4032,
    "height": 3024,
    "uploaded_at": "2025-10-24T12:00:00Z",
    "uploaded_by": "user123",
    "description": "Sample description",
    "tags": ["nature", "landscape"],
    "status": "active",
    "is_public": false,
    "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/public",
    "variants": ["public", "thumbnail", "medium", "large"],
    "updated_at": "2025-10-24T12:00:00Z"
  }
}
```

**Exposed Metadata Fields:**

From the Drizzle schema, the following metadata is exposed through this endpoint:

| Field                  | Source               | Description                                    |
|------------------------|----------------------|------------------------------------------------|
| `exif_data`            | `images.exifData`    | Complete EXIF metadata from image file         |
| `iptc_data`            | `images.iptcData`    | Complete IPTC metadata (copyright, creator)    |
| `c2pa_manifest`        | `images.c2paManifest`| Full C2PA content authenticity manifest        |
| `c2pa_verified`        | `images.c2paVerified`| Boolean indicating C2PA verification status    |
| `c2pa_signature_valid` | `images.c2paSignatureValid` | Boolean for signature validity       |
| `c2pa_issuer`          | `images.c2paIssuer`  | Certificate issuer name                        |

**Performance Considerations:**

- The `include_metadata` parameter allows clients to skip large JSON payloads when only basic info is needed
- Metadata parsing only occurs when requested
- Single database query using Drizzle's optimized SQLite adapter
- JSON deserialization is done lazily

**Error Responses:**
- `404 Not Found` - Image does not exist or has been deleted

---

### 3. List Images

**Endpoint:** `GET /api/v1/images`

**Description:** List images with filtering and pagination

**Query Parameters:**
- `page` (integer): Page number (default: 1)
- `limit` (integer): Results per page (default: 20, max: 100)
- `status` (string): Filter by status (active, archived, deleted)
- `uploaded_by` (string): Filter by uploader
- `c2pa_verified` (boolean): Filter by C2PA verification status
- `from_date` (ISO 8601): Filter images uploaded after this date
- `to_date` (ISO 8601): Filter images uploaded before this date
- `search` (string): Search in filename, description, tags
- `sort` (string): Sort field (uploaded_at, file_size, original_filename)
- `order` (string): Sort order (asc, desc)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "images": [
      {
        "id": "img_abc123def456",
        "original_filename": "photo.jpg",
        "cloudflare_image_id": "cf_xyz789",
        "mime_type": "image/jpeg",
        "file_size": 2048576,
        "width": 4032,
        "height": 3024,
        "uploaded_at": "2025-10-24T12:00:00Z",
        "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/thumbnail",
        "c2pa_verified": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total_pages": 5,
      "total_count": 98
    }
  }
}
```

---

### 4. Update Image

**Endpoint:** `PATCH /api/v1/images/:id`

**Description:** Update image metadata (not the image file itself)

**Parameters:**
- `id` (path): Image ID

**Request Body:**
```json
{
  "description": "Updated description",
  "tags": ["new", "tags"],
  "is_public": true,
  "status": "active"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "updated_at": "2025-10-24T13:00:00Z",
    ...
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid update fields
- `404 Not Found` - Image does not exist

---

### 5. Delete Image

**Endpoint:** `DELETE /api/v1/images/:id`

**Description:** Delete an image (soft delete by default)

**Parameters:**
- `id` (path): Image ID

**Query Parameters:**
- `hard_delete` (boolean): Permanently delete from Cloudflare Images (default: false)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Image deleted successfully",
  "data": {
    "id": "img_abc123def456",
    "deleted_at": "2025-10-24T14:00:00Z"
  }
}
```

**Error Responses:**
- `404 Not Found` - Image does not exist
- `500 Internal Server Error` - Deletion failed

---

### 6. Get C2PA Manifest

**Endpoint:** `GET /api/v1/images/:id/c2pa`

**Description:** Get detailed C2PA content authenticity information

**Parameters:**
- `id` (path): Image ID

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "verified": true,
    "signature_valid": true,
    "issuer": "Adobe Content Credentials",
    "manifest": {
      "claim_generator": "Adobe Photoshop 24.0",
      "claim_generator_info": [...],
      "assertions": [
        {
          "label": "c2pa.actions",
          "data": {
            "actions": [
              {
                "action": "c2pa.edited",
                "when": "2025-10-20T14:30:00Z",
                "softwareAgent": "Adobe Photoshop 24.0"
              }
            ]
          }
        }
      ],
      "ingredients": [
        {
          "title": "original_photo.jpg",
          "format": "image/jpeg",
          "relationship": "parentOf"
        }
      ],
      "signature_info": {
        "alg": "ps256",
        "time": "2025-10-20T14:31:00Z",
        "issuer": "Adobe Content Credentials"
      }
    }
  }
}
```

---

### 7. Get Image Variants

**Endpoint:** `GET /api/v1/images/:id/variants`

**Description:** Get all available Cloudflare Images variants and URLs

**Parameters:**
- `id` (path): Image ID

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "cloudflare_image_id": "cf_xyz789",
    "variants": [
      {
        "name": "public",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/public"
      },
      {
        "name": "thumbnail",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/thumbnail"
      },
      {
        "name": "medium",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/medium"
      },
      {
        "name": "large",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/large"
      }
    ]
  }
}
```

---

## Metadata Extraction Specifications

### EXIF Data

Extract all available EXIF metadata including:

**Camera Information:**
- Make, Model
- Software version
- Lens information

**Photo Settings:**
- ISO, Aperture (FNumber), Shutter Speed
- Focal Length
- Flash settings
- White Balance

**Date/Time:**
- DateTimeOriginal
- DateTimeDigitized
- DateTime (last modified)

**GPS Location:**
- Latitude, Longitude
- Altitude
- GPS timestamp

**Image Properties:**
- Width, Height
- Resolution
- Color Space
- Orientation

### IPTC Data

Extract IPTC metadata including:

**Content Description:**
- Caption/Description
- Headline
- Keywords/Tags
- Category

**Creator Information:**
- Creator/Photographer name
- Creator's contact info
- Copyright notice
- Usage terms

**Location:**
- City, State, Country
- Location name
- Sublocation

**Rights:**
- Copyright status
- Rights usage terms
- Web statement

### C2PA (Content Authenticity Initiative)

Extract and verify C2PA manifests:

**Verification:**
- Signature validation
- Certificate chain verification
- Tamper detection

**Claim Information:**
- Claim generator (software used)
- Timestamp of claim
- Issuer information

**Assertions:**
- Actions performed (edited, cropped, filtered, etc.)
- AI-generated content indicators
- Training/mining restrictions
- Relationships to other content

**Ingredients:**
- Parent/source files
- Component images
- Asset relationships

**Signature Information:**
- Algorithm used
- Signing authority
- Certificate details
- Validation timestamp

---

## Cloudflare Images Integration

### Upload Flow

1. Receive image file via API
2. Extract metadata (EXIF, IPTC, C2PA) before upload
3. Upload to Cloudflare Images via direct upload API
4. Store returned Cloudflare Image ID
5. Store metadata in D1 database
6. Return complete image record to client

### Storage Details

**Store in D1:**
- `cloudflare_image_id`: Unique identifier from Cloudflare
- `original_filename`: Original file name for reference
- `cloudflare_url_base`: Base URL for accessing variants
- `variants`: Available image variants/sizes

**Cloudflare Images Configuration:**
- Configure variants (thumbnail, medium, large, etc.)
- Set up delivery URL structure
- Configure access controls for public/private images

### URL Structure

```
https://imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>/<VARIANT_NAME>
```

Example:
```
https://imagedelivery.net/abc123/cf_xyz789/thumbnail
https://imagedelivery.net/abc123/cf_xyz789/public
```

---

## Data Flow

### Upload Process

```
1. Client → API: POST /api/v1/images (multipart/form-data)
2. API → Metadata Extractor: Extract EXIF, IPTC, C2PA
3. API → Cloudflare Images: Upload image file
4. Cloudflare Images → API: Return image ID and URLs
5. API → D1 Database: Store metadata and references
6. API → Client: Return complete image record
```

### Retrieval Process

```
1. Client → API: GET /api/v1/images/:id
2. API → D1 Database: Query image metadata
3. D1 Database → API: Return image record
4. API → Client: Return image data with Cloudflare URLs
5. Client → Cloudflare Images: Direct image request (if needed)
```

### Delete Process

```
Soft Delete:
1. Client → API: DELETE /api/v1/images/:id
2. API → D1 Database: Update status to 'deleted', set deleted_at
3. API → Client: Confirm deletion

Hard Delete:
1. Client → API: DELETE /api/v1/images/:id?hard_delete=true
2. API → Cloudflare Images: Delete image
3. API → D1 Database: Remove record
4. API → Client: Confirm deletion
```

---

## Technical Requirements

### Libraries/Dependencies

**Metadata Extraction:**
- `exifr` - EXIF parsing
- `iptc-reader` or `exiftool` wrapper - IPTC parsing
- `c2pa-node` or Adobe C2PA SDK - C2PA manifest extraction and verification

**Image Processing:**
- `sharp` (optional) - Image validation and processing
- Cloudflare Images API client

**Database:**
- Cloudflare D1 client
- SQL migration tools

### Environment Variables

```
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_IMAGES_ACCOUNT_HASH=your_account_hash
D1_DATABASE_ID=your_database_id
```

### Supported Image Formats

- JPEG/JPG
- PNG
- GIF
- WebP
- TIFF
- HEIC/HEIF
- BMP

### File Size Limits

- Maximum upload size: 10MB (configurable)
- Recommended minimum: 1KB

### Security Considerations

1. **Authentication:** All endpoints require authentication
2. **Authorization:** User-based access control for image operations
3. **Input Validation:** Validate file types, sizes, and malicious content
4. **Rate Limiting:** Implement rate limits on upload endpoints
5. **CORS:** Configure appropriate CORS policies
6. **Signed URLs:** Generate signed URLs for private images

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context"
    }
  }
}
```

### Error Codes

- `INVALID_FILE_TYPE` - Unsupported image format
- `FILE_TOO_LARGE` - Exceeds maximum file size
- `METADATA_EXTRACTION_FAILED` - Could not extract metadata
- `C2PA_VERIFICATION_FAILED` - C2PA signature invalid
- `CLOUDFLARE_UPLOAD_FAILED` - Upload to Cloudflare failed
- `DATABASE_ERROR` - D1 database operation failed
- `IMAGE_NOT_FOUND` - Requested image does not exist
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions

---

## Future Enhancements

### Phase 2 Features

1. **Batch Operations:** Upload/delete multiple images
2. **Image Transformations:** On-the-fly resizing, cropping
3. **Advanced Search:** Full-text search on metadata
4. **AI Analysis:** Auto-tagging, content detection
5. **WebP/AVIF Conversion:** Automatic format optimization
6. **Duplicate Detection:** Perceptual hashing
7. **Image Collections:** Group related images
8. **Version History:** Track image modifications
9. **Analytics:** Track image views and downloads
10. **Webhooks:** Event notifications for image operations

### Monitoring & Analytics

- Track upload success/failure rates
- Monitor C2PA verification rates
- Track storage usage
- API performance metrics
- Popular image variants

---

## Implementation Checklist

- [ ] Set up Cloudflare D1 database
- [ ] Create images table and indexes
- [ ] Set up Cloudflare Images account
- [ ] Configure image variants
- [ ] Implement POST /api/v1/images endpoint
- [ ] Integrate EXIF extraction
- [ ] Integrate IPTC extraction
- [ ] Integrate C2PA verification
- [ ] Implement Cloudflare Images upload
- [ ] Implement GET /api/v1/images/:id endpoint
- [ ] Implement GET /api/v1/images list endpoint
- [ ] Implement PATCH /api/v1/images/:id endpoint
- [ ] Implement DELETE /api/v1/images/:id endpoint
- [ ] Implement C2PA manifest endpoint
- [ ] Implement variants endpoint
- [ ] Add authentication/authorization
- [ ] Add rate limiting
- [ ] Add error handling
- [ ] Write API documentation
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Performance testing
- [ ] Security audit

---

## References

- [Cloudflare Images Documentation](https://developers.cloudflare.com/images/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [C2PA Specification](https://c2pa.org/specifications/)
- [EXIF Standard](https://exif.org/)
- [IPTC Photo Metadata Standard](https://www.iptc.org/standards/photo-metadata/)
- [Adobe Content Credentials](https://contentcredentials.org/)

---

**Version:** 1.0
**Last Updated:** 2025-10-24
**Status:** Draft
