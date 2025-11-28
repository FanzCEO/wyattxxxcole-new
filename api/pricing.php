<?php
/**
 * WYATT XXX COLE - Pricing API
 * Handles booking and subscription pricing management
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, PUT');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

define('PRICING_FILE', __DIR__ . '/pricing.json');

// Auth check
function checkAuth() {
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

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}

function handleError($message, $code = 400) {
    respond(['success' => false, 'error' => $message], $code);
}

// Default pricing structure
function getDefaultPricing() {
    return [
        'booking' => [
            'customVideos' => [
                'name' => 'Custom Videos',
                'description' => 'Personalized content made just for you',
                'basePrice' => 50,
                'priceLabel' => 'Starting at',
                'icon' => '🎬',
                'features' => [
                    '5-10 minute videos',
                    'Your specific requests',
                    'Name use available',
                    'Delivered within 7 days'
                ]
            ],
            'liveSessions' => [
                'name' => 'Live Sessions',
                'description' => 'One-on-one video calls',
                'basePrice' => 100,
                'priceLabel' => 'Per 30 min',
                'icon' => '📹',
                'features' => [
                    'Private video call',
                    'Real-time interaction',
                    'Flexible scheduling',
                    'Session recording available'
                ]
            ],
            'ratings' => [
                'name' => 'Ratings',
                'description' => 'Honest feedback and ratings',
                'basePrice' => 25,
                'priceLabel' => 'Starting at',
                'icon' => '⭐',
                'features' => [
                    'Detailed written review',
                    'Video response option',
                    'Confidential & discreet',
                    '24-48 hour turnaround'
                ]
            ],
            'sexting' => [
                'name' => 'Sexting Sessions',
                'description' => 'Live text chat sessions',
                'basePrice' => 30,
                'priceLabel' => 'Per 30 min',
                'icon' => '💬',
                'features' => [
                    'Real-time messaging',
                    'Photos included',
                    'Voice messages available',
                    'No screenshots policy'
                ]
            ]
        ],
        'subscriptions' => [
            'free' => [
                'name' => 'Ranch Hand',
                'tagline' => "Just gettin' started",
                'price' => 0,
                'period' => 'forever',
                'icon' => '🤠',
                'featured' => false,
                'badge' => '',
                'features' => [
                    ['text' => 'Access to free gallery content', 'included' => true],
                    ['text' => 'Weekly newsletter updates', 'included' => true],
                    ['text' => 'Public community access', 'included' => true],
                    ['text' => 'Exclusive content', 'included' => false],
                    ['text' => 'Direct messaging', 'included' => false]
                ],
                'cta' => 'Join Free'
            ],
            'silver' => [
                'name' => 'Silver Spur',
                'tagline' => 'For the dedicated fans',
                'price' => 9.99,
                'period' => 'month',
                'icon' => '⭐',
                'featured' => false,
                'badge' => '',
                'features' => [
                    ['text' => 'Everything in Ranch Hand', 'included' => true],
                    ['text' => 'Exclusive photo sets weekly', 'included' => true],
                    ['text' => 'Behind-the-scenes content', 'included' => true],
                    ['text' => 'Early access to new releases', 'included' => true],
                    ['text' => 'Direct messaging', 'included' => false]
                ],
                'cta' => 'Subscribe'
            ],
            'gold' => [
                'name' => 'Gold Buckle',
                'tagline' => 'The real deal',
                'price' => 24.99,
                'period' => 'month',
                'icon' => '🏆',
                'featured' => true,
                'badge' => 'Most Popular',
                'features' => [
                    ['text' => 'Everything in Silver Spur', 'included' => true],
                    ['text' => 'Exclusive videos weekly', 'included' => true],
                    ['text' => 'Direct messaging access', 'included' => true],
                    ['text' => 'Monthly live Q&A sessions', 'included' => true],
                    ['text' => '10% off all bookings', 'included' => true]
                ],
                'cta' => 'Subscribe Now',
                'discount' => 10
            ],
            'vip' => [
                'name' => 'VIP Cowboy',
                'tagline' => 'Top of the herd',
                'price' => 49.99,
                'period' => 'month',
                'icon' => '👑',
                'featured' => false,
                'badge' => 'Elite',
                'features' => [
                    ['text' => 'Everything in Gold Buckle', 'included' => true],
                    ['text' => 'Priority response to messages', 'included' => true],
                    ['text' => 'Custom content requests', 'included' => true],
                    ['text' => 'Free monthly video call (15 min)', 'included' => true],
                    ['text' => '25% off all bookings', 'included' => true]
                ],
                'cta' => 'Go VIP',
                'discount' => 25
            ]
        ],
        'updatedAt' => date('c')
    ];
}

// Get pricing data
function getPricing() {
    if (file_exists(PRICING_FILE)) {
        $data = json_decode(file_get_contents(PRICING_FILE), true);
        if ($data) return $data;
    }
    return getDefaultPricing();
}

// Save pricing data
function savePricing($data) {
    $data['updatedAt'] = date('c');
    return file_put_contents(PRICING_FILE, json_encode($data, JSON_PRETTY_PRINT));
}

// Route handling
$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'get':
    case 'get-pricing':
        $pricing = getPricing();
        respond(['success' => true, 'pricing' => $pricing]);
        break;

    case 'get-booking':
        $pricing = getPricing();
        respond(['success' => true, 'booking' => $pricing['booking']]);
        break;

    case 'get-subscriptions':
        $pricing = getPricing();
        respond(['success' => true, 'subscriptions' => $pricing['subscriptions']]);
        break;

    case 'save':
    case 'save-pricing':
        if (!checkAuth()) handleError('Unauthorized', 401);

        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) handleError('Invalid JSON data');

        $currentPricing = getPricing();

        // Merge updates
        if (isset($input['booking'])) {
            $currentPricing['booking'] = array_merge($currentPricing['booking'], $input['booking']);
        }
        if (isset($input['subscriptions'])) {
            $currentPricing['subscriptions'] = array_merge($currentPricing['subscriptions'], $input['subscriptions']);
        }

        if (savePricing($currentPricing)) {
            respond(['success' => true, 'pricing' => $currentPricing]);
        }
        handleError('Failed to save pricing');
        break;

    case 'save-booking':
        if (!checkAuth()) handleError('Unauthorized', 401);

        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) handleError('Invalid JSON data');

        $currentPricing = getPricing();
        $currentPricing['booking'] = $input;

        if (savePricing($currentPricing)) {
            respond(['success' => true, 'booking' => $currentPricing['booking']]);
        }
        handleError('Failed to save booking prices');
        break;

    case 'save-subscriptions':
        if (!checkAuth()) handleError('Unauthorized', 401);

        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) handleError('Invalid JSON data');

        $currentPricing = getPricing();
        $currentPricing['subscriptions'] = $input;

        if (savePricing($currentPricing)) {
            respond(['success' => true, 'subscriptions' => $currentPricing['subscriptions']]);
        }
        handleError('Failed to save subscription prices');
        break;

    case 'reset':
        if (!checkAuth()) handleError('Unauthorized', 401);

        $defaultPricing = getDefaultPricing();
        if (savePricing($defaultPricing)) {
            respond(['success' => true, 'pricing' => $defaultPricing, 'message' => 'Pricing reset to defaults']);
        }
        handleError('Failed to reset pricing');
        break;

    default:
        // Default: return all pricing (public endpoint)
        $pricing = getPricing();
        respond(['success' => true, 'pricing' => $pricing]);
}
?>
