const router = require("express").Router();
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { authenticate } = require("../middlewares/auth.middleware");
const prisma = require("../utils/prisma.client");

// Configure multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Upload tenant logo
router.post("/logo", authenticate, upload.single("logo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image file provided" });
    if (!req.user.tenantId) return res.status(400).json({ message: "No tenant found for user" });

    const filename = `logo-${req.user.tenantId}-${Date.now()}.webp`;
    const outputPath = path.join(uploadDir, filename);

    await sharp(req.file.buffer)
      .resize(400, 400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(outputPath);

    const logoUrl = `/uploads/${filename}`;
    await prisma.tenant.update({
      where: { id: req.user.tenantId },
      data: { logoUrl },
    });

    res.json({ message: "Logo uploaded successfully", url: logoUrl });
  } catch (err) {
    next(err);
  }
});

// Upload user avatar
router.post("/avatar", authenticate, upload.single("avatar"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image file provided" });

    const filename = `avatar-${req.user.id}-${Date.now()}.webp`;
    const outputPath = path.join(uploadDir, filename);

    await sharp(req.file.buffer)
      .resize(300, 300, { fit: "cover" })
      .webp({ quality: 85 })
      .toFile(outputPath);

    const avatarUrl = `/uploads/${filename}`;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
    });

    res.json({ message: "Avatar uploaded successfully", url: avatarUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
