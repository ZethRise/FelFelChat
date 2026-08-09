'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import Sidebar from '@/components/Sidebar';
import ChatView from '@/components/ChatView';
import VoiceCall from '@/components/VoiceCall';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '@/lib/animations';
import { applyNoiseSuppression, cleanupNoiseSuppression } from '@/lib/noiseSuppression';

interface Room {
  id: string;
  name: string;
  type: string;
  profilePhotoUrl?: string | null;
  members: { user: { id: string; username: string; displayName: string | null; lastSeen: string } }[];
  messages: { text: string | null; user: { username: string }; createdAt: string }[];
  _count: { messages: number; members: number };
  unreadCount?: number;
}

interface CallState {
  status: 'idle' | 'ringing' | 'incoming' | 'active';
  logId?: string;
  callerId?: string;
  calleeId?: string;
  callerName?: string;
  calleeName?: string;
}

interface MessageNewPayload {
  roomId?: string;
  message?: {
    id: string;
    userId: string;
    text?: string | null;
    fileUrl?: string | null;
    createdAt?: string;
    user?: { username?: string };
    username?: string;
  };
}

type CallSignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

interface CallSignalPayload {
  fromUserId: string;
  signal: CallSignalData;
}

interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function isIceServerConfig(value: unknown): value is IceServerConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const maybe = value as Record<string, unknown>;
  const urls = maybe.urls;
  if (typeof urls === 'string') {
    return true;
  }
  if (Array.isArray(urls)) {
    return urls.every((item) => typeof item === 'string');
  }
  return false;
}

function getConfiguredIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const rawJson = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS;
  if (rawJson && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isIceServerConfig(item)) {
            servers.push({
              urls: item.urls,
              username: item.username,
              credential: item.credential,
            });
          }
        }
      }
    } catch (error) {
      console.error('Invalid NEXT_PUBLIC_WEBRTC_ICE_SERVERS:', error);
    }
  }
  if (servers.length > 0) {
    return servers;
  }
  // Default: Google STUN + free Open Relay TURN (TCP + TLS fallback)
  servers.push({ urls: 'stun:stun.l.google.com:19302' });
  servers.push({ urls: 'stun:stun1.l.google.com:19302' });
  servers.push({
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  });
  servers.push({
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  });
  servers.push({
    urls: 'turns:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  });
  return servers;
}

const configuredIceServers = getConfiguredIceServers();

function hasTurnServerConfigured(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => typeof url === 'string' && (url.startsWith('turn:') || url.startsWith('turns:')));
  });
}

const turnServerConfigured = hasTurnServerConfigured(configuredIceServers);

export default function ChatPage() {
  const { user, loading, logout } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<'all' | 'private' | 'group'>('all');
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [callState, setCallState] = useState<CallState>({ status: 'idle' });
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const pendingOutgoingCancelRef = useRef(false);
  const roomsRef = useRef<Room[]>([]);
  const callStateRef = useRef<CallState>({ status: 'idle' });
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activePeerUserIdRef = useRef<string | null>(null);
  const offerSentLogIdRef = useRef<string | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectionFailureHandledRef = useRef(false);
  const brandLogoSrc = '/favicon.ico';

  // Close sidebar on mobile when clicking outside
  const closeSidebarOnMobile = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // Browser tab title badge
  useEffect(() => {
    const total = Object.values(unreadByRoom).reduce((sum, n) => sum + n, 0);
    document.title = total > 0 ? `(${total}) FelFel Chat` : 'FelFel Chat';
  }, [unreadByRoom]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const cleanupCallMedia = useCallback(() => {
    console.log('[WebRTC] Cleaning up call media');
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.onicecandidateerror = null;
      peerConnectionRef.current.onicegatheringstatechange = null;
      peerConnectionRef.current.onnegotiationneeded = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    cleanupNoiseSuppression();
    if (remoteStreamRef.current) {
      remoteStreamRef.current = new MediaStream();
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingIceCandidatesRef.current = [];
    activePeerUserIdRef.current = null;
    offerSentLogIdRef.current = null;
    connectionFailureHandledRef.current = false;
    setIsCallMuted(false);
    setAudioPlaybackBlocked(false);
  }, []);

  const tryPlayRemoteAudio = useCallback(async () => {
    const audioElement = remoteAudioRef.current;
    if (!audioElement || !audioElement.srcObject) {
      return;
    }
    try {
      await audioElement.play();
      setAudioPlaybackBlocked(false);
      console.log('[WebRTC] Remote audio playing');
    } catch (error) {
      console.warn('[WebRTC] Remote audio autoplay blocked:', error);
      setAudioPlaybackBlocked(true);
    }
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices are not available');
    }
    const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // Apply RNNoise noise suppression
    try {
      const processedStream = await applyNoiseSuppression(rawStream);
      console.log('[Call] Noise suppression active');
      localStreamRef.current = processedStream;
    } catch (err) {
      console.warn('[Call] Noise suppression unavailable, using raw audio:', err);
      localStreamRef.current = rawStream;
    }
    setIsCallMuted(false);
    return localStreamRef.current;
  }, []);

  const flushPendingIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) {
      console.warn('[WebRTC] Cannot flush ICE candidates — no remote description');
      return;
    }
    const queued = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];
    console.log('[WebRTC] Flushing', queued.length, 'pending ICE candidates');
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn('[WebRTC] Failed to add buffered ICE candidate:', error);
      }
    }
  }, []);

  const ensurePeerConnection = useCallback((targetUserId: string) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }
    const pc = new RTCPeerConnection({
      iceServers: configuredIceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
    });
    activePeerUserIdRef.current = targetUserId;
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', pc.connectionState);
      if (pc.connectionState === 'failed' && !connectionFailureHandledRef.current) {
        connectionFailureHandledRef.current = true;
        const reason = turnServerConfigured
          ? 'Call connection failed on current network.'
          : 'Call connection failed. Network may be blocking peer-to-peer connections.';
        alert(reason);
      }
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate || !activePeerUserIdRef.current) {
        return;
      }
      console.log('[WebRTC] ICE candidate:', event.candidate.type, event.candidate.protocol);
      const socket = getSocket();
      socket.emit('call:signal', {
        targetUserId: activePeerUserIdRef.current,
        signal: { type: 'ice-candidate', candidate: event.candidate.toJSON() },
      });
    };
    pc.onicecandidateerror = (event) => {
      console.warn('[WebRTC] ICE candidate error:', event.errorCode, event.errorText);
    };
    pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] iceGatheringState:', pc.iceGatheringState);
    };
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.warn('[WebRTC] ICE connection failed, restarting...');
        pc.restartIce();
      }
      if (pc.iceConnectionState === 'disconnected') {
        console.warn('[WebRTC] ICE disconnected');
      }
    };
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track:', event.track.kind, 'streams:', event.streams?.length);
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
      } else {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(event.track);
      }
      if (remoteAudioRef.current && remoteStreamRef.current) {
        if (remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
          remoteAudioRef.current.srcObject = remoteStreamRef.current;
          console.log('[WebRTC] Set remote audio srcObject');
        }
      }
      void tryPlayRemoteAudio();
    };
    pc.onnegotiationneeded = () => {
      console.log('[WebRTC] negotiationneeded — renegotiation required');
    };
    peerConnectionRef.current = pc;
    return pc;
  }, [tryPlayRemoteAudio]);

  const ensureAudioTrackBound = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('[WebRTC] No audio tracks in stream');
      return;
    }
    const existingSenders = pc.getSenders().filter((s) => s.track?.kind === 'audio');
    if (existingSenders.length > 0) {
      // Re-bind if track ended or different
      const currentTrack = existingSenders[0].track;
      const freshTrack = audioTracks[0];
      if (currentTrack && currentTrack.readyState === 'ended' && freshTrack) {
        console.log('[WebRTC] Replacing ended audio track');
        existingSenders[0].replaceTrack(freshTrack);
      }
      return;
    }
    for (const track of audioTracks) {
      console.log('[WebRTC] Adding audio track:', track.label);
      pc.addTrack(track, stream);
    }
  }, []);

  const setupActiveCallMedia = useCallback(async (targetUserId: string, shouldCreateOffer: boolean, logId?: string) => {
    console.log('[WebRTC] setupActiveCallMedia:', { targetUserId, shouldCreateOffer, logId });
    const stream = await ensureLocalStream();
    console.log('[WebRTC] Local stream tracks:', stream.getTracks().map((t) => `${t.kind}:${t.label}`).join(', '));
    const pc = ensurePeerConnection(targetUserId);
    ensureAudioTrackBound(pc, stream);
    console.log('[WebRTC] PeerConnection senders:', pc.getSenders().map((s) => `${s.track?.kind}:${s.track?.label}`).join(', '));
    if (shouldCreateOffer && logId && offerSentLogIdRef.current !== logId) {
      console.log('[WebRTC] Creating and sending offer');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const socket = getSocket();
      socket.emit('call:signal', {
        targetUserId,
        signal: { type: 'offer', sdp: offer },
      });
      offerSentLogIdRef.current = logId;
      console.log('[WebRTC] Offer sent');
    } else {
      console.log('[WebRTC] Not creating offer (callee or already sent)');
    }
  }, [ensureAudioTrackBound, ensureLocalStream, ensurePeerConnection]);

  const handleCallSignal = useCallback(async ({ fromUserId, signal }: CallSignalPayload) => {
    const currentCall = callStateRef.current;
    if (currentCall.status === 'idle') {
      console.warn('[WebRTC] Ignoring signal — call is idle');
      return;
    }
    console.log('[WebRTC] Received signal:', signal.type, 'from', fromUserId);
    try {
      const stream = await ensureLocalStream();
      const pc = ensurePeerConnection(fromUserId);
      if (signal.type === 'offer') {
        // CRITICAL: setRemoteDescription BEFORE adding tracks
        // Adding tracks first causes the SDP answer to miss audio media lines
        console.log('[WebRTC] Setting remote description (offer)');
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        console.log('[WebRTC] Flushing', pendingIceCandidatesRef.current.length, 'pending ICE candidates');
        await flushPendingIceCandidates(pc);
        // Now add tracks — they'll be included in the answer's SDP
        ensureAudioTrackBound(pc, stream);
        console.log('[WebRTC] Creating answer');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('[WebRTC] Sending answer');
        const socket = getSocket();
        socket.emit('call:signal', {
          targetUserId: fromUserId,
          signal: { type: 'answer', sdp: answer },
        });
        return;
      }
      if (signal.type === 'answer') {
        ensureAudioTrackBound(pc, stream);
        console.log('[WebRTC] Setting remote description (answer)');
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        console.log('[WebRTC] Flushing', pendingIceCandidatesRef.current.length, 'pending ICE candidates');
        await flushPendingIceCandidates(pc);
        return;
      }
      if (signal.type === 'ice-candidate') {
        if (pc.remoteDescription) {
          console.log('[WebRTC] Adding ICE candidate directly');
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          console.log('[WebRTC] Buffering ICE candidate (no remote description yet)');
          pendingIceCandidatesRef.current.push(signal.candidate);
        }
      }
    } catch (error) {
      console.error('[WebRTC] Failed to handle signal:', error);
    }
  }, [ensureAudioTrackBound, ensureLocalStream, ensurePeerConnection, flushPendingIceCandidates]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const nextMuted = !isCallMuted;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setIsCallMuted(nextMuted);
  }, [isCallMuted]);

  const resumeAudioPlayback = useCallback(() => {
    void tryPlayRemoteAudio();
  }, [tryPlayRemoteAudio]);

  useEffect(() => {
    const updateViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(true);
      }
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const hasLoadedRoomsRef = useRef(false);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    if (!hasLoadedRoomsRef.current) {
      setRoomsLoading(true);
    }
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.rooms) {
        setRooms(data.rooms);
        hasLoadedRoomsRef.current = true;
        // Hydrate unread counts from server
        const counts: Record<string, number> = {};
        for (const room of data.rooms) {
          if (room.unreadCount && room.unreadCount > 0) {
            counts[room.id] = room.unreadCount;
          }
        }
        setUnreadByRoom(counts);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  // Initialize socket
  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();

    const handleUserOnline = (userId: string) => {
      setOnlineUsers((prev) => new Set(prev).add(userId));
    };

    const handleUserOffline = (userId: string) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleConnectError = (error: Error & { data?: unknown }) => {
      console.error('Socket connect error:', error.message, error.data);
    };

    const handleMessageNew = (payload?: MessageNewPayload) => {
      if (payload?.roomId && payload?.message && payload.message.userId !== user.id && payload.roomId !== activeRoomId) {
        const roomId = payload.roomId;
        setUnreadByRoom((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || 0) + 1,
        }));
      }
      if (!payload?.roomId || !payload.message) {
        return;
      }
      const roomId = payload.roomId;
      const message = payload.message;
      const roomExists = roomsRef.current.some((room) => room.id === roomId);
      if (!roomExists) {
        void fetchRooms();
        return;
      }
      setRooms((prev) => {
        const roomIndex = prev.findIndex((room) => room.id === roomId);
        if (roomIndex < 0) {
          return prev;
        }
        const room = prev[roomIndex];
        const username = message.user?.username || message.username || room.messages[0]?.user.username || 'system';
        const previewText = message.text ?? null;
        const previewCreatedAt = message.createdAt || new Date().toISOString();
        const updatedRoom: Room = {
          ...room,
          messages: [{ text: previewText, user: { username }, createdAt: previewCreatedAt }],
          _count: room._count,
        };
        const next = [...prev];
        next.splice(roomIndex, 1);
        next.unshift(updatedRoom);
        return next;
      });
    };

    const handleRoomNew = () => {
      void fetchRooms();
    };

    const handleCallIncoming = ({ callerId, callerName, logId }: { callerId: string; callerName: string; logId: string }) => {
      cleanupCallMedia();
      const nextState: CallState = { status: 'incoming', callerId, callerName, calleeId: user.id, logId };
      callStateRef.current = nextState;
      setCallState(nextState);
    };

    const handleCallInitiated = ({ logId, calleeId }: { logId: string; calleeId: string }) => {
      if (pendingOutgoingCancelRef.current) {
        pendingOutgoingCancelRef.current = false;
        const cancelSocket = getSocket();
        cancelSocket.emit('call:end', { logId });
        return;
      }
      setCallState((prev) => {
        if (prev.status !== 'ringing') {
          return prev;
        }
        if (prev.calleeId && prev.calleeId !== calleeId) {
          return prev;
        }
        const nextState: CallState = { ...prev, logId };
        callStateRef.current = nextState;
        return nextState;
      });
    };

    const handleCallAccepted = ({ logId }: { logId: string }) => {
      setCallState((prev) => {
        if (prev.status === 'idle') {
          return prev;
        }
        const nextState: CallState = { ...prev, status: 'active', logId };
        callStateRef.current = nextState;
        return nextState;
      });
    };

    const handleCallEnded = () => {
      pendingOutgoingCancelRef.current = false;
      cleanupCallMedia();
      callStateRef.current = { status: 'idle' };
      setCallState({ status: 'idle' });
    };

    const handleCallError = (msg: string) => {
      pendingOutgoingCancelRef.current = false;
      cleanupCallMedia();
      alert(msg);
      callStateRef.current = { status: 'idle' };
      setCallState({ status: 'idle' });
    };

    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleMessageNew);
    socket.on('room:new', handleRoomNew);
    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:initiated', handleCallInitiated);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:signal', handleCallSignal);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:error', handleCallError);

    const initialFetchTimer = setTimeout(() => {
      void fetchRooms();
    }, 0);

    return () => {
      clearTimeout(initialFetchTimer);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleMessageNew);
      socket.off('room:new', handleRoomNew);
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:initiated', handleCallInitiated);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:signal', handleCallSignal);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:error', handleCallError);
      cleanupCallMedia();
      disconnectSocket();
    };
  }, [user, fetchRooms, activeRoomId, cleanupCallMedia, handleCallSignal]);

  // Start a call
  const startCall = useCallback(async (calleeId: string, calleeName: string) => {
    if (!user) {
      return;
    }
    pendingOutgoingCancelRef.current = false;
    cleanupCallMedia();
    try {
      await ensureLocalStream();
    } catch (error) {
      console.error('Failed to access microphone:', error);
      alert('Microphone permission is required for voice calls.');
      cleanupCallMedia();
      return;
    }
    const socket = getSocket();
    socket.emit('call:initiate', { calleeId });
    const nextState: CallState = { status: 'ringing', callerId: user.id, calleeId, calleeName };
    callStateRef.current = nextState;
    setCallState(nextState);
  }, [cleanupCallMedia, ensureLocalStream, user]);

  const acceptCall = useCallback(async () => {
    if (callState.logId && user) {
      try {
        await ensureLocalStream();
      } catch (error) {
        console.error('Failed to access microphone:', error);
        alert('Microphone permission is required for voice calls.');
        cleanupCallMedia();
        return;
      }
      const socket = getSocket();
      socket.emit('call:accept', { logId: callState.logId });
      setCallState((prev) => {
        const nextState: CallState = { ...prev, status: 'active', calleeId: user.id };
        callStateRef.current = nextState;
        return nextState;
      });
    }
  }, [callState.logId, cleanupCallMedia, ensureLocalStream, user]);

  const rejectCall = useCallback(() => {
    const logId = callState.logId;
    pendingOutgoingCancelRef.current = false;
    cleanupCallMedia();
    callStateRef.current = { status: 'idle' };
    setCallState({ status: 'idle' });
    if (logId) {
      const socket = getSocket();
      socket.emit('call:reject', { logId });
    }
  }, [callState.logId, cleanupCallMedia]);

  const endCall = useCallback(() => {
    const logId = callState.logId;
    const shouldQueueCancel = callState.status === 'ringing' && !logId;
    cleanupCallMedia();
    callStateRef.current = { status: 'idle' };
    setCallState({ status: 'idle' });
    if (shouldQueueCancel) {
      pendingOutgoingCancelRef.current = true;
      return;
    }
    pendingOutgoingCancelRef.current = false;
    if (logId) {
      const socket = getSocket();
      socket.emit('call:end', { logId });
    }
  }, [callState.logId, callState.status, cleanupCallMedia]);

  useEffect(() => {
    if (!user || callState.status !== 'active' || !callState.logId) {
      return;
    }
    const targetUserId = callState.callerId === user.id ? callState.calleeId : callState.callerId;
    if (!targetUserId) {
      return;
    }
    let disposed = false;
    const shouldCreateOffer = callState.callerId === user.id;
    const run = async () => {
      try {
        await setupActiveCallMedia(targetUserId, shouldCreateOffer, callState.logId);
      } catch (error) {
        if (disposed) {
          return;
        }
        console.error('Failed to start call media:', error);
        alert('Microphone permission is required for voice calls.');
        cleanupCallMedia();
        callStateRef.current = { status: 'idle' };
        setCallState({ status: 'idle' });
        const socket = getSocket();
        socket.emit('call:end', { logId: callState.logId });
      }
    };
    void run();
    return () => {
      disposed = true;
    };
  }, [
    callState.calleeId,
    callState.callerId,
    callState.logId,
    callState.status,
    cleanupCallMedia,
    setupActiveCallMedia,
    user,
  ]);

  useEffect(() => {
    return () => {
      cleanupCallMedia();
    };
  }, [cleanupCallMedia]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.replace('/login');
    }
    return null;
  }

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  // For private chats, get the other user's name
  const getPrivateRoomName = (room: Room) => {
    if (room.type !== 'PRIVATE') return room.name;
    const other = room.members.find((m) => m.user.id !== user.id);
    return other?.user.displayName || other?.user.username || room.name;
  };

  // Filter rooms by folder
  const filteredRooms = rooms.filter((room) => {
    if (activeFolder === 'all') return true;
    if (activeFolder === 'private') return room.type === 'PRIVATE';
    if (activeFolder === 'group') return room.type === 'GROUP' || room.type === 'CHANNEL';
    return true;
  });

  const selectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setUnreadByRoom((prev) => {
      if (!prev[roomId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    // Mark room as read on server
    fetch(`/api/rooms/${roomId}/read`, { method: 'POST' }).catch(() => {});
    const socket = getSocket();
    socket.emit('room:read', { roomId });
    closeSidebarOnMobile();
  };

  return (
    <div className="app-shell" style={{ direction: dir }}>
      {/* Backdrop for nav panel */}
      {navOpen && isMobile && (
        <div
          onClick={() => setNavOpen(false)}
          className="app-backdrop"
        />
      )}

      {/* Navigation Panel (Hamburger Menu) */}
      {isMobile && (
        <div
          className="mobile-nav-panel"
          data-open={navOpen}
        >
          <div className="mobile-nav-header">
            <div className="mobile-nav-user">
              <div
                className="avatar"
                style={{ background: user.avatarUrl ? 'transparent' : '#3b82f6' }}
              >
                {user.displayName?.charAt(0)?.toUpperCase() || user.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{user.displayName || user.username}</div>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>@{user.username}</div>
              </div>
            </div>
          </div>
          <button className="mobile-nav-item" onClick={() => { setNavOpen(false); }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {t('settings.title') || 'Profile'}
          </button>
          <button className="mobile-nav-item" onClick={() => { setNavOpen(false); window.location.href = '/settings'; }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            {t('settings.appearance') || 'Settings'}
          </button>
          {user.isSuperAdmin && (
            <button className="mobile-nav-item" onClick={() => { setNavOpen(false); window.location.href = '/admin'; }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              {t('admin.panel') || 'Admin'}
            </button>
          )}
          <div className="mobile-nav-divider" />
          <button className="mobile-nav-item" onClick={() => { setNavOpen(false); logout(); }} style={{ color: 'var(--danger)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {t('auth.logout') || 'Logout'}
          </button>
        </div>
      )}

      {/* Sidebar = Chat List (full screen on mobile) */}
      <div
        className="app-sidebar-shell"
        data-has-room={isMobile ? !!activeRoomId : undefined}
        style={isMobile ? {} : {
          width: 'var(--sidebar-width)',
          minWidth: 'var(--sidebar-width)',
        }}
      >
        <Sidebar
          user={user}
          rooms={isMobile ? filteredRooms : rooms}
          roomsLoading={roomsLoading}
          unreadByRoom={unreadByRoom}
          activeRoomId={activeRoomId}
          onlineUsers={onlineUsers}
          onSelectRoom={selectRoom}
          onRoomsChange={fetchRooms}
          onCloseRoom={async (roomId: string) => {
            setRooms((prev) => prev.filter((r) => r.id !== roomId));
            if (activeRoomId === roomId) setActiveRoomId(null);
            try {
              await fetch(`/api/rooms/${roomId}/members`, { method: 'DELETE' });
            } catch (err) {
              console.error('Failed to close room:', err);
              void fetchRooms();
            }
          }}
          onLogout={logout}
          t={t}
          locale={locale}
          setLocale={setLocale}
          getPrivateRoomName={getPrivateRoomName}
          isMobile={isMobile}
          onOpenNav={() => setNavOpen(true)}
          activeFolder={activeFolder}
          onFolderChange={setActiveFolder}
        />
      </div>

      {/* Main Chat Area */}
      <div
        className="app-main-shell"
        data-active={isMobile ? !!activeRoomId : undefined}
      >
        {activeRoom ? (
          <ChatView
            room={activeRoom}
            user={user}
            onlineUsers={onlineUsers}
            onToggleSidebar={() => {
              if (isMobile) {
                setActiveRoomId(null);
              } else {
                setSidebarOpen((prev) => !prev);
              }
            }}
            onCloseRoom={() => {
              if (activeRoomId) {
                setRooms((prev) => prev.filter((r) => r.id !== activeRoomId));
                fetch(`/api/rooms/${activeRoomId}/members`, { method: 'DELETE' }).catch(() => {});
                setActiveRoomId(null);
              }
            }}
            onMessageSent={(roomId, text, fileUrl) => {
              setRooms((prev) => {
                const idx = prev.findIndex((r) => r.id === roomId);
                if (idx < 0) return prev;
                const room = prev[idx];
                const username = user.username;
                const previewText = text || (fileUrl ? fileUrl.split('/').pop() || '📎' : null);
                const now = new Date().toISOString();
                const updated: Room = {
                  ...room,
                  messages: [{ text: previewText, user: { username }, createdAt: now }],
                  _count: room._count,
                };
                const next = [...prev];
                next.splice(idx, 1);
                next.unshift(updated);
                return next;
              });
            }}
            onStartCall={startCall}
            t={t}
            dir={dir}
            roomDisplayName={getPrivateRoomName(activeRoom)}
            isMobile={isMobile}
          />
        ) : (
          <div className={isMobile ? 'mobile-empty-state' : ''} style={isMobile ? { color: 'var(--fg-muted)' } : { flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)' }}>
            {isMobile ? (
              <div className="mobile-empty-state-content" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                <Image
                  src={brandLogoSrc}
                  alt={t('app.name')}
                  width={120}
                  height={36}
                  unoptimized
                  style={{ width: 'min(120px, 40vw)', height: 'auto', objectFit: 'contain', opacity: 0.6 }}
                />
                <p style={{ fontSize: 15 }}>{t('chat.selectChat')}</p>
              </div>
            ) : (
              <div className="card" style={{ width: 'min(440px, calc(100vw - 48px))', minHeight: 420, textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center', alignContent: 'center' }}>
                <Image
                  src={brandLogoSrc}
                  alt={t('app.name')}
                  width={280}
                  height={84}
                  unoptimized
                  style={{ width: 'min(280px, 72vw)', height: 'auto', objectFit: 'contain' }}
                />
                <p>{t('chat.selectChat')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Voice Call Overlay */}
      {callState.status !== 'idle' && (
        <VoiceCall
          status={callState.status}
          callerName={callState.callerName}
          calleeName={callState.calleeName}
          isMuted={isCallMuted}
          audioPlaybackBlocked={audioPlaybackBlocked}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onResumeAudio={resumeAudioPlayback}
          t={t}
        />
      )}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} />
    </div>
  );
}
