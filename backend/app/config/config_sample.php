<?php

// ---------------------------------------------------------------------------
// Google OAuth2
// ---------------------------------------------------------------------------
// Your Google OAuth2 client ID from https://console.cloud.google.com/
define('GOOGLE_CLIENT_ID', 'YOUR_GOOGLE_CLIENT_ID_HERE');

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------
// Secret used to sign session JWTs.  Must be a long, random string in production.
// The APP_JWT_SECRET environment variable takes precedence when set.
define('JWT_SECRET', 'change-this-to-a-long-random-secret');
// Token lifetime in seconds (default: 1 hour)
define('JWT_TTL_SECONDS', 3600);

// ---------------------------------------------------------------------------
// CORS — trusted frontend origins
// ---------------------------------------------------------------------------
define('ALLOWED_ORIGINS', [
    'http://localhost:4200',
]);

// ---------------------------------------------------------------------------
// RBAC — role assignment by e-mail address (lowercase)
// ---------------------------------------------------------------------------
// Users whose e-mail appears in ROLE_ADMIN_EMAILS receive the 'admin' role.
define('ROLE_ADMIN_EMAILS', [
    'admin@example.com',
]);

// Users whose e-mail appears in ROLE_INSTRUCTOR_EMAILS receive the 'instructor' role.
// All other authenticated users receive the 'learner' role.
define('ROLE_INSTRUCTOR_EMAILS', [
    'instructor@example.com',
]);
// Debugger::enable(Debugger::DEVELOPMENT) // sometimes you have to be explicit (also Debugger::PRODUCTION)
// Debugger::enable('23.75.345.200'); // you can also provide an array of IP addresses
Debugger::$logDirectory = __DIR__ . $ds . 'log';
Debugger::$strictMode = true; // display all errors
// Debugger::$strictMode = E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED; // all errors except deprecated notices
if (Debugger::$showBar && php_sapi_name() !== 'cli') {
    $app->set('flight.content_length', false); // if Debugger bar is visible, then content-length can not be set by Flight
	(new TracyExtensionLoader($app));
}

/* 
 * This is where you will store database credentials, api credentials
 * and other sensitive information. This file will not be tracked by git
 * as you shouldn't be pushing sensitive information to a public or private
 * repository.
 * 
 * What you store here is totally up to you.
 * 
 * P.S. When you require a php file and that file returns an array, the array
 * will be returned by the require statement where you can assign it to a var.
 * Ex: $config = require('config.php');
 */
return [
	'database' => [
		// uncomment the below 4 lines for mysql
		// 'host' => 'localhost',
		// 'dbname' => 'dbname',
		// 'user' => 'user',
		// 'password' => 'password'

		// uncomment the following line for sqlite
		// 'file_path' => __DIR__ . $ds . '..' . $ds . 'database.sqlite'
	],

	// this is just here for an example
	// 'google_oauth' => [
	// 	'client_id' => 'client_id',
	// 	'client_secret' => 'client_secret',
	// 	'redirect_uri' => 'redirect_uri'
	// ],
];
