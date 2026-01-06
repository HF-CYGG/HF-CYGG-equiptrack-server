import multer from "multer";
import path from "path";
import fs from "fs";

// Define base uploads directory
const baseUploadDir = path.join(process.cwd(), "uploads");
const itemsDir = path.join(baseUploadDir, "items");
const itemsThumbsDir = path.join(itemsDir, "thumbs");
const itemsFullDir = path.join(itemsDir, "full");
const returnsDir = path.join(baseUploadDir, "returns");
const borrowsDir = path.join(baseUploadDir, "borrows");
const othersDir = path.join(baseUploadDir, "others");
const avatarsDir = path.join(process.cwd(), "data", "avatars");

// Ensure directories exist
[baseUploadDir, itemsDir, itemsThumbsDir, itemsFullDir, returnsDir, borrowsDir, othersDir, avatarsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine subfolder based on "type" field in body or query
    // Note: req.body might not be populated yet depending on field order in multipart form.
    // To be safe, we can check a custom header or rely on the field name if multiple upload endpoints were used.
    // For simplicity, let's try to infer from req.body if available (needs multer fields processing first)
    // or better: let the route handle specific upload types or use a query param.
    
    let subfolder = othersDir;
    const type = req.query.type || req.body.type;

    if (type === "item_thumb") {
      subfolder = itemsThumbsDir;
    } else if (type === "item_full") {
      subfolder = itemsFullDir;
    } else if (type === "item") {
      subfolder = itemsDir;
    } else if (type === "return") {
      subfolder = returnsDir;
    } else if (type === "borrow") {
      subfolder = borrowsDir;
    } else if (type === "avatar") {
      subfolder = avatarsDir;
    }

    cb(null, subfolder);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

export const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
