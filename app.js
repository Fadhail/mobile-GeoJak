/**
 * GeoFlow Tracker - Advanced Mobile Geolocation Tracking
 * Modern, robust, and well-structured location tracking application
 */

class GeoFlowTracker {
    constructor() {
        // Configuration
        this.config = {
            backendUrl: 'https://k04bfg24-8080.asse.devtunnels.ms/api/v1/tracking/push',
            trackingInterval: (localStorage.getItem('tracking_interval') || 10) * 1000,
            maxDebugLogs: 50,
            geolocationOptions: {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        };

        // State
        this.state = {
            isTracking: false,
            isInitialized: false,
            userId: this.getUserId(),
            sessionCount: parseInt(localStorage.getItem('session_count') || 0),
            locations: [],
            debugLogs: [],
            lastLocation: null,
            lastError: null
        };

        // Tracking
        this.trackingInterval = null;
        this.watchId = null;

        // Initialize
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('%c🚀 GeoFlow Tracker Initializing', 'color: #3498db; font-size: 14px; font-weight: bold;');
        
        this.debug('App started', 'system');
        
        // Setup UI
        this.setupEventListeners();
        this.updateDeviceInfo();
        this.loadConfigFromStorage();
        
        // Check geolocation support
        if (!navigator.geolocation) {
            this.setStatus('❌ Geolocation not supported', 'error');
            this.debug('Geolocation API not available', 'error');
            return;
        }
        
        // Check permissions
        await this.checkPermissions();
        
        this.state.isInitialized = true;
        this.setStatus('✓ Ready to track', 'success');
        this.debug('Initialization complete', 'system');
    }

    /**
     * Check location permissions
     */
    async checkPermissions() {
        if (!navigator.permissions) {
            this.debug('Permissions API not available', 'warning');
            return;
        }

        try {
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            this.updatePermissionStatus(permission.state);
            
            permission.addEventListener('change', () => {
                this.updatePermissionStatus(permission.state);
            });
        } catch (error) {
            this.debug(`Permission check failed: ${error.message}`, 'warning');
        }
    }

    /**
     * Update permission status display
     */
    updatePermissionStatus(state) {
        const el = document.getElementById('permissionStatus');
        if (!el) return;

        const states = {
            'granted': '✓ Granted',
            'denied': '✗ Denied',
            'prompt': '? Prompt'
        };
        
        el.textContent = states[state] || 'Unknown';
        this.debug(`Permission state: ${state}`, 'info');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Control buttons
        document.getElementById('startBtn')?.addEventListener('click', () => this.startTracking());
        document.getElementById('stopBtn')?.addEventListener('click', () => this.stopTracking());
        document.getElementById('clearBtn')?.addEventListener('click', () => this.clearLogs());
        
        // Configuration
        document.getElementById('saveConfigBtn')?.addEventListener('click', () => this.saveConfig());
        
        // Debug
        document.getElementById('clearDebugBtn')?.addEventListener('click', () => this.clearDebug());
    }

    /**
     * Start location tracking
     */
    startTracking() {
        if (this.state.isTracking) {
            this.debug('Tracking already active', 'warning');
            return;
        }

        this.setStatus('🔄 Starting...', 'info');
        this.state.isTracking = true;
        this.state.sessionCount++;
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        
        // Use watchPosition instead of polling with getCurrentPosition
        // watchPosition continuously monitors location without violating browser security
        if (navigator.geolocation) {
            this.watchId = navigator.geolocation.watchPosition(
                (position) => this.onLocationSuccess(position),
                (error) => this.onLocationError(error),
                this.config.geolocationOptions
            );
            
            this.debug('Using watchPosition for continuous tracking', 'info');
        }

        this.debug(`Tracking started (Watch active)`, 'success');
        this.setStatus('🟢 Tracking active', 'success');
        localStorage.setItem('session_count', this.state.sessionCount);
        this.updateSessionCount();
    }

    /**
     * Stop location tracking
     */
    stopTracking() {
        if (!this.state.isTracking) {
            this.debug('Tracking not active', 'warning');
            return;
        }

        // Clear watch position
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
            this.debug('Cleared watchPosition', 'info');
        }

        // Clear interval if it exists
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }

        this.state.isTracking = false;
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        
        this.debug('Tracking stopped', 'info');
        this.setStatus('⏸️ Tracking stopped', 'info');
    }

    /**
     * Get current location
     */
    getLocation() {
        if (!navigator.geolocation) {
            this.debug('Geolocation API not available', 'error');
            return;
        }

        this.debug('Requesting location...', 'info');
        
        navigator.geolocation.getCurrentPosition(
            (position) => this.onLocationSuccess(position),
            (error) => this.onLocationError(error),
            this.config.geolocationOptions
        );
    }

    /**
     * Handle successful location retrieval
     */
    onLocationSuccess(position) {
        const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
        const timestamp = new Date().toISOString();

        const locationData = {
            latitude,
            longitude,
            accuracy,
            altitude,
            heading,
            speed,
            timestamp
        };

        this.state.lastLocation = locationData;
        this.debug(
            `📍 Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracy.toFixed(0)}m)`,
            'success'
        );

        // Update UI
        this.updateLocationDisplay(locationData);
        
        // Send to backend
        this.sendToBackend(locationData);
    }

    /**
     * Handle location retrieval error
     */
    onLocationError(error) {
        const errorMessages = {
            1: '🔒 Permission denied - Enable location access',
            2: '📡 Position unavailable - Check GPS signal',
            3: '⏱️ Location request timeout',
            'default': '❌ Unknown geolocation error'
        };

        const message = errorMessages[error.code] || errorMessages.default;
        this.debug(message, 'error');
        this.setStatus(message, 'error');

        // Don't stop tracking on timeout, but do on permission denial
        if (error.code === 1) {
            this.stopTracking();
        }
    }

    /**
     * Send location data to backend
     */
    async sendToBackend(locationData) {
        const payload = {
            user_id: this.state.userId,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            accuracy: locationData.accuracy,
            timestamp: locationData.timestamp
        };

        try {
            this.debug(`📤 Sending to: ${this.config.backendUrl}`, 'info');
            
            const response = await fetch(this.config.backendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload),
                timeout: 10000 // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.debug(`✅ Data sent successfully (ID: ${data.id})`, 'success');
            
            // Add to local log
            this.addLocationLog(locationData);

        } catch (error) {
            const errorMsg = error.message || 'Unknown error';
            this.debug(`⚠️ Backend error: ${errorMsg}`, 'warning');
            this.debug(`📍 URL: ${this.config.backendUrl}`, 'warning');
            
            // Still add to local log even if backend fails
            this.addLocationLog(locationData);
        }
    }

    /**
     * Update location display in UI
     */
    updateLocationDisplay(data) {
        document.getElementById('currentLat').textContent = data.latitude.toFixed(6);
        document.getElementById('currentLon').textContent = data.longitude.toFixed(6);
        document.getElementById('currentAccuracy').textContent = `${data.accuracy.toFixed(0)}m`;
        document.getElementById('accuracyStatus').textContent = `${data.accuracy.toFixed(0)}m`;
        document.getElementById('currentTime').textContent = new Date(data.timestamp).toLocaleTimeString();
        document.getElementById('lastUpdateTime').textContent = new Date(data.timestamp).toLocaleTimeString();
    }

    /**
     * Add location to log
     */
    addLocationLog(data) {
        this.state.locations.push(data);
        
        const container = document.getElementById('logsContainer');
        if (!container) return;

        // Remove placeholder
        const placeholder = container.querySelector('.logs-placeholder');
        if (placeholder) placeholder.remove();

        // Add entry
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <div class="log-time">${new Date(data.timestamp).toLocaleTimeString()}</div>
            <div class="log-coords">
                <span>📍 ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}</span>
                <span class="log-accuracy">±${data.accuracy.toFixed(0)}m</span>
            </div>
        `;
        
        container.insertBefore(entry, container.firstChild);

        // Limit to 20 entries
        while (container.children.length > 20) {
            container.removeChild(container.lastChild);
        }

        // Update count
        document.getElementById('logCount').textContent = this.state.locations.length;
    }

    /**
     * Clear all logs
     */
    clearLogs() {
        this.state.locations = [];
        const container = document.getElementById('logsContainer');
        if (container) {
            container.innerHTML = '<p class="logs-placeholder">No locations tracked yet</p>';
        }
        document.getElementById('logCount').textContent = '0';
        this.debug('Logs cleared', 'info');
    }

    /**
     * Update device information
     */
    updateDeviceInfo() {
        document.getElementById('userID').textContent = this.state.userId;
        document.getElementById('deviceInfo').textContent = this.getDeviceInfo();
        document.getElementById('sessionCount').textContent = this.state.sessionCount;
    }

    /**
     * Get device information
     */
    getDeviceInfo() {
        const ua = navigator.userAgent;
        if (ua.includes('iPhone')) return 'iPhone';
        if (ua.includes('iPad')) return 'iPad';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('Windows')) return 'Windows';
        if (ua.includes('Mac')) return 'macOS';
        return 'Unknown Device';
    }

    /**
     * Get or create user ID
     */
    getUserId() {
        // Fixed user ID for testing
        const userId = 'user123';
        return userId;
    }

    /**
     * Update session count display
     */
    updateSessionCount() {
        document.getElementById('sessionCount').textContent = this.state.sessionCount;
    }

    /**
     * Set status message
     */
    setStatus(message, type = 'info') {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        
        if (statusText) statusText.textContent = message;
        if (statusDot) {
            statusDot.className = `status-dot status-${type}`;
        }

        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    /**
     * Add debug log
     */
    debug(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const log = `[${timestamp}] ${message}`;
        
        this.state.debugLogs.push({ message, type, timestamp });
        if (this.state.debugLogs.length > this.config.maxDebugLogs) {
            this.state.debugLogs.shift();
        }

        this.updateDebugDisplay();
        console.log(`%c${log}`, this.getDebugStyle(type));
    }

    /**
     * Update debug console display
     */
    updateDebugDisplay() {
        const output = document.getElementById('debugOutput');
        if (!output) return;

        output.innerHTML = this.state.debugLogs
            .map(log => `<div class="debug-line debug-${log.type}">[${log.timestamp}] ${log.message}</div>`)
            .join('');
        
        // Auto scroll to bottom
        output.scrollTop = output.scrollHeight;
    }

    /**
     * Clear debug logs
     */
    clearDebug() {
        this.state.debugLogs = [];
        const output = document.getElementById('debugOutput');
        if (output) output.innerHTML = '';
        this.debug('Debug console cleared', 'info');
    }

    /**
     * Get debug style for console
     */
    getDebugStyle(type) {
        const styles = {
            'info': 'color: #3498db;',
            'success': 'color: #27ae60; font-weight: bold;',
            'warning': 'color: #f39c12; font-weight: bold;',
            'error': 'color: #e74c3c; font-weight: bold;',
            'system': 'color: #95a5a6; font-style: italic;'
        };
        return styles[type] || styles.info;
    }

    /**
     * Load configuration from storage
     */
    loadConfigFromStorage() {
        const url = document.getElementById('backendUrl');
        const interval = document.getElementById('trackingInterval');
        
        if (url) url.value = this.config.backendUrl;
        if (interval) interval.value = this.config.trackingInterval / 1000;
    }

    /**
     * Save configuration
     */
    saveConfig() {
        const url = document.getElementById('backendUrl')?.value;
        const interval = document.getElementById('trackingInterval')?.value;

        if (url) {
            this.config.backendUrl = url;
            localStorage.setItem('backend_url', url);
        }

        if (interval) {
            this.config.trackingInterval = parseInt(interval) * 1000;
            localStorage.setItem('tracking_interval', interval);
        }

        this.debug('Configuration saved', 'success');
        alert('Configuration saved successfully!');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.geoflowTracker = new GeoFlowTracker();
});
