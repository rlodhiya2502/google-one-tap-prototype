<?php
// Ensure you have downloaded the flight directory to your cPanel hosting
require 'flight/Flight.php';

// Handle CORS for local testing (Angular and PHP often run on different ports locally).
// You can restrict the Access-Control-Allow-Origin header in production.
Flight::route('OPTIONS /*', function() {
    Flight::response()->header('Access-Control-Allow-Origin', '*');
    Flight::response()->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    Flight::response()->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    Flight::stop(200);
});

// The authentication endpoint
Flight::route('POST /api/auth', function(){
    Flight::response()->header('Access-Control-Allow-Origin', '*');

    // Retrieve the JSON payload sent by Angular
    $data = Flight::request()->data;
    $token = $data->token;

    if (!$token) {
        Flight::json(['error' => 'No token provided'], 400);
        return;
    }

    // Verify the token. 
    // Using Google's tokeninfo endpoint is a practical, dependency-free approach for shared cPanel hosting.
    $url = "https://oauth2.googleapis.com/tokeninfo?id_token=" . $token;
    
    // Suppress warnings with @ in case the token is completely invalid and Google returns a 400 error
    $response = @file_get_contents($url);

    if ($response === false) {
         Flight::json(['error' => 'Failed to verify token with Google'], 401);
         return;
    }

    $userData = json_decode($response, true);

    // Check for errors returned by Google
    if (isset($userData['error'])) {
         Flight::json(['error' => 'Invalid token'], 401);
         return;
    }

    // Security Note: In a production environment, you MUST verify that 
    // $userData['aud'] exactly matches your Google Client ID here.
    // if ($userData['aud'] !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') { ... }

    // At this point, the user is verified. You would typically create a PHP session
    // or issue your own application-specific JWT here.

    Flight::json([
        'success' => true,
        'message' => 'User authenticated successfully',
        'user' => [
            'name' => $userData['name'] ?? '',
            'email' => $userData['email'] ?? '',
            'picture' => $userData['picture'] ?? ''
        ]
    ]);
});

Flight::start();
?>