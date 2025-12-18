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

    const streamKey = stream.cdn.ingestionInfo.streamName;
    const rtmpUrl = stream.cdn.ingestionInfo.ingestionAddress;

    writeManagedStream(streamData);
    console.log(`New stream created. Shareable link: https://www.youtube.com/watch?v=${broadcast.id}`);
    console.log(`Stream key (use in OBS): ${streamKey}`);
    // --- Wait for YouTube to be ready ---
    await google.pollBroadcastReady(broadcast.id);
    // ------------------------------------
    
    // --- OBS Integration ---
    console.log('Attempting to start and verify OBS stream...');
    try {
        await obs.connect();
        
        let isLive = false;
        const maxRetries = 3;
        const retryDelay = 15000; // 15 seconds

        for (let i = 0; i < maxRetries; i++) {
            console.log(`[Attempt ${i + 1}/${maxRetries}] Starting OBS stream...`);
            await obs.restartStream(streamKey, rtmpUrl);

            console.log(`Waiting ${retryDelay / 1000} seconds to verify stream status...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));

            isLive = await google.checkStreamStatus(broadcast.id, 'live');

            if (isLive) {
                console.log('Stream is live!');
                break;
            } else {
                console.log(`Stream is not live after ${retryDelay / 1000} seconds.`);
                if (i < maxRetries - 1) {
                    console.log('Retrying...');
                }
            }
        }

        if (!isLive) {
            console.error('Failed to make the stream live after multiple attempts. Please check OBS and YouTube Studio manually.');
        }

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

    console.log(`Current stream is ${durationHours.toFixed(2)} hours old. (Max: ${settings.youtube.maxLifespanHours})`);

    if (durationHours > settings.youtube.maxLifespanHours) {
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
        
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const code = await new Promise(resolve => {
            readline.question('After authenticating, you will be redirected. Copy the \'code\' from the URL and provide it here: ', resolve);
        });

        readline.close();

        try {
            await google.setToken({ code: code.trim() });
            console.log('Authentication successful! Token saved.');
        } catch (error) {
            console.error('Failed to get token. Please try again.', error.message);
            return;
        }
    }
    
    console.log('Application authenticated successfully. Starting livestream manager.');

    // Run the check immediately on startup
    await manageLivestream();

    // Then, run it on a loop
    setInterval(manageLivestream, settings.youtube.checkIntervalMs);
}

main().catch(console.error);
