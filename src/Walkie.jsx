import React, { useEffect, useRef, useState } from "react";
import Peer from "peerjs";

const LS_ID = "walkie-peer-id";
const LS_FRIENDS = "walkie-friends";

function loadFriends() {
  try {
    return JSON.parse(localStorage.getItem(LS_FRIENDS) || "[]");
  } catch {
    return [];
  }
}
function saveFriends(list) {
  localStorage.setItem(LS_FRIENDS, JSON.stringify(list));
}

export default function Walkie() {
  // UI / state
  const [myId, setMyId] = useState("");
  const [remoteId, setRemoteId] = useState("");
  const [friends, setFriends] = useState(loadFriends());
  const [friendName, setFriendName] = useState("");
  const [friendId, setFriendId] = useState("");

  const [connected, setConnected] = useState(false);
  const [talking, setTalking] = useState(false); // true => mic track enabled

  // refs
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const wakeLockRef = useRef(null);

  // ---- Audio helpers ----
  function userGestureUnlock() {
    // Resume AudioContext + try play to satisfy autoplay policies
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current?.state === "suspended")
        audioCtxRef.current.resume();
    } catch {}
    remoteAudioRef.current?.play?.().catch(() => {});
  }

  async function ensureMic() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    // default to muted until user toggles on
    stream.getAudioTracks().forEach((t) => {
      t.enabled = talking;
    });
    localStreamRef.current = stream;
    return stream;
  }

  // ---- Wake Lock (keep screen on while app is foreground) ----
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {}
  }
  function releaseWakeLock() {
    try {
      wakeLockRef.current?.release?.();
      wakeLockRef.current = null;
    } catch {}
  }

  // ---- Peer lifecycle ----
  useEffect(() => {
    let storedId = localStorage.getItem(LS_ID);
    const peer = storedId ? new Peer(storedId) : new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setMyId(id);
      if (!storedId) localStorage.setItem(LS_ID, id);
    });

    peer.on("call", async (incoming) => {
      // Auto-route voice to whoever connects to me
      try {
        userGestureUnlock();
        const stream = await ensureMic();
        // if already on a call, end it (single peer only)
        if (callRef.current && callRef.current !== incoming) {
          callRef.current.close();
        }
        incoming.answer(stream);
        callRef.current = incoming;
        setConnected(true);
        setRemoteId(incoming.peer);
        // auto-enable mic when someone connects
        setTalking(true);
        stream.getAudioTracks().forEach((t) => (t.enabled = true));

        incoming.on("stream", (rs) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = rs;
            remoteAudioRef.current.play?.().catch(() => {});
          }
        });
        incoming.on("close", endCall);
        incoming.on("error", endCall);
      } catch (err) {
        alert(
          "Microphone permission is required. Check site settings and reload."
        );
      }
    });

    peer.on("disconnected", () => {
      try {
        peer.reconnect();
      } catch {}
    });
    peer.on("error", (err) => console.error("Peer error", err));

    // Keep peer alive when tab regains focus
    const onVis = () => {
      if (document.visibilityState === "visible") {
        userGestureUnlock();
        requestWakeLock();
        try {
          peer.reconnect();
        } catch {}
      } else {
        releaseWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      peer.destroy();
      endCall();
      releaseWakeLock();
      audioCtxRef.current?.close?.();
    };
  }, []);

  function endCall() {
    setConnected(false);
    setTalking(false);
    if (callRef.current) callRef.current.close();
    callRef.current = null;
    // keep local mic for instant resume; DO NOT stop tracks here
  }

  // Start (or reuse) a call to current remoteId
  async function startOrReuseCall() {
    if (!remoteId) return alert("Pick a friend or enter an ID");
    userGestureUnlock();
    const stream = await ensureMic();
    if (!callRef.current) {
      const call = peerRef.current.call(remoteId, stream);
      callRef.current = call;
      setConnected(true);
      call.on("stream", (rs) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = rs;
          remoteAudioRef.current.play?.().catch(() => {});
        }
      });
      call.on("close", endCall);
      call.on("error", endCall);
    }
    // enable mic (talk)
    setTalking(true);
    stream.getAudioTracks().forEach((t) => (t.enabled = true));
  }

  // Toggle talk without dropping the call (mute/unmute mic track)
  async function toggleTalk() {
    if (!connected || !callRef.current) {
      await startOrReuseCall();
      return;
    }
    const stream = await ensureMic();
    const next = !talking;
    setTalking(next);
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
  }

  function hangUp() {
    endCall();
  }

  // Friends
  function addFriend() {
    if (!friendName.trim() || !friendId.trim()) return;
    const list = [...friends, { name: friendName.trim(), id: friendId.trim() }];
    setFriends(list);
    saveFriends(list);
    setFriendName("");
    setFriendId("");
  }
  function removeFriend(id) {
    const list = friends.filter((f) => f.id !== id);
    setFriends(list);
    saveFriends(list);
  }
  function connectTo(id) {
    setRemoteId(id);
    startOrReuseCall();
  }

  return (
    <div
      className="walkie"
      onMouseDown={userGestureUnlock}
      onTouchStart={userGestureUnlock}
    >
      {/* Header card */}
      <div className="card header">
        <div className="idblock">
          <div className="label">Your ID</div>
          <div className="id">{myId || "starting..."}</div>
        </div>
        <button
          className="chip"
          onClick={() => navigator.clipboard?.writeText(myId)}
          disabled={!myId}
        >
          Copy
        </button>
      </div>

      {/* Friend picker */}
      <div className="card">
        <div className="row">
          <input
            className="input"
            placeholder="Remote ID"
            value={remoteId}
            onChange={(e) => setRemoteId(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="btn" onClick={startOrReuseCall}>
            Connect
          </button>
        </div>
        <div className="subrow">
          <input
            className="input"
            placeholder="Friend name"
            value={friendName}
            onChange={(e) => setFriendName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Friend ID"
            value={friendId}
            onChange={(e) => setFriendId(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="btn ghost" onClick={addFriend}>
            Save
          </button>
        </div>
        {friends.length > 0 && (
          <div className="friends">
            {friends.map((f) => (
              <div key={f.id} className="friend">
                <button className="pill" onClick={() => connectTo(f.id)}>
                  {f.name}
                </button>
                <button
                  className="x"
                  title="Remove"
                  onClick={() => removeFriend(f.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Big talk controls */}
      <div className="card center">
        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "Connected" : "Idle"}
        </div>
        <button
          className={`talkbtn ${talking ? "live" : ""}`}
          onClick={toggleTalk}
        >
          {talking ? "Talking" : "Talk"}
        </button>
        <div className="controls">
          <button className="btn ghost" onClick={hangUp} disabled={!connected}>
            Hang up
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              peerRef.current?.disconnect();
              peerRef.current?.reconnect();
            }}
          >
            Reconnect
          </button>
        </div>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}
