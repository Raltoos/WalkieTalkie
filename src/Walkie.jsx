// src/Walkie.jsx
import React, { useEffect, useRef, useState } from "react";
import Peer from "peerjs";

// Helpers
function makePersistentId() {
  const k = "walkie-id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    localStorage.setItem(k, id);
  }
  return id;
}

export default function Walkie() {
  const [myId, setMyId] = useState("");
  const [remoteId, setRemoteId] = useState("");
  const [connected, setConnected] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const firstGestureDoneRef = useRef(false);

  // Ensure AudioContext is resumed on first user gesture (fixes autoplay issues)
  function resumeAudio() {
    if (firstGestureDoneRef.current) return;
    firstGestureDoneRef.current = true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") ctx.resume();
      }
    } catch {
      /* ignore */
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.play?.().catch(() => {});
    }
  }

  // Get/reuse microphone once, instead of every press
  async function ensureMicStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    localStreamRef.current = stream;
    return stream;
  }

  useEffect(() => {
    const persistentId = makePersistentId();
    const createPeer = (id) => new Peer(id);
    let peer = createPeer(persistentId);
    peerRef.current = peer;

    peer.on("open", (id) => setMyId(id));

    // If the chosen id is taken (e.g., another install), generate a suffix and retry
    peer.on("error", (err) => {
      console.error("Peer error", err);
      if (err?.type === "unavailable-id") {
        const newId =
          persistentId + "-" + Math.random().toString(36).slice(2, 6);
        localStorage.setItem("walkie-id", newId);
        peerRef.current?.destroy();
        peer = new Peer(newId);
        peerRef.current = peer;
        peer.on("open", (id) => setMyId(id));
        attachCallHandlers(peer);
      }
    });

    function attachCallHandlers(p) {
      p.on("call", async (incoming) => {
        resumeAudio();
        try {
          const stream = await ensureMicStream();
          incoming.answer(stream);
          callRef.current = incoming;
          setConnected(true);

          incoming.on("stream", (remoteStream) => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStream;
              remoteAudioRef.current.play?.().catch(() => {});
            }
          });

          incoming.on("close", () => endCall());
          incoming.on("error", () => endCall());
        } catch (err) {
          alert("Microphone permission is required");
        }
      });

      p.on("disconnected", () => {
        try {
          p.reconnect();
        } catch {
          /* noop */
        }
      });
    }

    attachCallHandlers(peer);

    return () => {
      peer.destroy();
      endCall();
      audioCtxRef.current?.close?.();
    };
  }, []);

  function endCall() {
    setConnected(false);
    setTransmitting(false);
    if (callRef.current) callRef.current.close();
    callRef.current = null;
    // Keep mic stream for quicker re-call; do not stop tracks here.
  }

  async function startTalking() {
    if (!remoteId) return alert("Enter remote ID");
    resumeAudio();
    try {
      const stream = await ensureMicStream();
      const call = peerRef.current.call(remoteId, stream);
      callRef.current = call;
      setConnected(true);
      setTransmitting(true);

      call.on("stream", (remoteStream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play?.().catch(() => {});
        }
      });

      call.on("close", endCall);
      call.on("error", endCall);
    } catch (err) {
      alert("Microphone access required");
    }
  }

  function toggleTalking() {
    if (transmitting) {
      endCall();
    } else {
      startTalking();
    }
  }

  function copyMyId() {
    navigator.clipboard?.writeText(myId);
  }

  return (
    <div
      className="walkie"
      onMouseDown={resumeAudio}
      onTouchStart={resumeAudio}
    >
      <div className="row">
        <strong>Your ID:</strong>{" "}
        <code className="unselectable">{myId || "starting..."}</code>
        <button className="btn sm" onClick={copyMyId} disabled={!myId}>
          Copy
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <input
          placeholder="Remote peer ID"
          value={remoteId}
          onChange={(e) => setRemoteId(e.target.value)}
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>

      <div style={{ marginTop: 12 }} className="controls">
        <button
          className={`btn talk ${transmitting ? "active" : ""}`}
          onClick={toggleTalking}
          onMouseDown={(e) => e.preventDefault()} // avoid selection on long-press
        >
          {transmitting
            ? "Stop talking"
            : connected
            ? "Connected — Talk"
            : "Talk"}
        </button>
        <button
          className="btn"
          onClick={() => {
            peerRef.current?.disconnect();
            peerRef.current?.reconnect();
          }}
        >
          Reconnect
        </button>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />

      <p style={{ marginTop: 12 }}>
        IDs persist on this device. Share once with a friend. Tap “Talk” to
        toggle your mic on/off. Uses PeerJS Cloud and public STUN.
      </p>
    </div>
  );
}
