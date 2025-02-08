const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');   
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const path = require('path');
const File = require('../models/fileModel.js');
sharp.cache(false);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const randomString = crypto.randomBytes(6).toString('hex'); // 6 bytes => 12 ký tự hex
        const uniqueName = `${Date.now()}-${randomString}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});

const upload = multer({ storage });

module.exports.sendMedia = [
    upload.single('file'),
    async (req, res) => {
        if (!req.file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const fileTypeMapping = {
            'images': ['image/jpeg', 'image/png', 'image/gif', 'application/octet-stream'],
            'videos': ['video/mp4', 'video/mkv', 'video/avi'],
            'audios': ['audio/mpeg', 'audio/wav'],
            'documents': ['application/pdf', 'application/msword'],
        };

        let folder = null;

        for (const [key, mimeTypes] of Object.entries(fileTypeMapping)) {
            if (mimeTypes.includes(req.file.mimetype)) {
                folder = key;
                break;
            }
        }

        if (!folder) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
            return res.status(400).json({ success: false, error: 'Invalid file type' });
        }

        const uploadDir = path.join(__dirname, `../uploads/${folder}`);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        let filePath = `${req.protocol}://${req.get('host')}/uploads/${folder}/${req.file.filename}`;

        if (folder === 'images') {
            try {
                const extname = path.extname(req.file.originalname).toLowerCase();
                const outputFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extname}`;
                const outputPath = path.join(__dirname, `../uploads/${folder}/${outputFilename}`);

                await sharp(req.file.path)
                    .resize({ width: 800 })
                    .jpeg({ quality: 80 })
                    .toFile(outputPath);

                await fs.promises.unlink(req.file.path);

                filePath = `${req.protocol}://${req.get('host')}/uploads/${folder}/${outputFilename}`;
            } catch (err) {
                return res.status(500).json({ success: false, error: 'Image processing failed' });
            }
        } else if (folder === 'videos') {
            try {
                const outputFilename = `compressed-${req.file.filename}`;
                const outputPath = path.join(__dirname, `../uploads/${folder}/${outputFilename}`);

                await new Promise((resolve, reject) => {
                    ffmpeg(req.file.path)
                        .output(outputPath)
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .videoBitrate('500k')
                        .audioBitrate('96k')
                        .size('1280x720')
                        .outputOptions(['-crf', '30', '-preset', 'medium'])
                        .on('end', async () => {
                            fs.unlink(req.file.path, (err) => {
                                if (err) console.error('Error deleting original video:', err);
                            });
                            filePath = `${req.protocol}://${req.get('host')}/uploads/${folder}/${outputFilename}`;
                            resolve();
                        })
                        .on('error', reject)
                        .run();
                });
            } catch (err) {
                return res.status(500).json({ success: false, error: 'Video compression failed' });
            }
        } else {
            const newFilePath = path.join(uploadDir, req.file.filename);
            fs.renameSync(req.file.path, newFilePath);
        }

        try {
            const newFile = await File.create({ filePath, fileType: folder });
            return res.status(200).json({ success: true, file: newFile });
        } catch (err) {
            console.log(err);
            return res.status(500).json({ success: false, error: err.message });
        }
    },
];