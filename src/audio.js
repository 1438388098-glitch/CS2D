// 音频模块入口（保持历史 import 路径 './audio.js' 兼容）
export {
  initAudio, setMuted, isMuted, setAudioContext, bindToGame, sfx, uiSfx, syncSpatialAudio, setBusVolume, getBusVolume,
  startAmbient, stopAmbient
} from './audio/master.js';
