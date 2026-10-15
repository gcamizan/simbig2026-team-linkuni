// Where the selection tool gets its data. Change these two values when the Runpod
// endpoints exist (e.g. "https://<runpod-host>/audio/" and ".../index.json").
// Local development uses scripts/dev_server.py, which serves both from this machine.
window.SELECT_CONFIG = {
  INDEX_URL: "data/index.json",
  AUDIO_BASE_URL: "/corpus-audio/",
};
