import React from "react";
import Walkie from "./Walkie";

export default function App() {
  return (
    <div className="app">
      <h1>Walkie PWA — Peer-to-peer (2 users)</h1>
      <Walkie />
      <p className="note">
        Install as PWA for home-screen shortcut. Works best with modern mobile
        browsers (Chrome/Android).
      </p>
    </div>
  );
}
