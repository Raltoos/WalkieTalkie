import React, { useEffect, useRef, useState } from "react";
import Peer from "peerjs";

export default function Walkie() {
  const [myId, setMyId] = useState("");
  const [remoteId, setRemoteId] = useState("");
  const [connected, setConnected] = useState(false);
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    // Create PeerJS client that connects to PeerServer Cloud by default
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => setMyId(id));

    peer.on("call", (incoming) => {
      // Auto-answer incoming calls (walkie-style)
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          incoming.answer(stream);
          callRef.current = incoming;
          setConnected(true);

          incoming.on("stream", (remoteStream) => {
            if (remoteAudioRef.current)
              remoteAudioRef.current.srcObject = remoteStream;
          });

          incoming.on("close", () => cleanupLocal());
        })
        .catch((err) => alert("Microphone permission is required"));
    });

    peer.on("error", (err) => console.error("Peer error", err));

    return () => {
      peer.destroy();
      cleanupLocal();
    };
  }, []);

  function cleanupLocal() {
    setConnected(false);
    if (callRef.current) callRef.current.close();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    callRef.current = null;
  }

  async function startTalking() {
    if (!remoteId) return alert("Enter remote ID");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      // make an outbound call
      const call = peerRef.current.call(remoteId, stream);
      callRef.current = call;
      setConnected(true);

      call.on("stream", (remoteStream) => {
        if (remoteAudioRef.current)
          remoteAudioRef.current.srcObject = remoteStream;
      });

      call.on("close", cleanupLocal);
      call.on("error", cleanupLocal);
    } catch (err) {
      alert("Microphone access required");
    }
  }

  function stopTalking() {
    cleanupLocal();
  }

  return (
    <div className="walkie">
      <div>
        <strong>Your ID:</strong> <code>{myId || "starting..."}</code>
      </div>
      <div style={{ marginTop: 8 }}>
        <input
          placeholder="Remote peer ID"
          value={remoteId}
          onChange={(e) => setRemoteId(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
        >
          {connected ? "Talking (hold)" : "Hold to talk"}
        </button>
        <button
          style={{ marginLeft: 10 }}
          onClick={() => {
            peerRef.current.disconnect();
            peerRef.current.reconnect();
          }}
        >
          Reconnect
        </button>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />

      <p style={{ marginTop: 12 }}>
        Share your ID with one friend. They paste it and hold the button to
        talk. Works peer-to-peer using PeerJS Cloud and public STUN servers.
      </p>
    </div>
  );
}
