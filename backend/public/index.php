<?php
require __DIR__ . '/../vendor/autoload.php';

session_start();

const GOOGLE_CLIENT_ID = 'REDACTED_GOOGLE_CLIENT_ID';
const ALLOWED_ORIGINS = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}

header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function sendCorsHeaders(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, ALLOWED_ORIGINS, true)) {
        Flight::response()->header('Access-Control-Allow-Origin', $origin);
        Flight::response()->header('Access-Control-Allow-Credentials', 'true');
    }

    Flight::response()->header('Vary', 'Origin');
    Flight::response()->header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    Flight::response()->header('Access-Control-Allow-Headers', 'Content-Type');
}

function getJsonBody(): array
{
    $body = Flight::request()->getBody();
    if (!$body) {
        return [];
    }

    $decoded = json_decode($body, true);
    return is_array($decoded) ? $decoded : [];
}

function currentUserFromSession(): ?array
{
    if (!isset($_SESSION['user']) || !is_array($_SESSION['user'])) {
        return null;
    }

    return [
        'name' => $_SESSION['user']['name'] ?? '',
    ];
}

Flight::route('OPTIONS /*', function () {
    sendCorsHeaders();
    Flight::stop(204);
});

Flight::route('POST /api/auth/google-one-tap', function () {
    sendCorsHeaders();

    $payload = getJsonBody();
    $token = $payload['token'] ?? '';

    if (!$token) {
        Flight::json(['success' => false, 'error' => 'No token provided'], 400);
        return;
    }

    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($token);
    $response = @file_get_contents($url);

    if ($response === false) {
        Flight::json(['success' => false, 'error' => 'Failed to verify token with Google'], 401);
        return;
    }

    $userData = json_decode($response, true);
    if (!is_array($userData) || isset($userData['error'])) {
        Flight::json(['success' => false, 'error' => 'Invalid token'], 401);
        return;
    }

    if (($userData['aud'] ?? '') !== GOOGLE_CLIENT_ID) {
        Flight::json(['success' => false, 'error' => 'Token audience mismatch'], 401);
        return;
    }

    $_SESSION['user'] = [
        'name' => $userData['name'] ?? '',
    ];

    Flight::json([
        'success' => true,
        'user' => currentUserFromSession(),
    ]);
});

Flight::route('GET /api/me', function () {
    sendCorsHeaders();

    $user = currentUserFromSession();
    if ($user === null) {
        Flight::json(['success' => false, 'error' => 'Unauthorized'], 401);
        return;
    }

    Flight::json([
        'success' => true,
        'user' => $user,
    ]);
});

Flight::route('POST /api/logout', function () {
    sendCorsHeaders();

    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();

    Flight::json(['success' => true]);
});

Flight::start();