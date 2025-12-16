const fs = require('fs');
const path = require('path');
const Google = require('./class/google.class.js');
const OBS = require('./class/obs.class.js');
const Discord = require('./class/discord.class.js');
const credentials = require('./config/credentials.config.js');
const settings = require('./config/settings.config.js');

const google = new Google(credentials.google);
const obs = new OBS(credentials.obs);
const discord = new Discord(credentials.discord);
const MANAGED_STREAM_PATH = path.join(__dirname, 'current_livestream.json');
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const MAX_LIFESPAN_HOURS = 11.5;

function readManagedStream() {
    if (fs.existsSync(MANAGED_STREAM_PATH)) {
        const content = fs.readFileSync(MANAGED_STREAM_PATH, 'utf-8');
        return JSON.parse(content);
    }
    return null;
}

function writeManagedStream(streamData) {
    fs.writeFileSync(MANAGED_STREAM_PATH, JSON.stringify(streamData, null, 2));
}

async function createAndSaveNewStream() {
    console.log('Creating a new unlisted livestream...');
    const { broadcast, stream } = await google.createLivestream(settings.youtube);
    
    const streamData = {
        broadcastId: broadcast.id,
        createdAt: new Date().toISOString()
    };

    writeManagedStream(streamData);
    console.log(`New stream created. Shareable link: https://www.youtube.com/watch?v=${broadcast.id}`);
    console.log(`Stream key (use in OBS): ${stream.cdn.ingestionInfo.streamName}`);
    
    // --- OBS Integration ---
    console.log('Attempting to restart OBS stream...');
    try {
        await obs.connect();
        await obs.restartStream();
    } catch (error) {
        console.error('Could not restart OBS stream. Please do it manually.', error.message);
    } finally {
        await obs.disconnect();
    }
    // ---------------------

    // --- Discord Notification ---
    await discord.sendNewStreamNotification(broadcast, stream, settings.discord);
    // --------------------------

    return streamData;
}

async function manageLivestream() {
    console.log('Checking livestream status...');
    let managedStream = readManagedStream();

    if (!managedStream) {
        console.log('No managed stream found.');
        managedStream = await createAndSaveNewStream();
    }

    const createdAt = new Date(managedStream.createdAt);
    const now = new Date();
    const durationHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    console.log(`Current stream is ${durationHours.toFixed(2)} hours old. (Max: ${MAX_LIFESPAN_HOURS})`);

    if (durationHours > MAX_LIFESPAN_HOURS) {
        console.log('Stream has exceeded its maximum lifespan. Rotating...');
        try {
            await google.endLivestream(managedStream.broadcastId);
            console.log(`Successfully ended stream ${managedStream.broadcastId}.`);
        } catch (error) {
            console.error(`Failed to end stream ${managedStream.broadcastId}. It might have been ended manually.`, error.message);
        }
        await createAndSaveNewStream();
    }
}


async function main() {
    // Check if authenticated, if not, the constructor helper will guide the user.
    if (!google.isAuthenticated()) {
        console.log('Application is not authenticated.');
        console.log(`Please visit this URL to authenticate: ${google.loginUrl}`);
        console.log('After authenticating, you will be redirected. Copy the \'code\' from the URL and provide it here.');
        
        // This part requires manual intervention since we have no web server.
        // The user would need to paste the code, or we'd need a web server just for auth.
        // For now, we assume the token.json exists or will be created manually.
        console.log('Please ensure token.json is present before running the service.');
        return; // Stop if not authenticated.
    }
    
    console.log('Application authenticated successfully. Starting livestream manager.');

    // Run the check immediately on startup
    await manageLivestream();

    // Then, run it on a loop
    setInterval(manageLivestream, CHECK_INTERVAL_MS);
}

main().catch(console.error);
