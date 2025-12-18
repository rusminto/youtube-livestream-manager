# YouTube Livestream Manager

This is an automated Node.js service that manages a 24/7 YouTube livestream. It is designed to run continuously, automatically rotating the stream after a configured duration to prevent it from getting too long. It also integrates with OBS and Discord for a fully automated workflow.

This service was written by the [Gemini CLI](https://developers.google.com/gemini/cli).

Proof that it is works : https://youtu.be/noWdeCu_DsM

## Main Functionality
- **Autonomous Operation:** Runs as a background script that you can "set and forget".
- **Stream Rotation:** Automatically ends the current YouTube livestream and creates a new one after a configured duration (e.g., 11.5 hours).
- **Intelligent Stream Management:**
    - If a stream was live, it will be properly **ended**.
    - If a stream was created but never went live (stuck in a "forthcoming" state), it will be automatically **deleted** to prevent clutter on your YouTube channel.
- **Resilient OBS Integration:**
    - Automatically connects to OBS via `obs-websocket` to set the correct stream key and server.
    - Restarts the stream to ensure it connects to the new broadcast.
    - Includes a **retry mechanism** to verify that the stream is live and will re-restart the OBS stream if it fails to connect on the first attempt.
- **Discord Notifications:** Sends a formatted message to a Discord webhook with the new stream's link and key after each rotation.
- **Stateful:** Remembers the stream it's managing by using a local `current_livestream.json` file.
- **Configurable:** All important settings, credentials, and message texts are externalized into configuration files.

## Prerequisites
Before you begin, ensure you have the following:
1.  **Node.js** installed (v16 or higher recommended).
2.  **Google Cloud Project** with the YouTube Data API v3 enabled.
3.  **OAuth 2.0 Client ID** credentials downloaded from your Google Cloud project.
4.  **OBS** (Open Broadcaster Software) installed.
5.  **`obs-websocket` Plugin** installed and enabled in OBS. In modern versions of OBS, this is included by default. Go to `Tools -> WebSocket Server Settings` to enable it and set a server password.
6.  **A Discord Webhook URL** for the channel where you want to receive notifications.

## Setup & Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/rusminto/youtube-livestream-manager.git
    cd youtube-livestream-manager
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Create Configuration Files:**
    -   Copy the sample configuration files.
        ```bash
        cp config/credentials.config.sample.js config/credentials.config.js
        cp config/settings.config.sample.js config/settings.config.js
        ```
    -   Edit `config/credentials.config.js` and fill in your actual Google, OBS, and Discord credentials. **Important:** The `redirectUrl` in this file must match one of the "Authorized redirect URIs" you set in your Google Cloud Console for the OAuth 2.0 Client ID.
    -   (Optional) Edit `config/settings.config.js` to customize the stream title, description, Discord message, etc.

4.  **First-Time Authentication (to get `token.json`):**
    -   This application uses OAuth 2.0. You must authorize it once to generate a `token.json` file that stores the authentication credentials.
    -   Run the script for the first time from your terminal:
        ```bash
        node index.js
        ```
    -   The script will detect that no token exists and will print an authorization URL to the console.
    -   Copy this URL, paste it into your browser, and complete the Google login and consent flow.
    -   After authorizing, your browser will be redirected to the `redirectUrl` you configured (e.g., `http://localhost:3000/auth/google`). The URL in your browser's address bar will contain a `code` parameter. It will look something like this: `?code=4/0A...&scope=...`
    -   The script will now be waiting for input in your terminal. Copy the **entire code value** from the URL (make sure to get the full value, it can be long) and paste it into the terminal, then press Enter.
    -   The script will use this code to fetch the token, save it as `token.json`, and then continue running. You only need to do this once.

## How to Use
Once setup is complete, simply run the service from your terminal:
```bash
node index.js
```
The script will now run continuously. You can use a process manager like `pm2` or `screen` to keep it running in the background on a server.

## Program Flow
1.  **Initialization:** The script starts and checks for a valid `token.json` to authenticate with Google.
2.  **State Check:** It looks for a `current_livestream.json` file.
3.  **Stream Creation (if needed):** If no `current_livestream.json` is found, the script assumes it's a first run. It calls the YouTube API to create a new **unlisted** livestream.
4.  **Pre-Stream Checks:** The script waits for YouTube to confirm the new broadcast is ready to receive a stream.
5.  **OBS Connection & Verification:** The script connects to OBS, sets the correct stream key, and starts the stream. It then enters a retry loop, checking every 15 seconds to ensure the stream is `live`. If it's not, it will restart the OBS stream up to 3 times.
6.  **Save & Notify:** The new stream's ID and creation time are saved to `current_livestream.json`, and a notification is sent to Discord.
7.  **Monitoring Loop:** The script enters a loop, checking once every minute.
8.  **Rotation Check:** In each check, it calculates the current stream's age.
9.  **Rotation Execution:** If the age exceeds the configured maximum, the script begins the rotation process:
    -   It intelligently ends or deletes the old YouTube stream via the API.
    -   Calls the stream creation function again, which creates a new stream, verifies the OBS connection, saves its ID, and sends a new Discord notification.
    -   The loop continues with the new stream's information.