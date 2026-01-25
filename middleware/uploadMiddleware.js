const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 1. Get ID (Student Index or Teacher EmpID)
        const id = req.body.indexNumber || req.body.empId || 'Unknown';

        // 2. Remove special chars from ID for safety
        const safeId = id.toString().replace(/[^a-zA-Z0-9-_]/g, '');

        // 3. Create filename: "ID-Fieldname.ext"
        const ext = path.extname(file.originalname);
        const fixedName = `${safeId}-${file.fieldname}${ext}`;

        cb(null, fixedName);
    }
});

const upload = multer({ storage: storage });

// Student File Fields
const studentUpload = upload.fields([
    { name: 'studentPhoto', maxCount: 1 },
    { name: 'nicFront', maxCount: 1 },
    { name: 'nicBack', maxCount: 1 },
    { name: 'studentSignature', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'medicalReport', maxCount: 1 },
    { name: 'guardianNic', maxCount: 1 },
    { name: 'guardianPhoto', maxCount: 1 },
    { name: 'leavingCertificate', maxCount: 1 }
]);

// Teacher File Fields
const teacherUpload = upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'cvFile', maxCount: 1 },
    { name: 'certificates', maxCount: 1 },
    { name: 'nicCopy', maxCount: 1 },
    { name: 'qualification', maxCount: 1 },
    { name: 'nicFront', maxCount: 1 },
    { name: 'nicBack', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 }
]);

// Generic Document Upload
const documentUpload = upload.single('document');

module.exports = {
    studentUpload,
    teacherUpload,
    documentUpload
};
