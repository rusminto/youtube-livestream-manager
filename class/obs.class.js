const OBSWebSocket = require('obs-websocket-js').default;

class OBS {
    constructor(config) {
        this.obs = new OBSWebSocket();
        this.config = config;
        this.connected = false;
    }

    async connect() {
        if (this.connected) return;
        try {
            await this.obs.connect(this.config.address, this.config.password);
            console.log('Connected to OBS WebSocket');
            this.connected = true;
        } catch (error) {
            console.error('Failed to connect to OBS WebSocket:', error.message);
            throw error; // Re-throw to be handled by the caller
        }
    }

    async disconnect() {
        if (!this.connected) return;
        await this.obs.disconnect();
        console.log('Disconnected from OBS WebSocket');
        this.connected = false;
    }

    async restartStream() {
        if (!this.connected) {
            throw new Error('Not connected to OBS. Cannot restart stream.');
        }

        try {
            const { outputActive } = await this.obs.call('GetStreamStatus');
            if (outputActive) {
                console.log('OBS stream is active. Restarting...');
                await this.obs.call('StopStream');
                // Wait a moment for OBS to stop gracefully
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds
                await this.obs.call('StartStream');
                console.log('OBS stream restarted.');
            } else {
                console.log('OBS stream is not active. Starting it...');
                await this.obs.call('StartStream');
                console.log('OBS stream started.');
            }
        } catch (error) {
            console.error('Error controlling OBS stream:', error.message);
            // Don't re-throw here, as failing to control OBS shouldn't stop the whole YouTube script
        }
    }
}

module.exports = OBS;
