// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const chatScreen = document.getElementById('chat-screen');
const startChatBtn = document.getElementById('start-chat');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const chatMessages = document.getElementById('chat-messages');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleAudioBtn = document.getElementById('toggle-audio');
const nextChatBtn = document.getElementById('next-chat');
const loadingScreen = document.getElementById('loading-screen');
const statusMessage = document.getElementById('status-message');

// Global variables
let socket = io();
let peer = null;
let localStream = null;
let currentPeerID = null;

// Media stream options
const mediaConstraints = {
    video: true,
    audio: true
};

// Initialize the application
async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Unable to access camera/microphone. Please check permissions.');
    }
}

// Start chat function
startChatBtn.addEventListener('click', async () => {
    welcomeScreen.classList.remove('active');
    loadingScreen.classList.add('active');
    
    try {
        await init();
        loadingScreen.classList.remove('active');
        chatScreen.classList.add('active');
        socket.emit('queue-join');
        updateStatusMessage('Looking for someone to chat with...');
    } catch (err) {
        loadingScreen.classList.remove('active');
        welcomeScreen.classList.add('active');
        alert('Failed to access camera/microphone. Please check permissions and try again.');
    }
});

// Update status message
function updateStatusMessage(message) {
    statusMessage.textContent = message;
}

// Initialize WebRTC peer connection
function initializePeerConnection(isInitiator) {
    if (peer) {
        peer.destroy();
        peer = null;
    }

    const peerConfig = {
        initiator: isInitiator,
        stream: localStream,
        trickle: true,
        config: {
            iceServers: [
                { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
            ]
        },
        offerOptions: {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        }
    };

    peer = new SimplePeer(peerConfig);

    peer.on('signal', data => {
        socket.emit('peer-signal', {
            signal: data,
            to: currentPeerID
        });
    });

    peer.on('stream', stream => {
        remoteVideo.srcObject = stream;
    });

    peer.on('error', err => {
        console.error('Peer error:', err);
        if (err.code === 'ERR_DATA_CHANNEL') {
            // Ignore data channel errors
            return;
        }
        // For other errors, try to reconnect
        setTimeout(() => {
            if (currentPeerID) {
                initializePeerConnection(isInitiator);
            }
        }, 2000);
    });

    peer.on('close', () => {
        remoteVideo.srcObject = null;
        if (currentPeerID) {
            socket.emit('queue-join');
        }
    });
}

// Handle WebRTC signaling
socket.on('peer-signal', ({ from, signal }) => {
    if (!peer && from) {
        currentPeerID = from;
        initializePeerConnection(false);
    }
    if (peer) {
        peer.signal(signal);
    }
});

// Handle user matching
socket.on('user-matched', (remotePeerID) => {
    currentPeerID = remotePeerID;
    updateStatusMessage('Connected! You can now chat.');
    initializePeerConnection(true);
});

// Handle peer disconnection
socket.on('peer-disconnected', (peerId) => {
    if (peerId === currentPeerID) {
        if (peer) {
            peer.destroy();
            peer = null;
        }
        currentPeerID = null;
        remoteVideo.srcObject = null;
        updateStatusMessage('Partner disconnected. Looking for someone new...');
        socket.emit('queue-join');
    }
});

// Send chat message
sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message && currentPeerID) {
        socket.emit('chat-message', {
            to: currentPeerID,
            message
        });
        addMessageToChat(message, true);
        messageInput.value = '';
    }
});

// Receive chat message
socket.on('chat-message', ({ from, message }) => {
    addMessageToChat(message, false);
});

// Add message to chat container
function addMessageToChat(message, isSent) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', isSent ? 'sent' : 'received');
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Toggle video
toggleVideoBtn.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoBtn.classList.toggle('disabled');
        toggleVideoBtn.querySelector('.label').textContent = videoTrack.enabled ? 'Video' : 'No Video';
    }
});

// Toggle audio
toggleAudioBtn.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioBtn.classList.toggle('disabled');
        toggleAudioBtn.querySelector('.label').textContent = audioTrack.enabled ? 'Audio' : 'Muted';
    }
});

// Next chat functionality
nextChatBtn.addEventListener('click', () => {
    // Show confirmation dialog
    if (currentPeerID && !confirm('Are you sure you want to skip this person?')) {
        return;
    }

    // Clean up current connection
    if (peer) {
        peer.destroy();
        peer = null;
    }
    currentPeerID = null;
    remoteVideo.srcObject = null;

    // Show loading screen
    chatScreen.classList.remove('active');
    loadingScreen.classList.add('active');
    updateStatusMessage('Looking for someone new...');

    // Add a small delay before searching for new partner
    setTimeout(() => {
        socket.emit('queue-join');
    }, 500);
});

// Handle successful connection
socket.on('user-matched', (remotePeerID) => {
    loadingScreen.classList.remove('active');
    chatScreen.classList.add('active');
    currentPeerID = remotePeerID;
    updateStatusMessage('Connected! You can now chat.');
    initializePeerConnection(true);

    // Clear previous chat messages
    chatMessages.innerHTML = '';
    
    // Add system message
    const systemMessage = document.createElement('div');
    systemMessage.classList.add('message', 'system');
    systemMessage.textContent = 'You are now chatting with a stranger. Say hi!';
    chatMessages.appendChild(systemMessage);
});

// Add keyboard shortcut for next
document.addEventListener('keydown', (e) => {
    // Press 'Esc' to skip to next person
    if (e.key === 'Escape' && chatScreen.classList.contains('active')) {
        nextChatBtn.click();
    }
});

// Handle message input
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
    }
});

// Auto-resize message input
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});
