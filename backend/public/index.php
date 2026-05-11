<?php
require __DIR__ . '/../vendor/autoload.php';

ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

const GOOGLE_CLIENT_ID = 'REDACTED_GOOGLE_CLIENT_ID';
const JWT_TTL_SECONDS = 3600;
const ALLOWED_ORIGINS = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://[::1]:4200',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}

header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

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
    Flight::response()->header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

function getJwtSecret(): string
{
    $secret = getenv('APP_JWT_SECRET');
    return is_string($secret) && $secret !== '' ? $secret : 'REDACTED_JWT_SECRET';
}

function base64UrlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64UrlDecode(string $value): string|false
{
    $padding = strlen($value) % 4;
    if ($padding > 0) {
        $value .= str_repeat('=', 4 - $padding);
    }

    return base64_decode(strtr($value, '-_', '+/'), true);
}

function issueJwtToken(array $payload): string
{
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $encodedHeader = base64UrlEncode(json_encode($header, JSON_UNESCAPED_SLASHES));
    $encodedPayload = base64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, getJwtSecret(), true);

    return $encodedHeader . '.' . $encodedPayload . '.' . base64UrlEncode($signature);
}

function validateJwtToken(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
    $rawHeader = base64UrlDecode($encodedHeader);
    $rawPayload = base64UrlDecode($encodedPayload);
    $rawSignature = base64UrlDecode($encodedSignature);

    if ($rawHeader === false || $rawPayload === false || $rawSignature === false) {
        return null;
    }

    $header = json_decode($rawHeader, true);
    $payload = json_decode($rawPayload, true);
    if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'HS256') {
        return null;
    }

    $expectedSignature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, getJwtSecret(), true);
    if (!hash_equals($expectedSignature, $rawSignature)) {
        return null;
    }

    $expiresAt = (int)($payload['exp'] ?? 0);
    if ($expiresAt <= 0 || $expiresAt < time()) {
        return null;
    }

    return $payload;
}

function getBearerToken(): ?string
{
    $authorizationHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!is_string($authorizationHeader) || $authorizationHeader === '') {
        return null;
    }

    if (!preg_match('/^Bearer\s+(.+)$/i', $authorizationHeader, $matches)) {
        return null;
    }

    return trim($matches[1]);
}

function resolveRoleForEmail(string $email): string
{
    $normalizedEmail = strtolower(trim($email));
    if ($normalizedEmail === 'rlodhiya@dinm.co.uk') {
        return 'admin';
    }

    if ($normalizedEmail === 'rlodhiya@adeptdrive.com') {
        return 'instructor';
    }

    return 'learner';
}

function buildUserPayload(string $name, string $email): array
{
    return [
        'name' => $name !== '' ? $name : $email,
        'email' => strtolower(trim($email)),
        'role' => resolveRoleForEmail($email),
    ];
}

function startAuthenticatedSession(array $user): array
{
    session_regenerate_id(true);

    $issuedAt = time();
    $expiresAt = $issuedAt + JWT_TTL_SECONDS;
    $jwt = issueJwtToken([
        'sub' => $user['email'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'iat' => $issuedAt,
        'exp' => $expiresAt,
        'sid' => session_id(),
    ]);

    $_SESSION['user'] = $user;
    $_SESSION['session_token'] = $jwt;
    $_SESSION['session_expires_at'] = $expiresAt;

    return [
        'user' => $user,
        'sessionToken' => $jwt,
        'expiresAt' => $expiresAt,
    ];
}

function currentUserFromSession(): ?array
{
    if (!isset($_SESSION['user']) || !is_array($_SESSION['user'])) {
        return null;
    }

    $expiresAt = (int)($_SESSION['session_expires_at'] ?? 0);
    if ($expiresAt <= 0 || $expiresAt < time()) {
        $_SESSION = [];
        session_destroy();
        return null;
    }

    return [
        'name' => $_SESSION['user']['name'] ?? '',
        'email' => $_SESSION['user']['email'] ?? '',
        'role' => $_SESSION['user']['role'] ?? 'learner',
    ];
}

function requireAuthenticatedUser(): ?array
{
    $user = currentUserFromSession();
    if ($user === null) {
        Flight::json(['success' => false, 'error' => 'Unauthorized'], 401);
        return null;
    }

    return $user;
}

function requireDashboardAccessUser(): ?array
{
    $user = requireAuthenticatedUser();
    if ($user === null) {
        return null;
    }

    $bearerToken = getBearerToken();
    if ($bearerToken === null || $bearerToken === '') {
        Flight::json(['success' => false, 'error' => 'Missing bearer session token'], 401);
        return null;
    }

    $jwtPayload = validateJwtToken($bearerToken);
    if ($jwtPayload === null) {
        Flight::json(['success' => false, 'error' => 'Invalid or expired bearer session token'], 401);
        return null;
    }

    $storedToken = (string)($_SESSION['session_token'] ?? '');
    if ($storedToken === '' || !hash_equals($storedToken, $bearerToken)) {
        Flight::json(['success' => false, 'error' => 'Bearer token does not match active session'], 401);
        return null;
    }

    if (($jwtPayload['sid'] ?? '') !== session_id()) {
        Flight::json(['success' => false, 'error' => 'Session binding mismatch'], 401);
        return null;
    }

    if (($jwtPayload['email'] ?? '') !== ($user['email'] ?? '')) {
        Flight::json(['success' => false, 'error' => 'Token subject does not match session user'], 401);
        return null;
    }

    return $user;
}

function rolePriority(string $role): int
{
    if ($role === 'admin') {
        return 3;
    }

    if ($role === 'instructor') {
        return 2;
    }

    if ($role === 'learner') {
        return 1;
    }

    return 0;
}

function userHasRequiredRole(string $userRole, string $requiredRole): bool
{
    return rolePriority($userRole) >= rolePriority($requiredRole);
}

function buildDashboardDataForRole(string $role): array
{
    if ($role === 'admin') {
        return [
            'widgets' => ['platformHealth', 'userManagement', 'courseAudit'],
            'permissions' => ['manage_users', 'manage_courses', 'view_reports'],
        ];
    }

    if ($role === 'instructor') {
        return [
            'widgets' => ['courseOverview', 'studentProgress', 'assignmentQueue'],
            'permissions' => ['manage_own_courses', 'grade_assignments', 'view_class_reports'],
        ];
    }

    return [
        'widgets' => ['enrolledCourses', 'upcomingDeadlines', 'recentFeedback'],
        'permissions' => ['view_enrolled_courses', 'submit_assignments'],
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

    $email = (string)($userData['email'] ?? '');
    if ($email === '') {
        Flight::json(['success' => false, 'error' => 'Google token did not include email'], 401);
        return;
    }

    $session = startAuthenticatedSession(
        buildUserPayload((string)($userData['name'] ?? ''), $email)
    );

    Flight::json([
        'success' => true,
        'user' => $session['user'],
        'sessionToken' => $session['sessionToken'],
        'expiresAt' => $session['expiresAt'],
    ]);
});

Flight::route('POST /api/auth/google-access-token', function () {
    sendCorsHeaders();

    $payload = getJsonBody();
    $accessToken = $payload['accessToken'] ?? '';

    if (!$accessToken) {
        Flight::json(['success' => false, 'error' => 'No access token provided'], 400);
        return;
    }

    $tokenInfoUrl = 'https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' . urlencode($accessToken);
    $tokenInfoResponse = @file_get_contents($tokenInfoUrl);

    if ($tokenInfoResponse === false) {
        Flight::json(['success' => false, 'error' => 'Failed to verify access token'], 401);
        return;
    }

    $tokenInfo = json_decode($tokenInfoResponse, true);
    if (!is_array($tokenInfo) || isset($tokenInfo['error_description']) || isset($tokenInfo['error'])) {
        Flight::json(['success' => false, 'error' => 'Invalid access token'], 401);
        return;
    }

    if (($tokenInfo['aud'] ?? '') !== GOOGLE_CLIENT_ID) {
        Flight::json(['success' => false, 'error' => 'Token audience mismatch'], 401);
        return;
    }

    $userInfoRequestOptions = [
        'http' => [
            'method' => 'GET',
            'header' => "Authorization: Bearer {$accessToken}\r\n",
        ],
    ];
    $userInfoContext = stream_context_create($userInfoRequestOptions);
    $userInfoResponse = @file_get_contents('https://openidconnect.googleapis.com/v1/userinfo', false, $userInfoContext);

    if ($userInfoResponse === false) {
        Flight::json(['success' => false, 'error' => 'Failed to fetch Google user profile'], 401);
        return;
    }

    $userInfo = json_decode($userInfoResponse, true);
    if (!is_array($userInfo) || isset($userInfo['error'])) {
        Flight::json(['success' => false, 'error' => 'Invalid Google user profile response'], 401);
        return;
    }

    $email = (string)($userInfo['email'] ?? '');
    if ($email === '') {
        Flight::json(['success' => false, 'error' => 'Google profile did not include email'], 401);
        return;
    }

    $session = startAuthenticatedSession(
        buildUserPayload((string)($userInfo['name'] ?? ''), $email)
    );

    Flight::json([
        'success' => true,
        'user' => $session['user'],
        'sessionToken' => $session['sessionToken'],
        'expiresAt' => $session['expiresAt'],
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
        'sessionToken' => $_SESSION['session_token'] ?? null,
        'expiresAt' => (int)($_SESSION['session_expires_at'] ?? 0),
    ]);
});

Flight::route('GET /api/dashboard', function () {
    sendCorsHeaders();

    $user = requireDashboardAccessUser();
    if ($user === null) {
        return;
    }

    $allowedRoles = ['admin', 'instructor', 'learner'];
    if (!in_array($user['role'], $allowedRoles, true)) {
        Flight::json(['success' => false, 'error' => 'Forbidden'], 403);
        return;
    }

    Flight::json([
        'success' => true,
        'user' => $user,
        'dashboard' => buildDashboardDataForRole($user['role']),
    ]);
});

Flight::route('GET /api/dashboard/role/@requiredRole', function (string $requiredRole) {
    sendCorsHeaders();

    $requiredRole = strtolower(trim($requiredRole));
    if (!in_array($requiredRole, ['admin', 'instructor', 'learner'], true)) {
        Flight::json(['success' => false, 'error' => 'Unknown role scope'], 400);
        return;
    }

    $user = requireDashboardAccessUser();
    if ($user === null) {
        return;
    }

    if (!userHasRequiredRole($user['role'], $requiredRole)) {
        Flight::json([
            'success' => false,
            'error' => 'Forbidden',
            'requiredRole' => $requiredRole,
            'userRole' => $user['role'],
        ], 403);
        return;
    }

    Flight::json([
        'success' => true,
        'message' => 'Access granted for role-scoped dashboard.',
        'requiredRole' => $requiredRole,
        'user' => $user,
        'dashboard' => buildDashboardDataForRole($requiredRole),
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