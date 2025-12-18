module.exports = {
    youtube: {
        title: 'My Managed Livestream',
        description: 'This stream is managed by an automated script.',
        privacyStatus: 'unlisted',
        resolution: '720p',
        frameRate: '30fps',
        maxLifespanHours: 11.5,
        checkIntervalMs: 60000
    },
    discord: {
        botName: 'YouTube Stream Bot',
        embed: {
            title: 'YouTube Stream Rotated Successfully',
            description: 'A new unlisted livestream has been created and is ready for broadcast.',
            color: 0x00FF00 // Green
        }
    }
};
