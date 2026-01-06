const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class _google {

    loginUrl = null
    youtube = null
    tokenPath = path.join(__dirname, '..', 'token.json');

    constructor(config){
        this.oauth2Client = new google.auth.OAuth2(
            config.web.client_id,        // YOUR_CLIENT_ID
            config.web.client_secret,    // YOUR_CLIENT_SECRET
            config.redirectUrl        // YOUR_REDIRECT_URL
        );

        this.loadToken();

        const scopes = [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/youtube'
        ];

        this.loginUrl = this.oauth2Client.generateAuthUrl({
            // 'online' (default) or 'offline' (gets refresh_token)
            access_type: 'offline',

            // If you only need one scope you can pass it as a string
            scope: scopes
        });

        this.oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
              // store the refresh_token in my database!
              console.log("REFRESH", tokens.refresh_token);
            }
            console.log("TOKEN", tokens.access_token);
            this.saveToken(this.oauth2Client.credentials);
        });

        this.youtube = google.youtube({
            version: 'v3',
            auth: this.oauth2Client
        });


    }

    async setToken({
        code
    }){
        const {tokens} = await this.oauth2Client.getToken(code)
        this.oauth2Client.setCredentials(tokens);
        this.saveToken(this.oauth2Client.credentials);
        return this.oauth2Client.credentials;

    }


    getProfile(){
        const oauth2 = google.oauth2({
            auth: this.oauth2Client,
            version: 'v2'
        });

        return new Promise((resolve) => {
            oauth2.userinfo.get( (err, res) => {
                if (err) {
                   return resolve(err)
                } else {
                   return resolve(res)
                }
            });
        })
    }

    async endLivestream(broadcastId) {
        // First, get the broadcast's status
        const broadcastRes = await this.youtube.liveBroadcasts.list({
            part: 'status',
            id: broadcastId
        });

        if (!broadcastRes.data.items || broadcastRes.data.items.length === 0) {
            console.log(`Broadcast ${broadcastId} not found. Cannot end it.`);
            return;
        }

        const broadcast = broadcastRes.data.items[0];
        const status = broadcast.status.lifeCycleStatus;

        console.log(`Broadcast ${broadcastId} has status: ${status}.`);

        // If the stream is live or was testing, end it
        if (status === 'live' || status === 'testing') {
            console.log(`Transitioning broadcast ${broadcastId} to complete...`);
            const res = await this.youtube.liveBroadcasts.transition({
                part: 'status',
                id: broadcastId,
                broadcastStatus: 'complete'
            });
            return res.data;
        }
        // If the stream was created but never went live, delete it
        else if (status === 'created' || status === 'ready') {
            console.log(`Deleting broadcast ${broadcastId} because it never went live.`);
            await this.youtube.liveBroadcasts.delete({
                id: broadcastId
            });
            console.log(`Broadcast ${broadcastId} deleted.`);
            return;
        }
        else {
            console.log(`Broadcast ${broadcastId} is in status '${status}' and cannot be ended or deleted by this script.`);
        }
    }


    async findOrCreateLiveStream(settings) {
        // Check if a stream with the same title already exists
        const streamList = await this.youtube.liveStreams.list({
            part: 'id,snippet',
            mine: true
        });

        const existingStream = streamList.data.items.find(
            (stream) => stream.snippet.title === settings.title
        );

        if (existingStream) {
            console.log(`Found existing stream: ${existingStream.id}`);

            const streamRes = await this.youtube.liveStreams.list({
                part: 'snippet,cdn,status',
                id: existingStream.id
            });

            return streamRes.data.items[0];
        } else {
            // Create a new stream if one doesn't exist
            const streamRes = await this.youtube.liveStreams.insert({
                part: 'snippet,cdn,status',
                requestBody: {
                    snippet: {
                        title: settings.title
                    },
                    cdn: {
                        frameRate: settings.frameRate,
                        ingestionType: 'rtmp',
                        resolution: settings.resolution
                    },
                    status: {
                        streamStatus: 'active'
                    }
                }
            });

            console.log(`Created new stream: ${streamRes.data.id}`);
            return streamRes.data;
        }
    }

    async createLivestream(settings) {
        // Create broadcast
        const broadcastRes = await this.youtube.liveBroadcasts.insert({
            part: 'snippet,status,contentDetails',
            requestBody: {
                snippet: {
                    title: settings.title,
                    description: settings.description,
                    scheduledStartTime: new Date().toISOString()
                },
                status: {
                    privacyStatus: settings.privacyStatus
                },
                contentDetails: {
                    enableAutoStart: true,

                    // set autoStop to *true*, if it's really desired
                    enableAutoStop: settings.autoStop === true,

                    selfDeclaredMadeForKids: settings.selfDeclaredMadeForKids,
                    latencyPreference: settings.latencyPreference
                }

            }
        });

        const broadcastId = broadcastRes.data.id;
        const streamData = await this.findOrCreateLiveStream(settings);

        // Bind broadcast to stream
        await this.youtube.liveBroadcasts.bind({
            part: 'id,contentDetails',
            id: broadcastId,
            streamId: streamData.id
        });

        if (settings.ageRestriction) {
            try {
                console.log(`Attempting to set age restriction for video ${broadcastId}...`);
                await this.youtube.videos.update({
                    part: 'status',
                    requestBody: {
                        id: broadcastId,
                        status: {
                            selfDeclaredMadeForKids: false,
                            ageGated: true
                        }
                    }
                });
                console.log('Successfully set age restriction.');
            } catch (error) {
                console.error('Could not set age restriction.', error.message);
            }
        }

        return { broadcast: broadcastRes.data, stream: streamData };
    }


    async checkStreamStatus(broadcastId, expectedStatus) {
        try {
            const res = await this.youtube.liveBroadcasts.list({
                part: 'status',
                id: broadcastId,
            });

            const broadcast = res.data.items[0];

            if (broadcast) {
                console.log(`Current broadcast status: ${broadcast.status.lifeCycleStatus}. Expected: ${expectedStatus}`);
                return broadcast.status.lifeCycleStatus === expectedStatus;
            } else {
                console.log('Broadcast not found.');
                return false;
            }
        } catch (error) {
            console.error('Error checking broadcast status:', error.message);
            return false;
        }
    }

    async pollBroadcastReady(broadcastId) {
        const BIND_TIMEOUT_MS = 60 * 1000;
        const BIND_CHECK_INTERVAL_MS = 2 * 1000;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkStatus = async () => {
                if (Date.now() - startTime > BIND_TIMEOUT_MS) {
                    return reject(new Error('Timed out waiting for broadcast to be ready.'));
                }

                try {
                    const res = await this.youtube.liveBroadcasts.list({
                        part: 'status',
                        id: broadcastId,
                    });

                    const broadcast = res.data.items[0];

                    if (broadcast && broadcast.status.lifeCycleStatus === 'ready') {
                        console.log('Broadcast is ready to receive stream.');
                        return resolve();
                    } else {
                        console.log(`Broadcast not ready yet (status: ${broadcast ? broadcast.status.lifeCycleStatus : 'unknown'}). Retrying...`);
                        setTimeout(checkStatus, BIND_CHECK_INTERVAL_MS);
                    }
                } catch (error) {
                    console.error('Error checking broadcast status:', error.message);
                    setTimeout(checkStatus, BIND_CHECK_INTERVAL_MS);
                }
            };

            checkStatus();
        });
    }

    saveToken(tokens) {
        fs.writeFileSync(this.tokenPath, JSON.stringify(tokens));
        console.log('Token stored to', this.tokenPath);
    }

    loadToken() {
        if (fs.existsSync(this.tokenPath)) {
            const tokens = JSON.parse(fs.readFileSync(this.tokenPath));
            this.oauth2Client.setCredentials(tokens);
            console.log('Token loaded from', this.tokenPath);
            return true;
        }
        return false;
    }

    isAuthenticated() {
        return !!this.oauth2Client.credentials.access_token;
    }
}

module.exports = _google
