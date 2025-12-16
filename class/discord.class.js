const axios = require('axios');

class Discord {
    constructor(config) {
        this.webhookUrl = config.webhookUrl;
    }

    async sendNewStreamNotification(broadcast, stream, settings) {
        if (!this.webhookUrl) {
            console.warn('Discord webhook URL not configured. Skipping notification.');
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${broadcast.id}`;
        const streamKey = stream.cdn.ingestionInfo.streamName;

        const embed = {
            title: settings.embed.title,
            description: settings.embed.description,
            color: settings.embed.color,
            fields: [
                {
                    name: 'Stream Title',
                    value: broadcast.snippet.title,
                    inline: false
                },
                {
                    name: 'Shareable Link',
                    value: `[Click Here to Watch](${videoUrl})`,
                    inline: true
                },
                {
                    name: 'OBS Stream Key',
                    value: `\`${streamKey}\``,
                    inline: true
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'YouTube Stream Manager'
            }
        };

        const payload = {
            username: settings.botName,
            embeds: [embed]
        };

        try {
            console.log('Sending notification to Discord...');
            await axios.post(this.webhookUrl, payload);
            console.log('Discord notification sent successfully.');
        } catch (error) {
            console.error('Failed to send Discord notification:', error.message);
        }
    }
}

module.exports = Discord;
