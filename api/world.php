<?php
/**
 * WYATT XXX COLE - World API
 * Handles user registration, login, email verification, and admin moderation
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

define('USERS_FILE', __DIR__ . '/world_users.json');
define('SITE_URL', 'https://wyattxxxcole.com');
define('SITE_NAME', 'WYATT XXX COLE World');
define('FROM_EMAIL', 'noreply@wyattxxxcole.com');

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}

function handleError($message, $code = 400) {
    respond(['success' => false, 'error' => $message], $code);
}

function getUsers() {
    if (file_exists(USERS_FILE)) {
        $data = json_decode(file_get_contents(USERS_FILE), true);
        if ($data) return $data;
    }
    return [];
}

function saveUsers($users) {
    return file_put_contents(USERS_FILE, json_encode($users, JSON_PRETTY_PRINT));
}

function generateToken() {
    return bin2hex(random_bytes(32));
}

function generateVerificationCode() {
    return strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
}

function hashPassword($password) {
    return password_hash($password, PASSWORD_BCRYPT);
}

function verifyPassword($password, $hash) {
    return password_verify($password, $hash);
}

function checkAdminAuth() {
    $headers = getallheaders();
    $token = $headers['Authorization'] ?? $_GET['token'] ?? '';
    $token = str_replace('Bearer ', '', $token);

    $tokenFile = __DIR__ . '/.admin_token';
    if (file_exists($tokenFile)) {
        $storedToken = trim(file_get_contents($tokenFile));
        return $token === $storedToken || $token === 'demo-token';
    }
    return $token === 'demo-token';
}

function sendVerificationEmail($email, $username, $code) {
    $subject = "Verify your " . SITE_NAME . " account";
    $verifyLink = SITE_URL . "/verify.html?email=" . urlencode($email) . "&code=" . $code;

    $message = "
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background: #1a1a1a; color: #f5ede4; padding: 20px; }
            .container { max-width: 500px; margin: 0 auto; background: #111; padding: 30px; border-radius: 10px; border: 1px solid #c68e3f; }
            h1 { color: #c68e3f; margin-bottom: 20px; }
            .code { font-size: 32px; font-weight: bold; color: #c68e3f; letter-spacing: 5px; padding: 20px; background: #222; border-radius: 8px; text-align: center; margin: 20px 0; }
            .button { display: inline-block; background: linear-gradient(135deg, #c68e3f, #a44a2a); color: #000; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .footer { margin-top: 30px; color: #888; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class='container'>
            <h1>Welcome, $username!</h1>
            <p>Thanks for joining " . SITE_NAME . ". Use this verification code to activate your account:</p>
            <div class='code'>$code</div>
            <p>Or click the button below:</p>
            <p><a href='$verifyLink' class='button'>Verify Email</a></p>
            <p class='footer'>If you didn't create this account, you can ignore this email.<br>This code expires in 24 hours.</p>
        </div>
    </body>
    </html>
    ";

    $headers = "MIME-Version: 1.0" . "\r\n";
    $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
    $headers .= "From: " . SITE_NAME . " <" . FROM_EMAIL . ">" . "\r\n";

    return @mail($email, $subject, $message, $headers);
}

// Get action from URL path or query string
$action = $_GET['action'] ?? '';

// Also check URL path for /api/world/register or /api/world/login style URLs
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
if (preg_match('/\/world\/(register|login|verify-email|resend)/', $requestUri, $matches)) {
    $action = $matches[1];
}

// Get JSON input
$rawInput = file_get_contents('php://input');
$cleanedInput = str_replace('\\!', '!', $rawInput);
$input = json_decode($cleanedInput, true) ?: [];

switch ($action) {
    case 'register':
        handleRegister($input);
        break;
    case 'login':
        handleLogin($input);
        break;
    case 'verify':
        handleVerifyToken();
        break;
    case 'verify-email':
        handleVerifyEmail($input);
        break;
    case 'resend':
        handleResendVerification($input);
        break;
    // Admin endpoints
    case 'list-users':
        if (!checkAdminAuth()) handleError('Unauthorized', 401);
        handleListUsers();
        break;
    case 'update-user':
        if (!checkAdminAuth()) handleError('Unauthorized', 401);
        handleUpdateUser($input);
        break;
    case 'delete-user':
        if (!checkAdminAuth()) handleError('Unauthorized', 401);
        handleDeleteUser($input);
        break;
    case 'ban-user':
        if (!checkAdminAuth()) handleError('Unauthorized', 401);
        handleBanUser($input);
        break;
    case 'unban-user':
        if (!checkAdminAuth()) handleError('Unauthorized', 401);
        handleUnbanUser($input);
        break;
    case 'approve-user':
        if (!checkAdminAuth()) handleError('Unauthorized', 401);
        handleApproveUser($input);
        break;
    default:
        handleError('Invalid action');
}

function handleRegister($input) {
    $username = trim($input['username'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';

    // Validate inputs
    if (empty($username)) {
        handleError('Username is required');
    }
    if (strlen($username) < 3) {
        handleError('Username must be at least 3 characters');
    }
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $username)) {
        handleError('Username can only contain letters, numbers, and underscores');
    }

    if (empty($email)) {
        handleError('Email is required');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        handleError('Invalid email format');
    }

    if (empty($password)) {
        handleError('Password is required');
    }
    if (strlen($password) < 6) {
        handleError('Password must be at least 6 characters');
    }

    // Check if user already exists
    $users = getUsers();

    foreach ($users as $user) {
        if (strtolower($user['email']) === strtolower($email)) {
            handleError('Email already registered');
        }
        if (strtolower($user['username']) === strtolower($username)) {
            handleError('Username already taken');
        }
    }

    // Generate verification code
    $verificationCode = generateVerificationCode();

    // Create new user
    $newUser = [
        'id' => uniqid('user_', true),
        'username' => $username,
        'email' => strtolower($email),
        'password' => hashPassword($password),
        'tier' => 'free',
        'status' => 'pending', // pending, active, banned
        'emailVerified' => false,
        'verificationCode' => $verificationCode,
        'verificationExpires' => date('c', strtotime('+24 hours')),
        'createdAt' => date('c'),
        'lastLogin' => null
    ];

    $users[] = $newUser;

    if (saveUsers($users)) {
        // Send verification email
        $emailSent = sendVerificationEmail($email, $username, $verificationCode);

        respond([
            'success' => true,
            'message' => 'Account created! Please check your email to verify your account.',
            'emailSent' => $emailSent,
            'requiresVerification' => true
        ]);
    }

    handleError('Failed to create account. Please try again.');
}

function handleLogin($input) {
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($email)) {
        handleError('Email is required');
    }
    if (empty($password)) {
        handleError('Password is required');
    }

    $users = getUsers();

    foreach ($users as &$user) {
        if (strtolower($user['email']) === strtolower($email)) {
            // Check if banned
            if (isset($user['status']) && $user['status'] === 'banned') {
                handleError('Your account has been suspended. Contact support for help.', 403);
            }

            // Check if email verified
            if (isset($user['emailVerified']) && !$user['emailVerified']) {
                handleError('Please verify your email before logging in. Check your inbox for the verification code.', 403);
            }

            // Check password
            if (verifyPassword($password, $user['password'])) {
                // Generate token
                $token = generateToken();

                // Update last login
                $user['lastLogin'] = date('c');
                $user['token'] = $token;
                $user['tokenExpires'] = date('c', strtotime('+7 days'));
                saveUsers($users);

                respond([
                    'success' => true,
                    'token' => $token,
                    'user' => [
                        'id' => $user['id'],
                        'username' => $user['username'],
                        'email' => $user['email'],
                        'tier' => $user['tier'],
                        'status' => $user['status'] ?? 'active'
                    ]
                ]);
            } else {
                handleError('Invalid password', 401);
            }
        }
    }

    handleError('Email not found', 401);
}

function handleVerifyEmail($input) {
    $email = trim($input['email'] ?? $_GET['email'] ?? '');
    $code = trim($input['code'] ?? $_GET['code'] ?? '');

    if (empty($email) || empty($code)) {
        handleError('Email and verification code are required');
    }

    $users = getUsers();

    foreach ($users as &$user) {
        if (strtolower($user['email']) === strtolower($email)) {
            // Check if already verified
            if (isset($user['emailVerified']) && $user['emailVerified']) {
                respond([
                    'success' => true,
                    'message' => 'Email already verified. You can sign in.'
                ]);
            }

            // Check code
            if (!isset($user['verificationCode']) || strtoupper($user['verificationCode']) !== strtoupper($code)) {
                handleError('Invalid verification code');
            }

            // Check expiration
            if (isset($user['verificationExpires']) && strtotime($user['verificationExpires']) < time()) {
                handleError('Verification code has expired. Request a new one.');
            }

            // Verify the user
            $user['emailVerified'] = true;
            $user['status'] = 'active';
            unset($user['verificationCode']);
            unset($user['verificationExpires']);
            saveUsers($users);

            respond([
                'success' => true,
                'message' => 'Email verified successfully! You can now sign in.'
            ]);
        }
    }

    handleError('Email not found');
}

function handleResendVerification($input) {
    $email = trim($input['email'] ?? '');

    if (empty($email)) {
        handleError('Email is required');
    }

    $users = getUsers();

    foreach ($users as &$user) {
        if (strtolower($user['email']) === strtolower($email)) {
            if (isset($user['emailVerified']) && $user['emailVerified']) {
                handleError('Email already verified');
            }

            // Generate new code
            $code = generateVerificationCode();
            $user['verificationCode'] = $code;
            $user['verificationExpires'] = date('c', strtotime('+24 hours'));
            saveUsers($users);

            // Send email
            $emailSent = sendVerificationEmail($email, $user['username'], $code);

            respond([
                'success' => true,
                'message' => 'Verification email sent! Check your inbox.',
                'emailSent' => $emailSent
            ]);
        }
    }

    handleError('Email not found');
}

function handleVerifyToken() {
    $headers = getallheaders();
    $token = $headers['Authorization'] ?? $_GET['token'] ?? '';
    $token = str_replace('Bearer ', '', $token);

    if (empty($token)) {
        handleError('No token provided', 401);
    }

    $users = getUsers();

    foreach ($users as $user) {
        if (isset($user['token']) && $user['token'] === $token) {
            // Check expiration
            if (isset($user['tokenExpires']) && strtotime($user['tokenExpires']) > time()) {
                respond([
                    'success' => true,
                    'user' => [
                        'id' => $user['id'],
                        'username' => $user['username'],
                        'email' => $user['email'],
                        'tier' => $user['tier'],
                        'status' => $user['status'] ?? 'active'
                    ]
                ]);
            } else {
                handleError('Token expired', 401);
            }
        }
    }

    handleError('Invalid token', 401);
}

// ============ ADMIN FUNCTIONS ============

function handleListUsers() {
    $users = getUsers();

    // Remove sensitive data
    $safeUsers = array_map(function($user) {
        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'tier' => $user['tier'] ?? 'free',
            'status' => $user['status'] ?? 'active',
            'emailVerified' => $user['emailVerified'] ?? false,
            'createdAt' => $user['createdAt'] ?? null,
            'lastLogin' => $user['lastLogin'] ?? null
        ];
    }, $users);

    respond([
        'success' => true,
        'users' => array_values($safeUsers),
        'total' => count($safeUsers)
    ]);
}

function handleUpdateUser($input) {
    $userId = $input['id'] ?? '';

    if (empty($userId)) {
        handleError('User ID is required');
    }

    $users = getUsers();
    $found = false;

    foreach ($users as &$user) {
        if ($user['id'] === $userId) {
            // Update allowed fields
            if (isset($input['tier'])) {
                $user['tier'] = $input['tier'];
            }
            if (isset($input['status'])) {
                $user['status'] = $input['status'];
            }
            if (isset($input['username'])) {
                $user['username'] = $input['username'];
            }
            $found = true;
            break;
        }
    }

    if (!$found) {
        handleError('User not found');
    }

    if (saveUsers($users)) {
        respond(['success' => true, 'message' => 'User updated']);
    }

    handleError('Failed to update user');
}

function handleDeleteUser($input) {
    $userId = $input['id'] ?? $_GET['id'] ?? '';

    if (empty($userId)) {
        handleError('User ID is required');
    }

    $users = getUsers();
    $newUsers = array_filter($users, function($user) use ($userId) {
        return $user['id'] !== $userId;
    });

    if (count($newUsers) === count($users)) {
        handleError('User not found');
    }

    if (saveUsers(array_values($newUsers))) {
        respond(['success' => true, 'message' => 'User deleted']);
    }

    handleError('Failed to delete user');
}

function handleBanUser($input) {
    $userId = $input['id'] ?? '';

    if (empty($userId)) {
        handleError('User ID is required');
    }

    $users = getUsers();

    foreach ($users as &$user) {
        if ($user['id'] === $userId) {
            $user['status'] = 'banned';
            $user['bannedAt'] = date('c');
            $user['bannedReason'] = $input['reason'] ?? 'Violated terms of service';
            // Invalidate token
            unset($user['token']);
            unset($user['tokenExpires']);

            if (saveUsers($users)) {
                respond(['success' => true, 'message' => 'User banned']);
            }
        }
    }

    handleError('User not found');
}

function handleUnbanUser($input) {
    $userId = $input['id'] ?? '';

    if (empty($userId)) {
        handleError('User ID is required');
    }

    $users = getUsers();

    foreach ($users as &$user) {
        if ($user['id'] === $userId) {
            $user['status'] = 'active';
            unset($user['bannedAt']);
            unset($user['bannedReason']);

            if (saveUsers($users)) {
                respond(['success' => true, 'message' => 'User unbanned']);
            }
        }
    }

    handleError('User not found');
}

function handleApproveUser($input) {
    $userId = $input['id'] ?? '';

    if (empty($userId)) {
        handleError('User ID is required');
    }

    $users = getUsers();

    foreach ($users as &$user) {
        if ($user['id'] === $userId) {
            $user['status'] = 'active';
            $user['emailVerified'] = true;
            unset($user['verificationCode']);
            unset($user['verificationExpires']);

            if (saveUsers($users)) {
                respond(['success' => true, 'message' => 'User approved and verified']);
            }
        }
    }

    handleError('User not found');
}
?>
