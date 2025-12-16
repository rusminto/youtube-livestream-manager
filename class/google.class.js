const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class _google {

    loginUrl = null
    youtube = null
    tokenPath = path.join(__dirname, '..', 'token.json');

    constructor(config){
        this.oauth2Client = new google.auth.OAuth2(
            config.web.client_id,		// YOUR_CLIENT_ID
            config.web.client_secret,	// YOUR_CLIENT_SECRET
            config.redirectUrl		// YOUR_REDIRECT_URL
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
        const res = await this.youtube.liveBroadcasts.transition({
            part: 'status',
            id: broadcastId,
            broadcastStatus: 'complete'
        });
        return res.data;
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
                    enableAutoStop: true
                }
            }
        });

        const broadcastId = broadcastRes.data.id;

        // Create a reusable stream or a new one each time. For simplicity, we create a new one.
        const streamRes = await this.youtube.liveStreams.insert({
            part: 'snippet,cdn',
            requestBody: {
                snippet: {
                    title: settings.title
                },
                cdn: {
                    resolution: settings.resolution,
                    frameRate: settings.frameRate,
                    ingestionType: 'rtmp'
                }
            }
        });

        const streamId = streamRes.data.id;

        // Bind broadcast to stream
        await this.youtube.liveBroadcasts.bind({
            part: 'id,contentDetails',
            id: broadcastId,
            streamId: streamId
        });

        return { broadcast: broadcastRes.data, stream: streamRes.data };
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
