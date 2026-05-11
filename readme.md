# Google One Tap Prototype

This project now includes:

- Angular frontend that triggers Google One Tap prompt.
- FlightPHP backend that verifies the Google ID token and creates a PHP session.
- A simple authorized page showing the signed-in user's name.

## Google Client ID (Web)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 Client ID for Web application.
3. Add `http://localhost:4200` to the list of authorized JavaScript origins.
4. Note the Client ID for use in the frontend.

## Local Run

1. Start backend:
 - `cd backend`
 - `php -S localhost:8000 -t public`
2. Start frontend:
 - `cd frontend`
 - `npm install`
 - `npm start`
3. Open `http://localhost:4200`

## Notes

- Backend CORS is currently set for `http://localhost:4200`.
- Do not commit OAuth client secrets into the repository.
