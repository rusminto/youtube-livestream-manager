# YouTube Livestream Manager

This is an automated Node.js service that manages a 24/7 YouTube livestream. It is designed to run continuously, automatically rotating the stream after a configured duration to prevent it from getting too long. It also integrates with OBS and Discord for a fully automated workflow.

This service was written by the [Gemini CLI](https://developers.google.com/gemini/cli).  

Proof that it is works : https://youtu.be/OegbegISPE0?si=t1QD1ZQtFSfU73Wf  

## Main Functionality
- **Autonomous Operation:** Runs as a background script that you can "set and forget".
- **Stream Rotation:** Automatically ends the current YouTube livestream and creates a new one after a configured duration (e.g., 11.5 hours).
- **OBS Integration:** After creating a new stream, it automatically connects to OBS via `obs-websocket` to stop and restart the stream, ensuring it connects to the new broadcast.
- **Discord Notifications:** Sends a formatted message to a Discord webhook with the new stream's link and key after each rotation.
- **Stateful:** Remembers the stream it's managing by using a local `current_livestream.json` file.
- **Configurable:** All important settings, credentials, and message texts are externalized into configuration files.

## Prerequisites
Before you begin, ensure you have the following:
1.  **Node.js** installed (v14 or higher recommended).
2.  **Google Cloud Project** with the YouTube Data API v3 enabled.
3.  **OAuth 2.0 Client ID** credentials downloaded from your Google Cloud project.
4.  **OBS** (Open Broadcaster Software) installed.
5.  **`obs-websocket` Plugin** installed and enabled in OBS. In modern versions of OBS, this is included by default. Go to `Tools -> obs-websocket Settings` to enable it and set a server password.
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
        cp config/credentials.sample.js config/credentials.config.js
        cp config/settings.sample.js config/settings.config.js
        ```
    -   Edit `config/credentials.config.js` and fill in your actual Google, OBS, and Discord credentials.
    -   (Optional) Edit `config/settings.config.js` to customize the stream title, description, Discord message, etc.

4.  **First-Time Authentication (to get `token.json`):**
    -   This application uses OAuth 2.0. You must authorize it once to generate a `token.json` file.
    -   Run the script for the first time: `node index.js`.
    -   The script will see that `token.json` is missing and will print a URL to the console.
    -   Copy this URL, paste it into your browser, and complete the Google login and consent flow.
    -   After authorizing, Google will redirect you to a new URL. Copy the `code` value from the URL query string (it will look like `.../?code=4/0A...`).
    -   You will need to manually use this code to get a token. The easiest way is to temporarily add this to `index.js` and run it once:
        ```javascript
        // Add this to main() in index.js, run once, then remove it
        await google.setToken({ code: 'PASTE_THE_CODE_HERE' });
        ```
    -   Once `token.json` is successfully created, remove the line you added.

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
4.  **Save & Notify:** The new stream's ID and creation time are saved to `current_livestream.json`. The script then triggers the OBS restart and sends a Discord notification.
5.  **Monitoring Loop:** The script enters a loop, checking once every minute.
6.  **Rotation Check:** In each check, it calculates the current stream's age.
7.  **Rotation Execution:** If the age exceeds the configured maximum (e.g., 11.5 hours), the script begins the rotation process:
    -   Ends the old YouTube stream via the API.
    -   Calls the stream creation function again, which creates a new stream, saves its ID, restarts OBS, and sends a new Discord notification.
    -   The loop continues with the new stream's information.
