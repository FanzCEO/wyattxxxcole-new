<?php
/**
 * WYATT XXX COLE - Image Upload API
 * Handles logo, hero, and gallery image uploads
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Configuration - Use absolute paths
$docRoot = dirname(__DIR__);
define('UPLOAD_DIR', $docRoot . '/images/');
define('GALLERY_DIR', $docRoot . '/images/gallery/');
define('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB
define('ALLOWED_TYPES', ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Simple auth check (token in header or session)
function checkAuth() {
    $headers = getallheaders();
    $token = $headers['Authorization'] ?? $_GET['token'] ?? '';

    // Remove 'Bearer ' prefix if present
    $token = str_replace('Bearer ', '', $token);

    // For simplicity, check against stored token or allow demo token
    if ($token === 'demo-token' || $token === getStoredToken()) {
        return true;
    }
    return false;
}

function getStoredToken() {
    $tokenFile = __DIR__ . '/.admin_token';
    if (file_exists($tokenFile)) {
        return trim(file_get_contents($tokenFile));
    }
    return '';
}

function generateToken() {
    return bin2hex(random_bytes(32));
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}

function handleError($message, $code = 400) {
    respond(['success' => false, 'error' => $message], $code);
}

// Ensure directories exist
if (!file_exists(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
if (!file_exists(GALLERY_DIR)) mkdir(GALLERY_DIR, 0755, true);

// Route handling
$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'upload-logo':
        if (!checkAuth()) handleError('Unauthorized', 401);
        handleLogoUpload();
        break;
    case 'upload-hero':
        if (!checkAuth()) handleError('Unauthorized', 401);
        handleHeroUpload();
        break;
    case 'upload-gallery':
        if (!checkAuth()) handleError('Unauthorized', 401);
        handleGalleryUpload();
        break;
    case 'delete-gallery':
        if (!checkAuth()) handleError('Unauthorized', 401);
        handleGalleryDelete();
        break;
    case 'list-gallery':
        handleGalleryList();
        break;
    case 'get-settings':
        handleGetSettings();
        break;
    case 'save-settings':
        if (!checkAuth()) handleError('Unauthorized', 401);
        handleSaveSettings();
        break;
    case 'debug':
        respond([
            'success' => true,
            'uploadDir' => UPLOAD_DIR,
            'galleryDir' => GALLERY_DIR,
            'uploadDirExists' => file_exists(UPLOAD_DIR),
            'galleryDirExists' => file_exists(GALLERY_DIR),
            'uploadDirWritable' => is_writable(UPLOAD_DIR),
            'galleryDirWritable' => is_writable(GALLERY_DIR)
        ]);
        break;
    default:
        handleError('Invalid action');
}

function handleLogin() {
    $rawInput = file_get_contents('php://input');

    // Server security filter adds backslash before ! which breaks JSON parsing
    // Clean the raw JSON before decoding
    $cleanedInput = str_replace('\\!', '!', $rawInput);
    $input = json_decode($cleanedInput, true);

    // Also check POST data as fallback
    $username = $input['username'] ?? $_POST['username'] ?? '';
    $password = $input['password'] ?? $_POST['password'] ?? '';

    // Check credentials
    if ($username === 'admin' && $password === 'WyattAdmin2025!') {
        $token = generateToken();

        // Store token
        $tokenFile = __DIR__ . '/.admin_token';
        file_put_contents($tokenFile, $token);
        chmod($tokenFile, 0600);

        respond([
            'success' => true,
            'token' => $token
        ]);
    }

    handleError('Invalid credentials', 401);
}

function handleLogoUpload() {
    if (!isset($_FILES['file'])) {
        handleError('No file uploaded');
    }

    $file = $_FILES['file'];

    // Validate
    if ($file['error'] !== UPLOAD_ERR_OK) {
        handleError('Upload error: ' . $file['error']);
    }

    if ($file['size'] > MAX_FILE_SIZE) {
        handleError('File too large. Max 10MB.');
    }

    $mimeType = mime_content_type($file['tmp_name']);
    if (!in_array($mimeType, ALLOWED_TYPES)) {
        handleError('Invalid file type. Allowed: JPG, PNG, GIF, WebP');
    }

    // Get extension
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'logo.' . $ext;
    $destination = UPLOAD_DIR . $filename;

    // Remove old logo files
    foreach (glob(UPLOAD_DIR . 'logo.*') as $oldFile) {
        unlink($oldFile);
    }

    // Move uploaded file
    if (move_uploaded_file($file['tmp_name'], $destination)) {
        respond([
            'success' => true,
            'filename' => $filename,
            'url' => 'images/' . $filename
        ]);
    }

    handleError('Failed to save file');
}

function handleHeroUpload() {
    if (!isset($_FILES['file'])) {
        handleError('No file uploaded');
    }

    $file = $_FILES['file'];

    // Validate
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errorMsgs = [
            1 => 'File exceeds server limit',
            2 => 'File exceeds form limit',
            3 => 'Partial upload',
            4 => 'No file',
            6 => 'No temp folder',
            7 => 'Write failed',
            8 => 'Extension blocked'
        ];
        handleError('Upload error: ' . ($errorMsgs[$file['error']] ?? $file['error']));
    }

    if ($file['size'] > MAX_FILE_SIZE) {
        handleError('File too large. Max 10MB.');
    }

    $mimeType = mime_content_type($file['tmp_name']);
    if (!in_array($mimeType, ALLOWED_TYPES)) {
        handleError('Invalid file type. Allowed: JPG, PNG, GIF, WebP');
    }

    // Get extension
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($ext === 'jpeg') $ext = 'jpg';
    $filename = 'hero.' . $ext;
    $destination = UPLOAD_DIR . $filename;

    // Remove old hero files
    foreach (glob(UPLOAD_DIR . 'hero.*') as $oldFile) {
        @unlink($oldFile);
    }

    // Move uploaded file
    if (move_uploaded_file($file['tmp_name'], $destination)) {
        @chmod($destination, 0644);

        // Update settings with new hero URL
        $settingsFile = __DIR__ . '/settings.json';
        $settings = [];
        if (file_exists($settingsFile)) {
            $settings = json_decode(file_get_contents($settingsFile), true) ?: [];
        }
        $settings['heroUrl'] = 'images/' . $filename;
        file_put_contents($settingsFile, json_encode($settings, JSON_PRETTY_PRINT));

        respond([
            'success' => true,
            'filename' => $filename,
            'url' => 'images/' . $filename . '?v=' . time()
        ]);
    }

    handleError('Failed to save file. Dir: ' . UPLOAD_DIR . ', Writable: ' . (is_writable(UPLOAD_DIR) ? 'yes' : 'no'));
}

function handleGalleryUpload() {
    if (!isset($_FILES['files'])) {
        // Check for single file
        if (isset($_FILES['file'])) {
            $_FILES['files'] = [
                'name' => [$_FILES['file']['name']],
                'type' => [$_FILES['file']['type']],
                'tmp_name' => [$_FILES['file']['tmp_name']],
                'error' => [$_FILES['file']['error']],
                'size' => [$_FILES['file']['size']]
            ];
        } else {
            handleError('No files uploaded');
        }
    }

    $uploaded = [];
    $errors = [];

    $files = $_FILES['files'];
    $fileCount = count($files['name']);

    for ($i = 0; $i < $fileCount; $i++) {
        $name = $files['name'][$i];
        $tmpName = $files['tmp_name'][$i];
        $error = $files['error'][$i];
        $size = $files['size'][$i];

        if ($error !== UPLOAD_ERR_OK) {
            $errors[] = "$name: Upload error";
            continue;
        }

        if ($size > MAX_FILE_SIZE) {
            $errors[] = "$name: File too large";
            continue;
        }

        $mimeType = mime_content_type($tmpName);
        if (!in_array($mimeType, ALLOWED_TYPES)) {
            $errors[] = "$name: Invalid file type";
            continue;
        }

        // Generate unique filename
        $ext = pathinfo($name, PATHINFO_EXTENSION);
        $filename = 'gallery_' . time() . '_' . $i . '.' . $ext;
        $destination = GALLERY_DIR . $filename;

        if (move_uploaded_file($tmpName, $destination)) {
            $uploaded[] = [
                'filename' => $filename,
                'url' => 'images/gallery/' . $filename
            ];
        } else {
            $errors[] = "$name: Failed to save";
        }
    }

    respond([
        'success' => count($uploaded) > 0,
        'uploaded' => $uploaded,
        'errors' => $errors
    ]);
}

function handleGalleryDelete() {
    $input = json_decode(file_get_contents('php://input'), true);
    $filename = $input['filename'] ?? $_GET['filename'] ?? '';

    if (empty($filename)) {
        handleError('No filename specified');
    }

    // Security: only allow deleting from gallery directory
    $filename = basename($filename);
    $filepath = GALLERY_DIR . $filename;

    if (!file_exists($filepath)) {
        handleError('File not found');
    }

    if (unlink($filepath)) {
        respond(['success' => true]);
    }

    handleError('Failed to delete file');
}

function handleGalleryList() {
    $images = [];

    if (is_dir(GALLERY_DIR)) {
        $files = glob(GALLERY_DIR . '*.{jpg,jpeg,png,gif,webp}', GLOB_BRACE);
        foreach ($files as $file) {
            $filename = basename($file);
            $images[] = [
                'filename' => $filename,
                'url' => 'images/gallery/' . $filename,
                'size' => filesize($file),
                'modified' => filemtime($file)
            ];
        }
        // Sort by modified date, newest first
        usort($images, function($a, $b) {
            return $b['modified'] - $a['modified'];
        });
    }

    respond([
        'success' => true,
        'images' => $images
    ]);
}

function handleGetSettings() {
    $settingsFile = __DIR__ . '/settings.json';

    $defaults = [
        'tagline' => 'Country Bred. Fully Loaded.',
        'reviewCount' => 132,
        'contactEmail' => 'contact@wyattxxxcole.com',
        'logoUrl' => 'images/logo.png',
        'heroUrl' => ''
    ];

    if (file_exists($settingsFile)) {
        $settings = json_decode(file_get_contents($settingsFile), true);
        $settings = array_merge($defaults, $settings);
    } else {
        $settings = $defaults;
    }

    // Check for actual hero image
    foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) {
        if (file_exists(UPLOAD_DIR . "hero.$ext")) {
            $settings['heroUrl'] = "images/hero.$ext";
            break;
        }
    }

    respond([
        'success' => true,
        'settings' => $settings
    ]);
}

function handleSaveSettings() {
    $input = json_decode(file_get_contents('php://input'), true);

    $settings = [
        'tagline' => $input['tagline'] ?? 'Country Bred. Fully Loaded.',
        'reviewCount' => intval($input['reviewCount'] ?? 132),
        'contactEmail' => $input['contactEmail'] ?? 'contact@wyattxxxcole.com'
    ];

    $settingsFile = __DIR__ . '/settings.json';

    if (file_put_contents($settingsFile, json_encode($settings, JSON_PRETTY_PRINT))) {
        respond(['success' => true, 'settings' => $settings]);
    }

    handleError('Failed to save settings');
}
?>
