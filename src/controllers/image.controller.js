import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Image } from '../models/image.model.js';
import { generateThumbnail, getImageDimensions } from '../utils/thumbnail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname,'../../uploads');
const THUMBNAILS_DIR = path.join(__dirname,'../../uploads/thumbnails');

/**
 * TODO: Upload image
 *
 * 1. Check if file uploaded (if !req.file, return 400 "No file uploaded")
 * 2. Get file info from req.file (filename, originalname, mimetype, size)
 * 3. Get image dimensions using getImageDimensions(filepath)
 * 4. Generate thumbnail using generateThumbnail(filename)
 * 5. Extract optional fields from req.body (description, tags)
 *    - Parse tags: split by comma and trim each tag
 * 6. Save metadata to database (Image.create)
 * 7. Return 201 with image metadata
 */
export async function uploadImage(req, res, next) {
  try {
    
    if(!req.file){
      return res.status(400).json({
        "error": {
          "message": "No file uploaded",
        }
      });
    }
    const file = req.file;
    const dimensions = await getImageDimensions(file.path);
    const thumbnail = await generateThumbnail(file.filename);
    const description = req.body.description;
    const tags = (req.body.tags)? (req.body.tags).split(',').map(el=>el.trim()):[];
    const image = new Image({
      originalName: file.originalname, 
      filename:file.filename,
      mimetype: file.mimetype,
      size: file.size,
      width:dimensions.width,
      height:dimensions.height,
      thumbnailFilename: thumbnail,
      description,
      tags,
    });
    await image.save();

    return res.status(201).json(
      image
    );
  
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: List images with pagination and filtering
 *
 * 1. Extract query parameters:
 *    - page (default 1)
 *    - limit (default 10, max 50)
 *    - search (search in originalName and description)
 *    - mimetype (filter by mimetype)
 *    - sortBy (field to sort by, default 'uploadDate')
 *    - sortOrder (asc or desc, default 'desc')
 *
 * 2. Build MongoDB query:
 *    - Add text search if search parameter provided
 *    - Add mimetype filter if provided
 *
 * 3. Calculate pagination:
 *    - skip = (page - 1) * limit
 *    - total = await Image.countDocuments(query)
 *    - pages = Math.ceil(total / limit)
 *
 * 4. Fetch images with sorting and pagination:
 *    - Image.find(query).sort({[sortBy]: sortOrder === 'asc' ? 1 : -1}).skip(skip).limit(limit)
 *
 * 5. Calculate totalSize (sum of all image sizes)
 *
 * 6. Return 200 with:
 *    - data: images array
 *    - meta: { total, page, limit, pages, totalSize }
 */
export async function listImages(req, res, next) {
  try {
    const {page:pg=1,limit:lim=10,search,mimetype,sortBy='uploadDate',sortOrder='desc'} = req.query;
    const page = Number(pg);
    const limit = Math.min(Number(lim), 50);
    const query = {};
    if(search){
      query.$text = {
        $search :search,
      };
    }
    if(mimetype){
      query.mimetype = mimetype;
    }

    const skip = (page - 1) * limit;
    const total = await Image.countDocuments(query);
    const pages = Math.ceil(total / limit);
    

    const images = await Image.find(query).sort({[sortBy]: sortOrder === 'asc' ? 1 : -1}).skip(skip).limit(limit);
    const totalSize = images.reduce((val,img)=>img.size+val,0);

    return res.status(200).json({
      data: images,
      meta: { total, page, limit, pages, totalSize }
    });

  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Get image metadata by ID
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Return 200 with image metadata
 */
export async function getImage(req, res, next) {
  try {
    const id = req.params.id;
    const image = await Image.findById(id);
    if(!image){
      return res.status(404).json({
        error: {
          message: "Image not found"
        }
      });
    }
    return res.status(200).json(image);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download original image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct file path
 * 4. Check if file exists using fs.existsSync()
 * 5. If file missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image.mimetype
 *    - Content-Disposition: attachment; filename="originalName"
 * 7. Send file using res.sendFile(filepath)
 */
export async function downloadImage(req, res, next) {
  try {
    const id = req.params.id;
    const image =await Image.findById(id);
    if(!image){
      return res.status(404).json({
        error: {
          message: "Image not found"
        }
      });
    }
    const filename = image.filename;
    const filepath = path.join(UPLOADS_DIR,filename);
    if(!fs.existsSync(filepath)){
      return res.status(404).json({
        error: {
          message: "File not found",
        }
      });
    }
    res.set({
    'Content-Type': image.mimetype,
    'Content-Disposition': `attachment; filename="${image.originalName}"`
    });
    return res.sendFile(filepath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download thumbnail
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct thumbnail path
 * 4. Check if thumbnail exists
 * 5. If missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image/jpeg (thumbnails are always JPEG)
 * 7. Send file using res.sendFile(thumbnailPath)
 */
export async function downloadThumbnail(req, res, next) {
  try {
    const id = req.params.id;
    const image =await Image.findById(id);
    if(!image){
      return res.status(404).json({
        error: {
          message: "Image not found"
        }
      });
    }
    const filename = image.thumbnailFilename;
    const filepath = path.join(THUMBNAILS_DIR,filename);
    if(!fs.existsSync(filepath)){
      return res.status(404).json({
        error: {
          message: "File not found",
        }
      });
    }
    res.set('Content-Type','image/jpeg');
    return res.sendFile(filepath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Delete image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Delete original file (use try-catch, ignore ENOENT errors)
 * 4. Delete thumbnail (use try-catch, ignore ENOENT errors)
 * 5. Delete metadata from database
 * 6. Return 204 (no content)
 */
export async function deleteImage(req, res, next) {
  try {
    const id = req.params.id;
    const image =await Image.findById(id);
    if(!image){
      return res.status(404).json({
        error: {
          message: "Image not found"
        }
      });
    }

    const originalFilename = image.filename;
    const originalFilepath = path.join(UPLOADS_DIR,originalFilename);

    try {
      await fs.promises.unlink(originalFilepath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
      throw err;
    }
    }

    const thumbnailFilename = image.thumbnailFilename;
    const thumbnailFilepath = path.join(THUMBNAILS_DIR,thumbnailFilename);

    try {
      await fs.promises.unlink(thumbnailFilepath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
      throw err;
    }
    }
    await Image.findByIdAndDelete(id)
    return res.status(204).send();

  } catch (error) {
    next(error);
  }
}
