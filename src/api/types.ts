// Shapes of the WLED JSON API (see wled00/json.cpp in the firmware).

export type Color = [number, number, number, number?]

export interface Segment {
  id: number
  start: number
  stop: number
  startY?: number
  stopY?: number
  len?: number
  grp: number
  spc: number
  of: number
  on: boolean
  frz: boolean
  bri: number
  cct: number
  set: number
  lc: number
  n?: string
  col: Color[]
  fx: number
  sx: number
  ix: number
  pal: number
  c1: number
  c2: number
  c3: number
  sel: boolean
  rev: boolean
  mi: boolean
  rY?: boolean
  mY?: boolean
  tp?: boolean
  o1: boolean
  o2: boolean
  o3: boolean
  si: number
  m12: number
  bm: number
}

export interface State {
  on: boolean
  bri: number
  transition: number
  bs?: number
  ps: number
  pl: number
  ledmap?: number
  nl: { on: boolean; dur: number; mode: number; tbri: number; rem: number }
  udpn: { send: boolean; recv: boolean; sgrp?: number; rgrp?: number }
  lor: number
  mainseg: number
  seg: Segment[]
  error?: number
  AudioReactive?: { on?: boolean }
}

export interface Info {
  ver: string
  vid: number
  cn?: string
  release?: string
  repo?: string
  leds: {
    count: number
    pwr: number
    fps: number
    maxpwr: number
    maxseg: number
    bootps: number
    lc: number
    matrix?: { w: number; h: number }
  }
  name: string
  simplifiedui?: boolean
  live: boolean
  liveseg: number
  lm: string
  lip: string
  ws: number
  fxcount: number
  palcount: number
  cpalcount?: number
  umpalcount?: number
  umpalnames?: string[]
  maps?: { id: number; n?: string }[]
  wifi: { bssid?: string; rssi: number; signal: number; channel: number; ap?: boolean }
  fs: { u: number; t: number; pmt: number }
  ndc: number
  arch: string
  core: string
  clock: number
  flash: number
  lwip?: number
  freeheap: number
  psram?: number
  uptime: number
  time: string
  u?: Record<string, unknown>
  opt: number
  bootloaderSHA256?: string // ESP32
  brand: string
  product: string
  mac: string
  ip: string
}

export interface Playlist {
  ps: number[]
  dur: number[] | number
  transition: number[] | number
  repeat?: number
  r?: boolean
  end?: number
}

export interface Preset {
  n?: string
  ql?: string
  win?: string
  playlist?: Playlist
  [key: string]: unknown
}

export type Presets = Record<string, Preset>

export interface Node {
  name: string
  type: number
  ip: string
  age: number
  vid: number
}

// palx entries: [position, r, g, b], "r" (random) or "c1".."c3" (a color slot)
export type PaletteStop = [number, number, number, number] | string

// A command sent to /json/state or over the WebSocket. Loosely typed on purpose: the API accepts many shapes.
export type Command = Record<string, unknown>
