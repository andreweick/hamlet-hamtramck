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
    "exif_data": {...},
    "iptc_data": {...},
    "c2pa_manifest": {...},
    "c2pa_verified": true,
    "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/public",
    "variants": ["public", "thumbnail", "medium", "large"],
    "updated_at": "2025-10-24T12:00:00Z"
  }
}
```

**Error Responses:**
- `404 Not Found` - Image does not exist

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
