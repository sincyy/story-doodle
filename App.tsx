import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Pressable,
  Animated,
  Easing,
  Modal,
  PanResponder,
  useWindowDimensions,
  FlatList,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import Svg, { Path, Circle } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
// İkon FONTU (vektör): her boyutta keskin görünür. Expo ile birlikte gelir.
// Yüklü değilse: npx expo install @expo/vector-icons
import { MaterialCommunityIcons } from '@expo/vector-icons';

const BACKEND_URL = 'http://192.168.1.2:8000';
const BACKGROUND_MUSIC_URL = 'https://raw.githubusercontent.com/AsadNoul/sleep-tracker-sounds/main/lullaby.mp3';
const PAGE_FLIP_SOUND_URL = 'https://actions.google.com/sounds/v1/household/page_turn.ogg';
const STORAGE_KEY = '@story_doodle_saved_books_v7';
const SETTINGS_KEY = '@story_doodle_user_settings_v1';

const INTRO_DURATION_MS = 6500; // Animasyon sahnesi otomatik geçiş süresi

const EXPANDED_PALETTE = [
  { id: '1', color: '#000000', name: 'Siyah' },
  { id: '2', color: '#1E1B4B', name: 'Gece Mavisi' },
  { id: '3', color: '#EF4444', name: 'Kırmızı' },
  { id: '4', color: '#F97316', name: 'Turuncu' },
  { id: '5', color: '#F59E0B', name: 'Altın Sarı' },
  { id: '6', color: '#10B981', name: 'Orman Yeşili' },
  { id: '7', color: '#06B6D4', name: 'Turkuaz' },
  { id: '8', color: '#3B82F6', name: 'Gök Mavi' },
  { id: '9', color: '#8B5CF6', name: 'Lavanta Mor' },
  { id: '10', color: '#EC4899', name: 'Fuşya Pembe' },
  { id: '11', color: '#854D0E', name: 'Kahve' },
  { id: '12', color: '#64748B', name: 'Gri' },
];

type ToolType = 'pen' | 'crayon' | 'magic' | 'eraser';
type AnimType = 'zipla' | 'ileri_geri' | 'sallan' | 'donme' | 'nefes_al' | 'yuz' | 'duman';

interface PathData {
  d: string;
  color: string;
  width: number;
  opacity: number;
}

interface EffectPoint {
  x: number;
  y: number;
}

interface StoryPart {
  karakter_adi: string;
  karakter_tanimi: string;
  masal_basligi: string;
  bolum_metni: string;
  sahne_img_url?: string;
  secilen_yol_metni?: string;
  secenek_1: string;
  secenek_1_emoji?: string;
  secenek_1_img_url?: string;
  secenek_2: string;
  secenek_2_emoji?: string;
  secenek_2_img_url?: string;
  is_final: boolean;
  audio_base64?: string;
  animasyon_tipi?: AnimType;
  efekt_noktasi?: EffectPoint | null;
  nesne_turu?: string;
}

interface SavedBook {
  id: string;
  title: string;
  date: string;
  coverImage: string | null;
  characterName: string;
  history: StoryPart[];
}

interface NarratorProfile {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  tag: string;
  color: string;
  border: string;
}

const NARRATORS: NarratorProfile[] = [
  { id: 'storyteller', name: 'Barış Abi', nameEn: 'Storyteller Leo', icon: '🎙️', tag: 'Radyo Masalcısı', color: '#FEF3C7', border: '#F59E0B' },
  { id: 'fairy', name: 'Peri Masalcı', nameEn: 'Fairy Luna', icon: '🧚‍♀️', tag: 'Tatlı Kadın Sesi', color: '#FCE7F3', border: '#EC4899' },
  { id: 'chipmunk', name: 'Sincap Fındık', nameEn: 'Nutty Squirrel', icon: '🐿️', tag: 'Afacan Çizgi Film', color: '#FFEDD5', border: '#F97316' },
  { id: 'robot', name: 'Robot BipBop', nameEn: 'BeepBop Robot', icon: '🤖', tag: 'Gelecekten Bip!', color: '#E0F2FE', border: '#0284C7' },
  { id: 'dragon', name: 'Dino & Ejder', nameEn: 'Draco Giant', icon: '🐲', tag: 'Heybetli Dev', color: '#DCFCE7', border: '#10B981' },
  { id: 'wise', name: 'Bilge Dede', nameEn: 'Wise Wizard', icon: '🧙‍♂️', tag: 'Sakin İhtiyar', color: '#EDE9FE', border: '#8B5CF6' },
];

/* ------------------------------------------------------------------ */
/*  HAZIR ŞABLONLAR: NOKTA NOKTA ÇİZİM MOTORU                          */
/* ------------------------------------------------------------------ */

interface Pt { x: number; y: number; }
interface Stroke { dots: Pt[]; closed: boolean; }

type TemplateCategory = 'animals' | 'vehicles' | 'buildings' | 'nature';

interface DotTemplate {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  category: TemplateCategory;
  animHint: AnimType;
  objectHint: string;
  strokes: Stroke[];
}

function clampCount(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function polylineStroke(vertices: Pt[], closed: boolean, minSpacing = 9): Stroke {
  const verts = closed ? [...vertices, vertices[0]] : vertices;
  let total = 0;
  const segLens: number[] = [];
  for (let i = 0; i < verts.length - 1; i++) {
    const dx = verts[i + 1].x - verts[i].x;
    const dy = verts[i + 1].y - verts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLens.push(len);
    total += len;
  }
  const count = clampCount(total / minSpacing, closed ? 6 : 3, 22);
  const dots: Pt[] = [];
  const denom = closed ? count : Math.max(count - 1, 1);
  for (let i = 0; i < count; i++) {
    const target = closed ? (total * i) / count : (total * i) / denom;
    let acc = 0;
    let placed = false;
    for (let s = 0; s < segLens.length; s++) {
      if (target <= acc + segLens[s] || s === segLens.length - 1) {
        const segT = segLens[s] === 0 ? 0 : (target - acc) / segLens[s];
        const A = verts[s];
        const B = verts[s + 1];
        dots.push({ x: A.x + (B.x - A.x) * segT, y: A.y + (B.y - A.y) * segT });
        placed = true;
        break;
      }
      acc += segLens[s];
    }
    if (!placed) dots.push(verts[verts.length - 1]);
  }
  return { dots, closed };
}

function ellipseStroke(cx: number, cy: number, rx: number, ry: number, startDeg = -90, sweepDeg = 360, minSpacing = 9): Stroke {
  const avgR = (rx + ry) / 2;
  const arcLen = (Math.abs(sweepDeg) / 360) * 2 * Math.PI * avgR;
  const closed = sweepDeg >= 360;
  const count = clampCount(arcLen / minSpacing, closed ? 7 : 4, 22);
  const dots: Pt[] = [];
  const denom = closed ? count : Math.max(count - 1, 1);
  for (let i = 0; i < count; i++) {
    const frac = closed ? i / count : i / denom;
    const deg = startDeg + frac * sweepDeg;
    const rad = (deg * Math.PI) / 180;
    dots.push({ x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) });
  }
  return { dots, closed };
}

function lineStroke(x1: number, y1: number, x2: number, y2: number, count = 3): Stroke {
  const dots: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    dots.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return { dots, closed: false };
}

function starStroke(cx: number, cy: number, rOuter: number, rInner: number, points: number, minSpacing = 8): Stroke {
  const verts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const deg = -90 + (i * 180) / points;
    const rad = (deg * Math.PI) / 180;
    verts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  return polylineStroke(verts, true, minSpacing);
}

type EarType = 'round' | 'tall' | 'floppy' | 'small';
type TailType = 'short' | 'long' | 'fluffy' | 'none';

function buildAnimal(opts: {
  earType: EarType;
  tailType: TailType;
  bodyScale?: number;
  headScale?: number;
}): Stroke[] {
  const strokes: Stroke[] = [];
  const bScale = opts.bodyScale ?? 1;
  const hScale = opts.headScale ?? 1;
  const bodyCx = 50, bodyCy = 64, bodyRx = 24 * bScale, bodyRy = 18 * bScale;
  const headCx = 50, headCy = 33, headR = 17 * hScale;

  strokes.push(ellipseStroke(bodyCx, bodyCy, bodyRx, bodyRy));
  strokes.push(ellipseStroke(headCx, headCy, headR, headR));

  if (opts.earType === 'round') {
    strokes.push(ellipseStroke(headCx - 13, headCy - 15, 6, 6));
    strokes.push(ellipseStroke(headCx + 13, headCy - 15, 6, 6));
  } else if (opts.earType === 'small') {
    strokes.push(ellipseStroke(headCx - 12, headCy - 13, 4, 4));
    strokes.push(ellipseStroke(headCx + 12, headCy - 13, 4, 4));
  } else if (opts.earType === 'tall') {
    strokes.push(polylineStroke([{ x: headCx - 16, y: headCy - 6 }, { x: headCx - 21, y: headCy - 34 }, { x: headCx - 7, y: headCy - 10 }], true));
    strokes.push(polylineStroke([{ x: headCx + 16, y: headCy - 6 }, { x: headCx + 21, y: headCy - 34 }, { x: headCx + 7, y: headCy - 10 }], true));
  } else if (opts.earType === 'floppy') {
    strokes.push(ellipseStroke(headCx - 18, headCy - 1, 6, 13));
    strokes.push(ellipseStroke(headCx + 18, headCy - 1, 6, 13));
  }

  if (opts.tailType === 'short') {
    strokes.push(ellipseStroke(bodyCx + bodyRx + 3, bodyCy, 5, 5));
  } else if (opts.tailType === 'long') {
    strokes.push(polylineStroke(
      [{ x: bodyCx + bodyRx - 2, y: bodyCy }, { x: bodyCx + bodyRx + 15, y: bodyCy - 12 }, { x: bodyCx + bodyRx + 20, y: bodyCy + 2 }],
      false
    ));
  } else if (opts.tailType === 'fluffy') {
    strokes.push(ellipseStroke(bodyCx + bodyRx + 5, bodyCy - 3, 8, 8));
  }

  const legY = bodyCy + bodyRy;
  strokes.push(lineStroke(bodyCx - 14, legY, bodyCx - 14, legY + 12, 3));
  strokes.push(lineStroke(bodyCx + 14, legY, bodyCx + 14, legY + 12, 3));

  return strokes;
}

function wheelStroke(cx: number, cy: number, r: number): Stroke {
  return ellipseStroke(cx, cy, r, r);
}

function buildBuilding(opts: { towers?: boolean; wide?: boolean }): Stroke[] {
  const strokes: Stroke[] = [];
  const w = opts.wide ? 50 : 38;
  const x = 50 - w / 2, y = 55, h = 28;

  strokes.push(polylineStroke([{ x, y: y + h }, { x, y }, { x: x + w, y }, { x: x + w, y: y + h }], true));
  strokes.push(polylineStroke([{ x: x - 4, y }, { x: 50, y: y - 22 }, { x: x + w + 4, y }], true));
  strokes.push(polylineStroke([{ x: 50 - 6, y: y + h }, { x: 50 - 6, y: y + h - 14 }, { x: 50 + 6, y: y + h - 14 }, { x: 50 + 6, y: y + h }], false));

  if (opts.towers) {
    strokes.push(polylineStroke([{ x: x - 10, y: y + h }, { x: x - 10, y: y - 4 }, { x: x - 2, y: y - 4 }, { x: x - 2, y: y + h }], true));
    strokes.push(polylineStroke([{ x: x + w + 2, y: y + h }, { x: x + w + 2, y: y - 4 }, { x: x + w + 10, y: y - 4 }, { x: x + w + 10, y: y + h }], true));
  }
  return strokes;
}

const TEMPLATES: DotTemplate[] = [
  // --- Hayvanlar (12) ---
  { id: 'cat', name: 'Kedi', nameEn: 'Cat', emoji: '🐱', category: 'animals', animHint: 'nefes_al', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'tall', tailType: 'long' }) },
  { id: 'dog', name: 'Köpek', nameEn: 'Dog', emoji: '🐶', category: 'animals', animHint: 'zipla', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'floppy', tailType: 'short' }) },
  { id: 'rabbit', name: 'Tavşan', nameEn: 'Rabbit', emoji: '🐰', category: 'animals', animHint: 'zipla', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'tall', tailType: 'fluffy', headScale: 1.05 }) },
  { id: 'bear', name: 'Ayı', nameEn: 'Bear', emoji: '🐻', category: 'animals', animHint: 'nefes_al', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'round', tailType: 'none', bodyScale: 1.15 }) },
  { id: 'pig', name: 'Domuz', nameEn: 'Pig', emoji: '🐷', category: 'animals', animHint: 'zipla', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'small', tailType: 'short' }) },
  { id: 'mouse', name: 'Fare', nameEn: 'Mouse', emoji: '🐭', category: 'animals', animHint: 'zipla', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'round', tailType: 'long', bodyScale: 0.8, headScale: 0.9 }) },
  { id: 'fox', name: 'Tilki', nameEn: 'Fox', emoji: '🦊', category: 'animals', animHint: 'nefes_al', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'tall', tailType: 'fluffy' }) },
  { id: 'lion', name: 'Aslan', nameEn: 'Lion', emoji: '🦁', category: 'animals', animHint: 'nefes_al', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'round', tailType: 'fluffy', headScale: 1.2 }) },
  { id: 'monkey', name: 'Maymun', nameEn: 'Monkey', emoji: '🐵', category: 'animals', animHint: 'zipla', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'round', tailType: 'long' }) },
  { id: 'panda', name: 'Panda', nameEn: 'Panda', emoji: '🐼', category: 'animals', animHint: 'nefes_al', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'round', tailType: 'none', bodyScale: 1.1 }) },
  { id: 'koala', name: 'Koala', nameEn: 'Koala', emoji: '🐨', category: 'animals', animHint: 'nefes_al', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'round', tailType: 'none', headScale: 1.15 }) },
  { id: 'hamster', name: 'Hamster', nameEn: 'Hamster', emoji: '🐹', category: 'animals', animHint: 'zipla', objectHint: 'hayvan', strokes: buildAnimal({ earType: 'small', tailType: 'none', bodyScale: 0.9 }) },

  // --- Araçlar (8) ---
  {
    id: 'car', name: 'Araba', nameEn: 'Car', emoji: '🚗', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([
        { x: 16, y: 74 }, { x: 16, y: 66 }, { x: 26, y: 66 }, { x: 32, y: 50 },
        { x: 62, y: 50 }, { x: 70, y: 66 }, { x: 84, y: 66 }, { x: 84, y: 74 },
      ], true),
      wheelStroke(30, 76, 7),
      wheelStroke(70, 76, 7),
    ],
  },
  {
    id: 'truck', name: 'Kamyon', nameEn: 'Truck', emoji: '🚚', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([
        { x: 14, y: 74 }, { x: 14, y: 58 }, { x: 26, y: 48 }, { x: 36, y: 48 },
        { x: 36, y: 30 }, { x: 88, y: 30 }, { x: 88, y: 74 },
      ], true),
      wheelStroke(24, 76, 6),
      wheelStroke(58, 76, 7),
      wheelStroke(78, 76, 7),
    ],
  },
  {
    id: 'bus', name: 'Otobüs', nameEn: 'Bus', emoji: '🚌', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([{ x: 12, y: 74 }, { x: 12, y: 34 }, { x: 88, y: 34 }, { x: 88, y: 74 }], true),
      polylineStroke([{ x: 20, y: 42 }, { x: 20, y: 54 }, { x: 32, y: 54 }, { x: 32, y: 42 }], true),
      polylineStroke([{ x: 42, y: 42 }, { x: 42, y: 54 }, { x: 54, y: 54 }, { x: 54, y: 42 }], true),
      polylineStroke([{ x: 64, y: 42 }, { x: 64, y: 54 }, { x: 76, y: 54 }, { x: 76, y: 42 }], true),
      wheelStroke(28, 76, 7),
      wheelStroke(72, 76, 7),
    ],
  },
  {
    id: 'taxi', name: 'Taksi', nameEn: 'Taxi', emoji: '🚕', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([
        { x: 16, y: 74 }, { x: 16, y: 66 }, { x: 26, y: 66 }, { x: 32, y: 50 },
        { x: 62, y: 50 }, { x: 70, y: 66 }, { x: 84, y: 66 }, { x: 84, y: 74 },
      ], true),
      polylineStroke([{ x: 42, y: 50 }, { x: 42, y: 43 }, { x: 54, y: 43 }, { x: 54, y: 50 }], true),
      wheelStroke(30, 76, 7),
      wheelStroke(70, 76, 7),
    ],
  },
  {
    id: 'ambulance', name: 'Ambulans', nameEn: 'Ambulance', emoji: '🚑', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([
        { x: 16, y: 74 }, { x: 16, y: 46 }, { x: 24, y: 38 }, { x: 80, y: 38 }, { x: 86, y: 46 }, { x: 86, y: 74 },
      ], true),
      lineStroke(51, 48, 51, 62, 3),
      lineStroke(44, 55, 58, 55, 3),
      wheelStroke(30, 76, 7),
      wheelStroke(74, 76, 7),
    ],
  },
  {
    id: 'tractor', name: 'Traktör', nameEn: 'Tractor', emoji: '🚜', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([
        { x: 16, y: 66 }, { x: 16, y: 58 }, { x: 32, y: 58 }, { x: 32, y: 38 },
        { x: 50, y: 38 }, { x: 50, y: 60 }, { x: 70, y: 60 }, { x: 70, y: 68 }, { x: 16, y: 68 },
      ], true),
      lineStroke(38, 38, 38, 20, 4),
      wheelStroke(24, 74, 6),
      wheelStroke(60, 76, 13),
    ],
  },
  {
    id: 'jeep', name: 'Jip', nameEn: 'Jeep', emoji: '🚙', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([{ x: 16, y: 72 }, { x: 16, y: 52 }, { x: 78, y: 52 }, { x: 78, y: 72 }], true),
      lineStroke(28, 52, 28, 38, 3),
      lineStroke(64, 52, 64, 38, 3),
      ellipseStroke(46, 38, 18, 7, 180, 180),
      wheelStroke(28, 74, 7),
      wheelStroke(66, 74, 7),
      wheelStroke(84, 60, 8),
    ],
  },
  {
    id: 'train', name: 'Lokomotif', nameEn: 'Locomotive', emoji: '🚂', category: 'vehicles',
    animHint: 'ileri_geri', objectHint: 'arac',
    strokes: [
      polylineStroke([{ x: 18, y: 66 }, { x: 18, y: 44 }, { x: 60, y: 44 }, { x: 60, y: 66 }], true),
      ellipseStroke(64, 54, 11, 11),
      polylineStroke([{ x: 28, y: 44 }, { x: 28, y: 30 }, { x: 38, y: 30 }, { x: 38, y: 44 }], true),
      wheelStroke(30, 76, 6),
      wheelStroke(46, 76, 6),
      wheelStroke(68, 78, 11),
    ],
  },

  // --- Ev / Bina (3) ---
  { id: 'house', name: 'Ev', nameEn: 'House', emoji: '🏠', category: 'buildings', animHint: 'duman', objectHint: 'bina', strokes: buildBuilding({ towers: false, wide: false }) },
  { id: 'cabin', name: 'Kulübe', nameEn: 'Cabin', emoji: '🛖', category: 'buildings', animHint: 'duman', objectHint: 'bina', strokes: buildBuilding({ towers: false, wide: true }) },
  { id: 'castle', name: 'Kale', nameEn: 'Castle', emoji: '🏰', category: 'buildings', animHint: 'duman', objectHint: 'bina', strokes: buildBuilding({ towers: true, wide: false }) },

  // --- Doğa / Nesneler (14) ---
  { id: 'sun', name: 'Güneş', nameEn: 'Sun', emoji: '☀️', category: 'nature', animHint: 'donme', objectHint: 'diger', strokes: [
    ellipseStroke(50, 50, 18, 18),
    ...Array.from({ length: 8 }, (_, i) => {
      const deg = i * 45;
      const rad = (deg * Math.PI) / 180;
      const r1 = 21, r2 = 30;
      return lineStroke(50 + r1 * Math.cos(rad), 50 + r1 * Math.sin(rad), 50 + r2 * Math.cos(rad), 50 + r2 * Math.sin(rad), 2);
    }),
  ] },
  { id: 'tree', name: 'Ağaç', nameEn: 'Tree', emoji: '🌳', category: 'nature', animHint: 'sallan', objectHint: 'bitki', strokes: [
    polylineStroke([{ x: 44, y: 90 }, { x: 44, y: 60 }, { x: 56, y: 60 }, { x: 56, y: 90 }], true),
    ellipseStroke(50, 40, 26, 24),
  ] },
  { id: 'flower', name: 'Çiçek', nameEn: 'Flower', emoji: '🌸', category: 'nature', animHint: 'sallan', objectHint: 'bitki', strokes: [
    ellipseStroke(50, 45, 7, 7),
    ellipseStroke(50, 30, 8, 8),
    ellipseStroke(65, 40, 8, 8),
    ellipseStroke(60, 58, 8, 8),
    ellipseStroke(40, 58, 8, 8),
    ellipseStroke(35, 40, 8, 8),
    lineStroke(50, 52, 50, 85, 4),
  ] },
  { id: 'star', name: 'Yıldız', nameEn: 'Star', emoji: '⭐', category: 'nature', animHint: 'donme', objectHint: 'diger', strokes: [
    starStroke(50, 50, 28, 12, 5),
  ] },
  { id: 'cloud', name: 'Bulut', nameEn: 'Cloud', emoji: '☁️', category: 'nature', animHint: 'sallan', objectHint: 'diger', strokes: [
    polylineStroke([
      { x: 24, y: 60 }, { x: 20, y: 48 }, { x: 30, y: 38 }, { x: 40, y: 42 },
      { x: 46, y: 30 }, { x: 62, y: 32 }, { x: 68, y: 44 }, { x: 78, y: 48 },
      { x: 78, y: 60 },
    ], true),
  ] },
  { id: 'rainbow', name: 'Gökkuşağı', nameEn: 'Rainbow', emoji: '🌈', category: 'nature', animHint: 'nefes_al', objectHint: 'diger', strokes: [
    ellipseStroke(50, 78, 34, 34, 180, 180),
    ellipseStroke(50, 78, 26, 26, 180, 180),
    ellipseStroke(50, 78, 18, 18, 180, 180),
  ] },
  { id: 'heart', name: 'Kalp', nameEn: 'Heart', emoji: '❤️', category: 'nature', animHint: 'zipla', objectHint: 'diger', strokes: [
    polylineStroke([
      { x: 50, y: 82 }, { x: 22, y: 55 }, { x: 22, y: 38 }, { x: 34, y: 26 },
      { x: 50, y: 36 }, { x: 66, y: 26 }, { x: 78, y: 38 }, { x: 78, y: 55 },
    ], true),
  ] },
  { id: 'balloon', name: 'Balon', nameEn: 'Balloon', emoji: '🎈', category: 'nature', animHint: 'sallan', objectHint: 'diger', strokes: [
    ellipseStroke(50, 38, 20, 24),
    polylineStroke([{ x: 50, y: 62 }, { x: 46, y: 72 }, { x: 54, y: 80 }, { x: 50, y: 90 }], false),
  ] },
  { id: 'umbrella', name: 'Şemsiye', nameEn: 'Umbrella', emoji: '☂️', category: 'nature', animHint: 'sallan', objectHint: 'diger', strokes: [
    ellipseStroke(50, 45, 30, 18, 180, 180),
    lineStroke(50, 45, 50, 85, 4),
    polylineStroke([{ x: 50, y: 85 }, { x: 42, y: 85 }, { x: 42, y: 78 }], false),
  ] },
  { id: 'icecream', name: 'Dondurma', nameEn: 'Ice Cream', emoji: '🍦', category: 'nature', animHint: 'nefes_al', objectHint: 'diger', strokes: [
    polylineStroke([{ x: 40, y: 55 }, { x: 50, y: 88 }, { x: 60, y: 55 }], true),
    ellipseStroke(50, 42, 16, 16),
  ] },
  { id: 'cupcake', name: 'Kek', nameEn: 'Cupcake', emoji: '🧁', category: 'nature', animHint: 'nefes_al', objectHint: 'diger', strokes: [
    polylineStroke([{ x: 32, y: 82 }, { x: 38, y: 58 }, { x: 62, y: 58 }, { x: 68, y: 82 }], true),
    ellipseStroke(50, 48, 17, 14),
  ] },
  { id: 'mushroom', name: 'Mantar', nameEn: 'Mushroom', emoji: '🍄', category: 'nature', animHint: 'nefes_al', objectHint: 'bitki', strokes: [
    ellipseStroke(50, 45, 24, 16, 180, 180),
    polylineStroke([{ x: 40, y: 45 }, { x: 40, y: 82 }, { x: 60, y: 82 }, { x: 60, y: 45 }], true),
  ] },
  { id: 'fish', name: 'Balık', nameEn: 'Fish', emoji: '🐟', category: 'nature', animHint: 'yuz', objectHint: 'hayvan', strokes: [
    ellipseStroke(45, 50, 24, 16),
    polylineStroke([{ x: 68, y: 50 }, { x: 84, y: 38 }, { x: 84, y: 62 }], true),
  ] },
  { id: 'bird', name: 'Kuş', nameEn: 'Bird', emoji: '🐦', category: 'nature', animHint: 'zipla', objectHint: 'hayvan', strokes: [
    ellipseStroke(48, 52, 18, 15),
    polylineStroke([{ x: 30, y: 48 }, { x: 14, y: 42 }, { x: 28, y: 58 }], true),
    polylineStroke([{ x: 65, y: 48 }, { x: 78, y: 46 }, { x: 65, y: 54 }], true),
  ] },
];

const TEMPLATE_CATEGORIES: { id: 'all' | TemplateCategory; label: string; labelEn: string; icon: string }[] = [
  { id: 'all', label: 'Hepsi', labelEn: 'All', icon: 'creation' },
  { id: 'animals', label: 'Hayvanlar', labelEn: 'Animals', icon: 'paw' },
  { id: 'vehicles', label: 'Araçlar', labelEn: 'Vehicles', icon: 'car' },
  { id: 'buildings', label: 'Ev & Bina', labelEn: 'Buildings', icon: 'home' },
  { id: 'nature', label: 'Doğa', labelEn: 'Nature', icon: 'flower' },
];

function getScaledTemplateDots(template: DotTemplate, canvasW: number, canvasH: number): Stroke[] {
  const scale = Math.min(canvasW, canvasH) / 100;
  const offsetX = (canvasW - 100 * scale) / 2;
  const offsetY = (canvasH - 100 * scale) / 2;
  return template.strokes.map((st) => ({
    closed: st.closed,
    dots: st.dots.map((p) => ({ x: offsetX + p.x * scale, y: offsetY + p.y * scale })),
  }));
}

function strokeToPathD(stroke: Stroke): string {
  if (stroke.dots.length === 0) return '';
  const [first, ...rest] = stroke.dots;
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (const p of rest) d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  if (stroke.closed) d += ' Z';
  return d;
}

const sanitizeImageUri = (rawUri?: string | null): string | null => {
  if (!rawUri || typeof rawUri !== 'string') return null;
  const trimmed = rawUri.trim();
  if (trimmed.length < 5) return null;

  if (trimmed.startsWith('file://') || trimmed.startsWith('ph://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return encodeURI(trimmed);
    } catch {
      return null;
    }
  }

  return null;
};

/* ------------------------------------------------------------------ */
/*  KÜÇÜK ORTAK BİLEŞENLER                                             */
/* ------------------------------------------------------------------ */

// İkon (font tabanlı, vektör) + yazı. Butonlarda emoji yerine bunu kullanıyoruz.
const BtnLabel = ({
  icon,
  text,
  color = '#FFF',
  size = 14,
  iconRight = false,
  weight = '900',
}: {
  icon?: string;
  text?: string;
  color?: string;
  size?: number;
  iconRight?: boolean;
  weight?: any;
}) => {
  const iconEl = icon ? <MaterialCommunityIcons name={icon as any} size={size + 4} color={color} /> : null;
  return (
    <View style={styles.btnLabelRow}>
      {!iconRight && iconEl}
      {text ? (
        <Text style={{ color, fontSize: size, fontWeight: weight, flexShrink: 1 }} numberOfLines={1}>
          {text}
        </Text>
      ) : null}
      {iconRight && iconEl}
    </View>
  );
};

const FluffyButton = ({
  onPress,
  children,
  disabled,
  bg = '#F59E0B',
  shadow = '#B45309',
  style,
}: any) => {
  const translateY = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.spring(translateY, { toValue: 4, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(translateY, { toValue: 0, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  return (
    <View style={styles.fluffyBtnWrap}>
      <View style={[styles.fluffyUnderShadow, { backgroundColor: shadow }]} />
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onPress}
          disabled={disabled}
          style={[styles.fluffyFrontBase, { backgroundColor: bg }, style]}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
};

// Tüm modallar için ortak kabuk: tablette içerik ortada, makul genişlikte kalır
const ModalShell = ({
  visible,
  onClose,
  maxW,
  centerItems,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  maxW: number;
  centerItems?: boolean;
  children: React.ReactNode;
}) => (
  <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={onClose}>
    <View style={styles.modalOuter}>
      <View style={[styles.modalInner, { maxWidth: maxW }, centerItems && { alignItems: 'center' }]}>
        {children}
      </View>
    </View>
  </Modal>
);

// Standart modal üst çubuğu: sol/sağ eşit genişlik, başlık ortada, iç içe girmez
const ModalTopBar = ({ onClose, closeText, title }: { onClose: () => void; closeText: string; title: string }) => (
  <View style={styles.modalTopBar}>
    <TouchableOpacity onPress={onClose} style={styles.modalSideSlot}>
      <BtnLabel icon="close" text={closeText} color="#F87171" size={15} />
    </TouchableOpacity>
    <Text style={styles.modalBarTitle} numberOfLines={1}>{title}</Text>
    <View style={styles.modalSideSlot} />
  </View>
);

/* ------------------------------------------------------------------ */
/*  ANİMASYON BİLEŞENLERİ                                              */
/* ------------------------------------------------------------------ */

const SmokePuffs = ({ x, y, k = 1 }: { x: number; y: number; k?: number }) => {
  const puffs = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = puffs.map((v, i) => {
      v.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(i * 650),
          Animated.timing(v, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <>
      {puffs.map((v, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: x - 11,
            top: y - 11,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#CBD5E1',
            opacity: v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.75, 0.3, 0] }),
            transform: [
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -85 * k] }) },
              { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 10 * k, -4 * k] }) },
              { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.1] }) },
            ],
          }}
        />
      ))}
    </>
  );
};

const AnimatedDoodle = ({
  uri,
  type = 'nefes_al',
  effectPoint,
  size = 240,
}: {
  uri: string;
  type?: AnimType;
  effectPoint?: EffectPoint | null;
  size?: number;
}) => {
  const t = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [aspect, setAspect] = useState(1);

  // Hareket mesafeleri, sahne boyutuna göre ölçeklenir (tablette de orantılı kalır)
  const k = size / 240;

  useEffect(() => {
    let mounted = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (mounted && w > 0 && h > 0) setAspect(w / h);
      },
      () => {}
    );
    return () => {
      mounted = false;
    };
  }, [uri]);

  const imgW = aspect >= 1 ? size : size * aspect;
  const imgH = aspect >= 1 ? size / aspect : size;

  useEffect(() => {
    t.setValue(0);
    flip.setValue(1);
    spin.setValue(0);

    let anim: Animated.CompositeAnimation;

    switch (type) {
      case 'zipla':
        anim = Animated.loop(
          Animated.sequence([
            Animated.timing(t, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(t, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(t, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(120),
          ])
        );
        break;

      case 'ileri_geri':
        anim = Animated.loop(
          Animated.sequence([
            Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(flip, { toValue: -1, duration: 140, useNativeDriver: true }),
            Animated.timing(t, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(flip, { toValue: 1, duration: 140, useNativeDriver: true }),
          ])
        );
        break;

      case 'donme':
        anim = Animated.loop(
          Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })
        );
        break;

      case 'sallan':
        anim = Animated.loop(
          Animated.sequence([
            Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        break;

      case 'yuz':
        anim = Animated.loop(
          Animated.sequence([
            Animated.timing(t, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(t, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        break;

      default:
        anim = Animated.loop(
          Animated.sequence([
            Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
    }

    anim.start();
    return () => anim.stop();
  }, [type, uri]);

  const transform: any[] = (() => {
    switch (type) {
      case 'zipla':
        return [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -50 * k] }) },
          { scaleY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.86, 1.02, 1.1] }) },
          { scaleX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.1, 1, 0.94] }) },
        ];
      case 'ileri_geri':
        return [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-55 * k, 55 * k] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -2, 0, -2, 0] }) },
          { scaleX: flip },
        ];
      case 'donme':
        return [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }];
      case 'sallan':
        return [
          { translateY: imgH / 2 },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '9deg'] }) },
          { translateY: -imgH / 2 },
        ];
      case 'yuz':
        return [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-30 * k, 30 * k] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -10 * k, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-5deg', '5deg', '-5deg'] }) },
        ];
      default:
        return [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }];
    }
  })();

  const showSmoke = type === 'duman';
  const smokePoint = effectPoint || { x: 0.7, y: 0.25 };

  return (
    <View style={{ width: size + 110 * k, height: size + 90 * k, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: imgW, height: imgH }}>
        <Animated.Image
          source={{ uri }}
          style={{ width: imgW, height: imgH, resizeMode: 'contain', transform }}
        />
        {showSmoke && <SmokePuffs x={smokePoint.x * imgW} y={smokePoint.y * imgH} k={k} />}
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/*  SES KAYDIRMA ÇUBUĞU                                                */
/*  Sürüklerken onDragStart/onDragEnd çağrılır; böylece dışarıdaki      */
/*  ScrollView'i kilitleyip sayfanın oynamasını engelleriz.             */
/* ------------------------------------------------------------------ */
const VolumeSlider = ({
  value,
  min = 0,
  max = 1,
  onChange,
  onComplete,
  onDragStart,
  onDragEnd,
  color = '#F59E0B',
  leftIcon = 'volume-low',
  rightIcon = 'volume-high',
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  onComplete?: (v: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  color?: string;
  leftIcon?: string;
  rightIcon?: string;
}) => {
  const [trackW, setTrackW] = useState(0);
  const trackWRef = useRef(0);
  const startXRef = useRef(0);
  const lastValueRef = useRef(value);
  const cb = useRef({ onChange, onComplete, onDragStart, onDragEnd, min, max });
  cb.current = { onChange, onComplete, onDragStart, onDragEnd, min, max };

  const THUMB = 28;
  const ratio = max > min ? Math.min(Math.max((value - min) / (max - min), 0), 1) : 0;

  const valueFromX = (x: number) => {
    const w = trackWRef.current || 1;
    const r = Math.min(Math.max(x / w, 0), 1);
    const raw = cb.current.min + r * (cb.current.max - cb.current.min);
    return Math.round(raw * 100) / 100;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        cb.current.onDragStart?.();
        startXRef.current = e.nativeEvent.locationX;
        const v = valueFromX(startXRef.current);
        lastValueRef.current = v;
        cb.current.onChange(v);
      },
      onPanResponderMove: (_e, g) => {
        const v = valueFromX(startXRef.current + g.dx);
        if (v !== lastValueRef.current) {
          lastValueRef.current = v;
          cb.current.onChange(v);
        }
      },
      onPanResponderRelease: () => {
        cb.current.onComplete?.(lastValueRef.current);
        cb.current.onDragEnd?.();
      },
      onPanResponderTerminate: () => {
        cb.current.onComplete?.(lastValueRef.current);
        cb.current.onDragEnd?.();
      },
    })
  ).current;

  return (
    <View style={styles.sliderRow}>
      <MaterialCommunityIcons name={leftIcon as any} size={22} color="#C7D2FE" style={styles.sliderIcon} />

      <View
        style={styles.sliderHitArea}
        onLayout={(e) => {
          trackWRef.current = e.nativeEvent.layout.width;
          setTrackW(e.nativeEvent.layout.width);
        }}
        {...pan.panHandlers}
      >
        <View pointerEvents="none" style={styles.sliderTrack} />
        <View
          pointerEvents="none"
          style={[styles.sliderFill, { width: ratio * trackW, backgroundColor: color }]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.sliderThumb,
            { left: ratio * trackW - THUMB / 2, borderColor: color },
          ]}
        >
          <View style={[styles.sliderThumbDot, { backgroundColor: color }]} />
        </View>
      </View>

      <MaterialCommunityIcons name={rightIcon as any} size={22} color="#C7D2FE" style={styles.sliderIcon} />
    </View>
  );
};

const SmartChoiceImage = ({ uri, fallback }: { uri?: string; fallback: string }) => {
  const [imgLoading, setImgLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const cleanUri = useMemo(() => sanitizeImageUri(uri), [uri]);

  if (!cleanUri || hasError) {
    return (
      <View style={styles.choiceImgFrame}>
        <Text style={styles.choiceFallbackEmoji}>{fallback || '✨'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.choiceImgFrame}>
      <Image
        source={{ uri: cleanUri }}
        style={styles.choiceThumbImage}
        onLoadEnd={() => setImgLoading(false)}
        onError={() => {
          setHasError(true);
          setImgLoading(false);
        }}
      />
      {imgLoading && (
        <View style={styles.choiceLoadingCover}>
          <ActivityIndicator color="#F59E0B" size="small" />
        </View>
      )}
    </View>
  );
};

const CinematicScene = ({ uri }: { uri?: string }) => {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const cleanUri = useMemo(() => sanitizeImageUri(uri), [uri]);

  if (!cleanUri || hasError) {
    return (
      <View style={[styles.cinematicSceneBox, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 40 }}>🏰✨</Text>
        <Text style={{ color: '#FDE68A', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Büyülü Macera Başlıyor</Text>
      </View>
    );
  }

  return (
    <View style={styles.cinematicSceneBox}>
      <Image
        source={{ uri: cleanUri }}
        style={styles.cinematicImage}
        onLoadEnd={() => setLoading(false)}
        onError={() => setHasError(true)}
      />
      <View style={[styles.goldCorner, styles.cTopLeft]} />
      <View style={[styles.goldCorner, styles.cTopRight]} />
      <View style={[styles.goldCorner, styles.cBottomLeft]} />
      <View style={[styles.goldCorner, styles.cBottomRight]} />

      {loading && (
        <View style={styles.cinematicLoadingCover}>
          <ActivityIndicator color="#F59E0B" size="large" />
          <Text style={styles.cinematicLoadingText}>✨ Büyülü Sahne Çiziliyor...</Text>
        </View>
      )}
    </View>
  );
};

export default function App() {
  /* ---------------- Ekran boyutuna göre esnek yerleşim ---------------- */
  const { width: winW, height: winH } = useWindowDimensions();
  const isTablet = winW >= 700;
  // Ana ekranda içerik genişliği (telefonda ekran, tablette en fazla 680)
  const contentW = Math.min(winW - 24, isTablet ? 680 : 520);
  // Modallarda içerik genişliği
  const modalMaxW = isTablet ? 720 : 560;
  const modalInnerW = Math.min(winW, modalMaxW) - 32;
  // Tuval: hem genişliğe hem yüksekliğe sığar (yatay tablette taşmaz)
  const canvasSize = Math.max(220, Math.min(modalInnerW - 6, winH - 400, 560));
  // Kitap kapağı
  const coverW = Math.min(contentW * 0.85, isTablet ? 430 : 290);
  const coverH = coverW * 1.26;
  const ovalSize = coverW * 0.74;
  // Buton satırları
  const btnRowMax = Math.min(contentW, isTablet ? 520 : 340);
  // Animasyon sahnesi
  const stageSize = Math.min(contentW - 90, isTablet ? 400 : 260);
  // Şablon ızgarası
  const tplCols = Math.min(6, Math.max(3, Math.floor(modalInnerW / 84)));
  const tplGap = 10;
  const tplCardW = (modalInnerW - tplGap * (tplCols - 1)) / tplCols;

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageBase64Raw, setImageBase64Raw] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [continuingLoading, setContinuingLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);

  // Modallar
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([]);
  const [isReadingSavedBook, setIsReadingSavedBook] = useState(false);

  // Ayarlar
  const [selectedLanguage, setSelectedLanguage] = useState<'tr' | 'en'>('tr');
  const [musicVolume, setMusicVolume] = useState<number>(0.16);
  const [narratorVolume, setNarratorVolume] = useState<number>(1.0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  // Ses çubuğu sürüklenirken ayarlar sayfasının kaymasını kilitler
  const [sliderDragging, setSliderDragging] = useState(false);

  // Çizim Araçları
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [paths, setPaths] = useState<PathData[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [currentColor, setCurrentColor] = useState<string>(EXPANDED_PALETTE[0].color);
  const [brushSizeLevel, setBrushSizeLevel] = useState<number>(2);
  const [eraserSizeLevel, setEraserSizeLevel] = useState<number>(3);
  const viewShotRef = useRef<any>(null);
  // Kayıt anında şablon noktalarını gizlemek için
  const [captureMode, setCaptureMode] = useState(false);

  // Hazır Şablon (Nokta Nokta)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'all' | TemplateCategory>('all');
  const [activeTemplate, setActiveTemplate] = useState<DotTemplate | null>(null);
  const [pendingTemplateHint, setPendingTemplateHint] = useState<{ anim: AnimType; obj: string } | null>(null);

  // Masal Oynatma
  const [storyHistory, setStoryHistory] = useState<StoryPart[]>([]);
  const [currentPart, setCurrentPart] = useState<StoryPart | null>(null);
  const [chapterCount, setChapterCount] = useState<number>(1);

  // Çizim canlanma (intro) sahnesi
  const [introPart, setIntroPart] = useState<StoryPart | null>(null);

  const pageFlipProgress = useRef(new Animated.Value(0)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;

  const soundPlayerRef = useRef<AudioPlayer | null>(null);
  const bgMusicPlayerRef = useRef<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loadedNarratorId, setLoadedNarratorId] = useState<string | null>(null);
  const [selectedNarrator, setSelectedNarrator] = useState<NarratorProfile>(NARRATORS[0]);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(-1);

  const currentSentences = useMemo(() => {
    if (!currentPart?.bolum_metni) return [];
    const raw = currentPart.bolum_metni.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [currentPart.bolum_metni];
    return raw.map((s) => s.trim()).filter((s) => s.length > 0);
  }, [currentPart?.bolum_metni]);

  const currentToolConfig = useMemo(() => {
    if (activeTool === 'eraser') {
      const sizes = [14, 24, 36, 52];
      return { color: '#FFFFFF', width: sizes[eraserSizeLevel - 1], opacity: 1.0 };
    }
    if (activeTool === 'pen') {
      const sizes = [3, 5, 8, 12];
      return { color: currentColor, width: sizes[brushSizeLevel - 1], opacity: 1.0 };
    }
    if (activeTool === 'crayon') {
      const sizes = [8, 14, 20, 28];
      return { color: currentColor, width: sizes[brushSizeLevel - 1], opacity: 0.72 };
    }
    const sizes = [6, 12, 18, 26];
    return { color: currentColor, width: sizes[brushSizeLevel - 1], opacity: 0.9 };
  }, [activeTool, currentColor, brushSizeLevel, eraserSizeLevel]);

  useEffect(() => {
    if (bgMusicPlayerRef.current) {
      try {
        bgMusicPlayerRef.current.volume = musicVolume;
      } catch {}
    }
  }, [musicVolume]);

  useEffect(() => {
    if (soundPlayerRef.current) {
      try {
        soundPlayerRef.current.volume = narratorVolume;
      } catch {}
    }
  }, [narratorVolume]);

  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
      } catch (err) {
        console.log('Audio mode error:', err);
      }
    })();

    loadSettingsAndLibrary();
    return () => {
      resetAudio();
    };
  }, []);

  const finishIntroRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!introPart) return;
    const timer = setTimeout(() => finishIntroRef.current(), INTRO_DURATION_MS);
    return () => clearTimeout(timer);
  }, [introPart]);

  const loadSettingsAndLibrary = async () => {
    try {
      const booksData = await AsyncStorage.getItem(STORAGE_KEY);
      if (booksData) setSavedBooks(JSON.parse(booksData));

      const settingsData = await AsyncStorage.getItem(SETTINGS_KEY);
      if (settingsData) {
        const parsed = JSON.parse(settingsData);
        if (parsed.language) setSelectedLanguage(parsed.language);
        if (parsed.musicVolume !== undefined) setMusicVolume(parsed.musicVolume);
        if (parsed.narratorVolume !== undefined) setNarratorVolume(parsed.narratorVolume);
        if (parsed.playbackSpeed !== undefined) setPlaybackSpeed(parsed.playbackSpeed);
      }
    } catch (e) {
      console.log('Veri yükleme hatası:', e);
    }
  };

  const saveSettingsToStorage = async (lang: 'tr' | 'en', mVol: number, nVol: number, spd: number) => {
    try {
      const data = { language: lang, musicVolume: mVol, narratorVolume: nVol, playbackSpeed: spd };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch (e) {
      console.log('Ayar kaydetme hatası:', e);
    }
  };

  const saveBookToStorage = async (historyToSave: StoryPart[]) => {
    if (!historyToSave || historyToSave.length === 0) return;
    try {
      const firstPage = historyToSave[0];
      const validCover = sanitizeImageUri(selectedImage);
      const newBook: SavedBook = {
        id: Date.now().toString(),
        title: firstPage.masal_basligi || (selectedLanguage === 'en' ? 'Magic Tale' : 'Sihirli Masal'),
        date: new Date().toLocaleDateString(selectedLanguage === 'en' ? 'en-US' : 'tr-TR'),
        coverImage: validCover,
        characterName: firstPage.karakter_adi || (selectedLanguage === 'en' ? 'Hero' : 'Kahraman'),
        history: historyToSave,
      };

      const updated = [newBook, ...savedBooks.filter((b) => b.id !== newBook.id)].slice(0, 10);
      setSavedBooks(updated);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.log('Kitap kaydetme hatası:', e);
    }
  };

  const openBookFromLibrary = (book: SavedBook) => {
    resetAudio();
    setIntroPart(null);
    setIsReadingSavedBook(true);
    setSelectedImage(sanitizeImageUri(book.coverImage));
    setImageBase64Raw(null);
    setStoryHistory(book.history);
    setCurrentPart(book.history[0]);
    setChapterCount(1);
    setIsLibraryOpen(false);

    const sentences = (book.history[0].bolum_metni.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [book.history[0].bolum_metni]).map((s) => s.trim());
    fetchAudioAsync(book.history[0].bolum_metni, sentences);
  };

  const deleteBookFromLibrary = async (id: string) => {
    const filtered = savedBooks.filter((b) => b.id !== id);
    setSavedBooks(filtered);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  };

  const clearAllCache = async () => {
    Alert.alert(
      selectedLanguage === 'en' ? 'Clear Cache' : 'Önbelleği Temizle',
      selectedLanguage === 'en' ? 'Are you sure you want to delete all saved books and reset?' : 'Kayıtlı tüm masalları ve geçici verileri silmek istiyor musunuz?',
      [
        { text: selectedLanguage === 'en' ? 'Cancel' : 'Vazgeç', style: 'cancel' },
        {
          text: selectedLanguage === 'en' ? 'Clear All' : 'Evet, Temizle',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(STORAGE_KEY);
            setSavedBooks([]);
            resetAllStory();
            setIsSettingsOpen(false);
          },
        },
      ]
    );
  };

  const resetAudio = () => {
    if (soundPlayerRef.current) {
      try {
        soundPlayerRef.current.pause();
        soundPlayerRef.current.remove();
      } catch {}
      soundPlayerRef.current = null;
    }
    if (bgMusicPlayerRef.current) {
      try {
        bgMusicPlayerRef.current.pause();
        bgMusicPlayerRef.current.remove();
      } catch {}
      bgMusicPlayerRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setLoadedNarratorId(null);
    setActiveSentenceIndex(-1);
  };

  const executeRealisticPageFlip = (onPageTurnHalfway: () => void) => {
    try {
      const flipPlayer = createAudioPlayer(PAGE_FLIP_SOUND_URL);
      flipPlayer.volume = 0.7;
      flipPlayer.play();
    } catch {}

    sparkleAnim.setValue(0);
    Animated.sequence([
      Animated.timing(sparkleAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(sparkleAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    pageFlipProgress.setValue(0);
    Animated.timing(pageFlipProgress, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start(() => {
      onPageTurnHalfway();
      pageFlipProgress.setValue(-1);
      Animated.spring(pageFlipProgress, {
        toValue: 0,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }).start();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentPath(`M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentPath((prev) => `${prev} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
        },
        onPanResponderRelease: () => {
          if (currentPath) {
            setPaths((prev) => [
              ...prev,
              {
                d: currentPath,
                color: currentToolConfig.color,
                width: currentToolConfig.width,
                opacity: currentToolConfig.opacity,
              },
            ]);
            setCurrentPath('');
          }
        },
      }),
    [currentPath, currentToolConfig]
  );

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath('');
  };

  const undoCanvas = () => {
    setPaths((prev) => prev.slice(0, -1));
  };

  const openFreeDraw = () => {
    setActiveTemplate(null);
    setPendingTemplateHint(null);
    clearCanvas();
    setIsDrawModalOpen(true);
  };

  const openTemplateDrawing = (tpl: DotTemplate) => {
    setActiveTemplate(tpl);
    clearCanvas();
    setIsTemplateModalOpen(false);
    setIsDrawModalOpen(true);
  };

  const saveDoodleAndClose = async () => {
    if (paths.length === 0) {
      Alert.alert(
        selectedLanguage === 'en' ? 'Drawing Empty' : 'Çizim Boş',
        selectedLanguage === 'en' ? 'Please draw on the canvas first!' : 'Lütfen önce tuvale bir resim çiz!'
      );
      return;
    }
    try {
      // 1) Şablon kılavuz noktalarını gizle ve ekranın yeniden çizilmesini bekle
      setCaptureMode(true);
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 2) Sadece çocuğun çizdiği çizgiler görüntüde kalır
      const b64 = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.85,
        result: 'base64',
      });

      const fullDataUri = `data:image/jpeg;base64,${b64}`;
      setSelectedImage(fullDataUri);
      setImageBase64Raw(b64);
      setPendingTemplateHint(
        activeTemplate ? { anim: activeTemplate.animHint, obj: activeTemplate.objectHint } : null
      );
      setIsDrawModalOpen(false);
      resetAllStory();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCaptureMode(false);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Camera permission needed.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!res.canceled && res.assets[0]) {
      setSelectedImage(res.assets[0].uri);
      setImageBase64Raw(res.assets[0].base64 || null);
      resetAllStory();
    }
  };

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!res.canceled && res.assets[0]) {
      setSelectedImage(res.assets[0].uri);
      setImageBase64Raw(res.assets[0].base64 || null);
      resetAllStory();
    }
  };

  const resetAllStory = () => {
    resetAudio();
    setIntroPart(null);
    setIsReadingSavedBook(false);
    setStoryHistory([]);
    setCurrentPart(null);
    setChapterCount(1);
    pageFlipProgress.setValue(0);
  };

  const resetForNewDoodle = () => {
    resetAllStory();
    setActiveTemplate(null);
    setPendingTemplateHint(null);
    setSelectedImage(null);
    setImageBase64Raw(null);
  };

  const playAudioFromBase64 = (base64Data: string, sentenceList: string[]) => {
    if (!base64Data) return;
    setVoiceLoading(true);
    try {
      resetAudio();

      if (musicVolume > 0.01) {
        try {
          const bgPlayer = createAudioPlayer(BACKGROUND_MUSIC_URL);
          bgPlayer.volume = musicVolume;
          bgPlayer.loop = true;
          bgPlayer.play();
          bgMusicPlayerRef.current = bgPlayer;
        } catch {}
      }

      const audioUri = `data:audio/mp3;base64,${base64Data}`;
      const player = createAudioPlayer(audioUri);
      player.volume = narratorVolume;
      player.play();
      soundPlayerRef.current = player;

      setIsPlaying(true);
      setIsPaused(false);
      setLoadedNarratorId(selectedNarrator.id);

      player.addListener('playbackStatusUpdate', (status: any) => {
        if (status.currentTime && status.duration && status.duration > 0) {
          const progress = status.currentTime / status.duration;
          if (sentenceList.length > 0) {
            const index = Math.min(
              Math.floor(progress * sentenceList.length),
              sentenceList.length - 1
            );
            setActiveSentenceIndex(index);
          }
        }

        if (status.didJustFinish) {
          setIsPlaying(false);
          setIsPaused(false);
          setActiveSentenceIndex(-1);
          if (bgMusicPlayerRef.current) {
            try {
              bgMusicPlayerRef.current.pause();
            } catch {}
          }
        }
      });
    } catch (error: any) {
      console.log('Ses çalma hatası:', error);
    } finally {
      setVoiceLoading(false);
    }
  };

  const fetchAudioAsync = (text: string, sentences: string[]) => {
    if (!text) return;
    setVoiceLoading(true);
    fetch(`${BACKEND_URL}/generate-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        narrator_id: selectedNarrator.id,
        language: selectedLanguage,
        speed: playbackSpeed,
      }),
    })
      .then((res) => res.json())
      .then((voiceData) => {
        if (voiceData.audio_base64) {
          playAudioFromBase64(voiceData.audio_base64, sentences);
        }
      })
      .catch((e) => console.log('Voice fetch error:', e))
      .finally(() => setVoiceLoading(false));
  };

  const finishIntro = () => {
    if (!introPart) return;
    const data = introPart;
    setIntroPart(null);
    setCurrentPart(data);
    setStoryHistory([data]);
    setChapterCount(1);
    pageFlipProgress.setValue(0);

    const sentences = (data.bolum_metni.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [data.bolum_metni]).map((s) => s.trim());
    fetchAudioAsync(data.bolum_metni, sentences);
  };
  finishIntroRef.current = finishIntro;

  const generateInitialStory = async () => {
    if (!selectedImage) return;
    setLoading(true);
    resetAudio();
    setIsReadingSavedBook(false);

    try {
      let base64Data = imageBase64Raw;

      if (!base64Data) {
        if (selectedImage.startsWith('data:image/')) {
          base64Data = selectedImage.split(',')[1];
        } else {
          const imgRes = await fetch(selectedImage);
          const imgBlob = await imgRes.blob();
          base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1]);
            };
            reader.readAsDataURL(imgBlob);
          });
        }
      }

      const response = await fetch(`${BACKEND_URL}/generate-story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64Data,
          narrator_id: selectedNarrator.id,
          language: selectedLanguage,
          speed: playbackSpeed,
          template_animasyon_tipi: pendingTemplateHint?.anim,
          template_nesne_turu: pendingTemplateHint?.obj,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Sunucu hatası oluştu.');
      }

      const data: StoryPart = await response.json();
      setLoading(false);

      setIntroPart(data);
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setLoading(false);
    }
  };

  const handleChoiceSelect = async (choiceText: string) => {
    if (!currentPart) return;
    setContinuingLoading(true);
    resetAudio();

    try {
      const allTextSoFar = storyHistory.map((h) => h.bolum_metni).join(' ');

      const res = await fetch(`${BACKEND_URL}/continue-story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          karakter_adi: currentPart.karakter_adi,
          karakter_tanimi: currentPart.karakter_tanimi,
          onceki_metin: allTextSoFar,
          secilen_yol: choiceText,
          bolum_sayisi: chapterCount + 1,
          narrator_id: selectedNarrator.id,
          language: selectedLanguage,
          speed: playbackSpeed,
        }),
      });

      if (!res.ok) throw new Error('Devam hikayesi yazılamadı.');

      const nextPart: StoryPart = await res.json();
      nextPart.secilen_yol_metni = choiceText;

      const updatedHistory = [...storyHistory, nextPart];
      const nextSentences = (nextPart.bolum_metni.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [nextPart.bolum_metni]).map((s) => s.trim());

      executeRealisticPageFlip(() => {
        setCurrentPart(nextPart);
        setStoryHistory(updatedHistory);
        setChapterCount((c) => c + 1);

        if (nextPart.is_final) {
          saveBookToStorage(updatedHistory);
        }
      });

      setContinuingLoading(false);
      fetchAudioAsync(nextPart.bolum_metni, nextSentences);
    } catch (error: any) {
      Alert.alert('Error', error.message);
      setContinuingLoading(false);
    }
  };

  const navigateSavedBookPage = (direction: 'next' | 'prev') => {
    resetAudio();
    const targetIndex = direction === 'next' ? chapterCount : chapterCount - 2;

    if (targetIndex >= 0 && targetIndex < storyHistory.length) {
      const targetPage = storyHistory[targetIndex];
      const targetSentences = (targetPage.bolum_metni.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [targetPage.bolum_metni]).map((s) => s.trim());

      executeRealisticPageFlip(() => {
        setCurrentPart(targetPage);
        setChapterCount(targetIndex + 1);
      });

      fetchAudioAsync(targetPage.bolum_metni, targetSentences);
    }
  };

  const handlePlayPause = () => {
    if (!currentPart) return;

    if (isPlaying) {
      try {
        if (soundPlayerRef.current) soundPlayerRef.current.pause();
        if (bgMusicPlayerRef.current) bgMusicPlayerRef.current.pause();
      } catch {}
      setIsPlaying(false);
      setIsPaused(true);
      return;
    }

    if (isPaused && soundPlayerRef.current && loadedNarratorId === selectedNarrator.id) {
      try {
        soundPlayerRef.current.play();
        if (bgMusicPlayerRef.current) bgMusicPlayerRef.current.play();
        setIsPlaying(true);
        setIsPaused(false);
        return;
      } catch {}
    }

    setVoiceLoading(true);
    fetch(`${BACKEND_URL}/generate-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: currentPart.bolum_metni,
        narrator_id: selectedNarrator.id,
        language: selectedLanguage,
        speed: playbackSpeed,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        playAudioFromBase64(data.audio_base64, currentSentences);
      })
      .catch(() => {})
      .finally(() => setVoiceLoading(false));
  };

  const halfWidth = contentW / 2;

  const pageRotateY = pageFlipProgress.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['75deg', '0deg', '-75deg'],
  });

  const pageCurlScale = pageFlipProgress.interpolate({
    inputRange: [-1, -0.5, 0, 0.5, 1],
    outputRange: [0.94, 0.97, 1, 0.97, 0.94],
  });

  const validSelectedImage = useMemo(() => sanitizeImageUri(selectedImage), [selectedImage]);

  const showHome = !currentPart && !introPart;
  const isEn = selectedLanguage === 'en';

  return (
    <>
      <ScrollView contentContainerStyle={styles.roomContainer} showsVerticalScrollIndicator={false}>
        <StatusBar barStyle="light-content" backgroundColor="#1E1B4B" />

        <View style={[styles.contentWrap, { maxWidth: contentW }]}>
          {/* Üst Panel: sol rozet esner, sağ butonlar sabit; çakışmaz */}
          <View style={styles.roomHeader}>
            <View style={styles.headerLeft}>
              {currentPart || introPart ? (
                <TouchableOpacity onPress={resetForNewDoodle} style={styles.newDoodleBtn}>
                  <BtnLabel icon="refresh" text={isEn ? 'New Doodle' : 'Yeni Çizim'} size={12} />
                </TouchableOpacity>
              ) : (
                <View style={styles.treeHouseBadge}>
                  <Text
                    style={styles.treeHouseBadgeText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {isEn ? '✨ MAGICAL STORY ROOM 🌿' : '✨ BÜYÜLÜ MASAL ODASI 🌿'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => setIsLibraryOpen(true)} style={styles.magicLibraryBtn}>
                <BtnLabel
                  icon="bookshelf"
                  text={isEn ? `Books (${savedBooks.length})` : `Kitaplık (${savedBooks.length})`}
                  color="#C7D2FE"
                  size={12}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsSettingsOpen(true)} style={styles.settingsHeaderBtn}>
                <MaterialCommunityIcons name="cog" size={20} color="#1E1B4B" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.roomTitle}>StoryDoodle 🎨</Text>
          <Text style={styles.roomSubtitle}>
            {isReadingSavedBook
              ? (isEn ? '📖 Reading from your library' : '📖 Masal Kitaplığından Okuyorsun')
              : (isEn ? 'Draw your hero and turn the magical pages!' : 'Çizimini yap, sihirli kitabın yaprakları açılsın!')}
          </Text>

          {/* 0. Durum: Çizim canlanıyor! */}
          {introPart && validSelectedImage && (
            <View style={styles.introWrapper}>
              <Text style={styles.introHeadline}>
                {isEn
                  ? `Look, ${introPart.karakter_adi} came alive! 🎉`
                  : `Bak, ${introPart.karakter_adi} canlandı! 🎉`}
              </Text>

              <View style={styles.introStage}>
                <View style={[styles.goldCorner, styles.cTopLeft]} />
                <View style={[styles.goldCorner, styles.cTopRight]} />
                <View style={[styles.goldCorner, styles.cBottomLeft]} />
                <View style={[styles.goldCorner, styles.cBottomRight]} />

                <AnimatedDoodle
                  uri={validSelectedImage}
                  type={introPart.animasyon_tipi || 'nefes_al'}
                  effectPoint={introPart.efekt_noktasi}
                  size={stageSize}
                />
              </View>

              <Text style={styles.introSub}>
                {isEn ? 'Your story is about to begin...' : 'Masalın birazdan başlıyor...'}
              </Text>

              <View style={{ width: '100%', maxWidth: btnRowMax }}>
                <FluffyButton bg="#F59E0B" shadow="#B45309" onPress={finishIntro} style={styles.startStoryBtn}>
                  <BtnLabel icon="book-open-page-variant" text={isEn ? 'Start the Story!' : 'Masala Başla!'} size={16} />
                </FluffyButton>
              </View>
            </View>
          )}

          {/* 1. Durum: Kapak */}
          {showHome && (
            <View style={[styles.bookCoverWrapper, { width: coverW, height: coverH }]}>
              <View style={styles.bookSpine3D} />

              <View style={styles.bookCoverFace}>
                <View style={[styles.goldCorner, styles.cTopLeft]} />
                <View style={[styles.goldCorner, styles.cTopRight]} />
                <View style={[styles.goldCorner, styles.cBottomLeft]} />
                <View style={[styles.goldCorner, styles.cBottomRight]} />

                <Text style={styles.bookCoverHeader}>
                  {isEn ? '✨ MAGIC BOOK COVER ✨' : '✨ SİHİRLİ KİTAP KAPAĞI ✨'}
                </Text>

                <View style={[styles.ovalFrame, { width: ovalSize, height: ovalSize, borderRadius: ovalSize / 2 }]}>
                  {validSelectedImage ? (
                    <Image source={{ uri: validSelectedImage }} style={styles.coverDrawingImage} />
                  ) : (
                    <View style={styles.emptyDrawingPrompt}>
                      <MaterialCommunityIcons name="auto-fix" size={46} color="#78350F" />
                      <Text style={styles.emptyDrawingTitle}>
                        {isEn ? 'Draw Your Cover!' : 'Kapağı Sen Çiz!'}
                      </Text>
                      <Text style={styles.emptyDrawingSub}>
                        {isEn ? 'Draw below or upload a photo' : 'Aşağıdan çiz veya fotoğraf yükle'}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.bookCoverRibbon}>
                  {isEn ? '🎀 Choose the Hero of Your Tale 🎀' : '🎀 Maceranın Kahramanını Belirle 🎀'}
                </Text>
              </View>
            </View>
          )}

          {/* Butonlar */}
          {showHome && (
            <View style={[styles.actionRowThree, { maxWidth: btnRowMax }]}>
              <View style={styles.actionBtnWrapper}>
                <FluffyButton bg="#EC4899" shadow="#BE185D" onPress={openFreeDraw} style={styles.actionBtnContent}>
                  <BtnLabel icon="pencil" text={isEn ? 'Draw' : 'Çiz'} />
                </FluffyButton>
              </View>

              <View style={styles.actionBtnWrapper}>
                <FluffyButton bg="#8B5CF6" shadow="#6D28D9" onPress={() => setIsTemplateModalOpen(true)} style={styles.actionBtnContent}>
                  <BtnLabel icon="puzzle" text={isEn ? 'Templates' : 'Şablon'} />
                </FluffyButton>
              </View>

              <View style={styles.actionBtnWrapper}>
                <FluffyButton bg="#3B82F6" shadow="#1D4ED8" onPress={takePhoto} style={styles.actionBtnContent}>
                  <BtnLabel icon="camera" text={isEn ? 'Camera' : 'Çek'} />
                </FluffyButton>
              </View>

              <View style={styles.actionBtnWrapper}>
                <FluffyButton bg="#10B981" shadow="#047857" onPress={pickImage} style={styles.actionBtnContent}>
                  <BtnLabel icon="image-multiple" text={isEn ? 'Gallery' : 'Galeri'} />
                </FluffyButton>
              </View>
            </View>
          )}

          {/* Masal Başlat */}
          {validSelectedImage && showHome && (
            <View style={[styles.startStoryWrapper, { maxWidth: btnRowMax }]}>
              <FluffyButton bg="#F59E0B" shadow="#B45309" onPress={generateInitialStory} disabled={loading} style={styles.startStoryBtn}>
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <BtnLabel icon="creation" text={isEn ? 'Bring It to Life!' : 'Çizimimi Canlandır!'} size={16} />
                )}
              </FluffyButton>
            </View>
          )}

          {/* 2. Durum: Açılmış Kitap */}
          {currentPart && (
            <View style={styles.storybookContainer}>
              <View style={styles.bookSpineLeft} />

              <Animated.View
                style={[
                  styles.openStoryCard,
                  {
                    transform: [
                      { perspective: 1400 },
                      { translateX: -halfWidth },
                      { rotateY: pageRotateY },
                      { translateX: halfWidth },
                      { scale: pageCurlScale },
                    ],
                  },
                ]}
              >
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.sparkleOverlay,
                    { opacity: sparkleAnim, transform: [{ scale: sparkleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }] },
                  ]}
                >
                  <Text style={styles.sparkleIcon}>✨⭐✨</Text>
                </Animated.View>

                {/* Rozetler: sığmazsa alt satıra geçer, taşmaz/üst üste binmez */}
                <View style={styles.pageHeaderRow}>
                  {validSelectedImage && (
                    <View style={styles.floatingDoodleBadge}>
                      <Image source={{ uri: validSelectedImage }} style={styles.floatingDoodleImg} />
                      <Text style={styles.floatingDoodleText} numberOfLines={1}>
                        {isEn ? 'Your Art 🎨' : 'Senin Çizimin 🎨'}
                      </Text>
                    </View>
                  )}

                  <View style={styles.characterPill}>
                    <Text style={styles.characterPillEmoji}>🌟</Text>
                    <Text style={styles.characterPillText} numberOfLines={1}>{currentPart.karakter_adi}</Text>
                  </View>

                  <View style={styles.pageCountPill}>
                    <Text style={styles.pageCountText} numberOfLines={1}>
                      {isEn ? 'Page' : 'Sayfa'} {chapterCount} / {isReadingSavedBook ? storyHistory.length : 3}
                    </Text>
                  </View>
                </View>

                {currentPart.secilen_yol_metni ? (
                  <View style={styles.chosenRoadBanner}>
                    <Text style={styles.chosenRoadText}>
                      {isEn ? '👣 Path: ' : '👣 Seçilen Yol: '}{currentPart.secilen_yol_metni}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.storyPageTitle}>{currentPart.masal_basligi}</Text>

                <CinematicScene uri={currentPart.sahne_img_url} />

                <View style={styles.parchmentTextBox}>
                  {currentSentences.map((sentence, idx) => {
                    const isCurrent = idx === activeSentenceIndex && isPlaying;
                    return (
                      <Text
                        key={idx}
                        style={[
                          styles.parchmentSentence,
                          isCurrent && styles.parchmentSentenceActive,
                        ]}
                      >
                        {sentence}{' '}
                      </Text>
                    );
                  })}
                </View>

                {/* Dinle / Durdur */}
                <View style={styles.playbackControlsRow}>
                  <View style={{ flex: 1 }}>
                    <FluffyButton
                      bg={isPlaying ? '#EF4444' : '#F59E0B'}
                      shadow={isPlaying ? '#B91C1C' : '#B45309'}
                      onPress={handlePlayPause}
                      disabled={voiceLoading}
                      style={styles.playFluffyBtn}
                    >
                      {voiceLoading ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : isPlaying ? (
                        <BtnLabel icon="pause" text={isEn ? 'Pause Story' : 'Masalı Duraklat'} />
                      ) : isPaused ? (
                        <BtnLabel icon="play" text={isEn ? 'Resume Story' : 'Masala Devam Et'} />
                      ) : (
                        <BtnLabel icon="volume-high" text={isEn ? 'Listen Story' : 'Masalı Dinle'} />
                      )}
                    </FluffyButton>
                  </View>

                  {(isPlaying || isPaused) && (
                    <View style={{ width: 50, marginLeft: 8 }}>
                      <FluffyButton bg="#94A3B8" shadow="#475569" onPress={resetAudio} style={styles.stopFluffyBtn}>
                        <MaterialCommunityIcons name="stop" size={20} color="#FFF" />
                      </FluffyButton>
                    </View>
                  )}
                </View>

                <Text style={styles.narratorSectionLabel}>
                  {isEn ? '🎙️ Choose Narrator:' : '🎙️ Masalcıyı Değiştir:'}
                </Text>
                <ScrollView
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={styles.narratorScroll}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {NARRATORS.map((n) => {
                    const isSelected = selectedNarrator.id === n.id;
                    return (
                      <TouchableOpacity
                        key={n.id}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (selectedNarrator.id !== n.id) {
                            resetAudio();
                            setSelectedNarrator(n);
                          }
                        }}
                        style={[
                          styles.narratorBubble,
                          { borderColor: isSelected ? '#F59E0B' : '#E2E8F0' },
                          isSelected && { backgroundColor: '#FEF3C7', transform: [{ scale: 1.05 }] },
                        ]}
                      >
                        <View style={[styles.narratorAvatarCircle, { backgroundColor: n.color, borderColor: n.border }]}>
                          <Text style={{ fontSize: 20 }}>{n.icon}</Text>
                        </View>
                        <Text style={[styles.narratorNameText, isSelected && styles.narratorNameActive]} numberOfLines={1}>
                          {isEn ? n.nameEn : n.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {isReadingSavedBook ? (
                  <View style={styles.savedReadingNavArea}>
                    <Text style={styles.savedNavHeader}>
                      {isEn ? '📖 Turn Pages' : '📖 Sayfaları Çevir'}
                    </Text>
                    <View style={styles.savedNavBtnRow}>
                      <TouchableOpacity
                        onPress={() => navigateSavedBookPage('prev')}
                        disabled={chapterCount === 1}
                        style={[styles.savedNavBtn, chapterCount === 1 && styles.savedNavBtnDisabled]}
                      >
                        <BtnLabel
                          icon="chevron-left"
                          text={isEn ? 'Prev Page' : 'Önceki Sayfa'}
                          size={12}
                          color={chapterCount === 1 ? '#94A3B8' : '#FFF'}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => navigateSavedBookPage('next')}
                        disabled={chapterCount === storyHistory.length}
                        style={[styles.savedNavBtn, styles.savedNavBtnNext, chapterCount === storyHistory.length && styles.savedNavBtnDisabled]}
                      >
                        <BtnLabel
                          icon="chevron-right"
                          iconRight
                          text={isEn ? 'Next Page' : 'Sonraki Sayfa'}
                          size={12}
                          color={chapterCount === storyHistory.length ? '#94A3B8' : '#FFF'}
                        />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={resetAllStory} style={styles.exitLibraryBtn}>
                      <BtnLabel
                        icon="creation"
                        text={isEn ? 'Back to Drawing' : 'Yeni Bir Masal Çizmeye Dön'}
                        color="#6366F1"
                        size={11.5}
                        weight="800"
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  !currentPart.is_final ? (
                    <View style={styles.pathChoicesCard}>
                      <Text style={styles.pathChoicesTitle}>
                        {isEn ? '🧭 What is Your Choice?' : '🧭 Kararın Ne? Hangi Yoldan Gidelim?'}
                      </Text>
                      <Text style={styles.pathChoicesSub}>
                        {isEn ? 'Tap an image and guide the journey!' : 'Resme dokun ve masalın yönünü sen belirle!'}
                      </Text>

                      {continuingLoading ? (
                        <View style={styles.choicesLoadingWrap}>
                          <ActivityIndicator color="#F59E0B" size="large" />
                          <Text style={styles.choicesLoadingText}>
                            {isEn ? 'Turning page...' : 'Yeni sayfa hazırlanıyor...'}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.choicesTwoCol}>
                          <View style={{ flex: 1 }}>
                            <FluffyButton
                              bg="#FFF7ED"
                              shadow="#EA580C"
                              onPress={() => handleChoiceSelect(currentPart.secenek_1)}
                              disabled={isPlaying || continuingLoading}
                              style={styles.choiceCardBtn}
                            >
                              <SmartChoiceImage fallback={currentPart.secenek_1_emoji || '🌲'} uri={currentPart.secenek_1_img_url} />
                              <View style={styles.choiceLabelWrap}>
                                <Text style={styles.choiceLabelText}>{currentPart.secenek_1}</Text>
                              </View>
                              <View style={styles.choiceSelectBadge}>
                                <BtnLabel
                                  icon="arrow-right"
                                  iconRight
                                  text={isEn ? 'Go This Way' : 'Bu Yoldan Git'}
                                  size={9.5}
                                />
                              </View>
                            </FluffyButton>
                          </View>

                          <View style={{ flex: 1 }}>
                            <FluffyButton
                              bg="#FDF4FF"
                              shadow="#A21CAF"
                              onPress={() => handleChoiceSelect(currentPart.secenek_2)}
                              disabled={isPlaying || continuingLoading}
                              style={styles.choiceCardBtn}
                            >
                              <SmartChoiceImage fallback={currentPart.secenek_2_emoji || '🎈'} uri={currentPart.secenek_2_img_url} />
                              <View style={styles.choiceLabelWrap}>
                                <Text style={styles.choiceLabelText}>{currentPart.secenek_2}</Text>
                              </View>
                              <View style={[styles.choiceSelectBadge, { backgroundColor: '#C026D3' }]}>
                                <BtnLabel
                                  icon="arrow-right"
                                  iconRight
                                  text={isEn ? 'Go This Way' : 'Bu Yoldan Git'}
                                  size={9.5}
                                />
                              </View>
                            </FluffyButton>
                          </View>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.celebrationEndBox}>
                      <Text style={{ fontSize: 44, marginBottom: 4 }}>🎉🏆✨</Text>
                      <Text style={styles.celebrationTitle}>
                        {isEn ? 'Our Tale Ended Happily!' : 'Kitabımız Mutlu Sonla Bitti!'}
                      </Text>
                      <Text style={styles.celebrationSub}>
                        {isReadingSavedBook
                          ? (isEn ? 'You completed your recorded book!' : 'Kayıtlı masalı keyifle tamamladın!')
                          : (isEn ? 'Saved automatically to your Library!' : 'Masalın "Kitaplığım" bölümüne kaydedildi!')}
                      </Text>
                      <View style={{ width: '100%' }}>
                        <FluffyButton
                          bg="#10B981"
                          shadow="#047857"
                          onPress={resetAllStory}
                          style={{ marginTop: 14, paddingVertical: 14 }}
                        >
                          <BtnLabel icon="refresh" text={isEn ? 'Draw a New Tale' : 'Baştan Yeni Bir Masal Çiz'} />
                        </FluffyButton>
                      </View>
                    </View>
                  )
                )}
              </Animated.View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ------------------------- Ayarlar Modalı ------------------------- */}
      <ModalShell visible={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} maxW={modalMaxW}>
        <ModalTopBar
          onClose={() => setIsSettingsOpen(false)}
          closeText={isEn ? 'Close' : 'Kapat'}
          title={isEn ? 'Room Settings' : 'Oda Ayarları'}
        />

        {/* Slider sürüklenirken scrollEnabled=false: sayfa yukarı-aşağı oynamaz */}
        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled={!sliderDragging}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Dil Seçimi */}
          <View style={styles.settingsSection}>
            <BtnLabel icon="earth" text={isEn ? 'Story Language' : 'Masal Dili'} color="#FDE68A" size={13.5} />
            <View style={styles.settingsRow}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedLanguage('tr');
                  saveSettingsToStorage('tr', musicVolume, narratorVolume, playbackSpeed);
                }}
                style={[styles.langBtn, selectedLanguage === 'tr' && styles.langBtnActive]}
              >
                <Text style={[styles.langCode, selectedLanguage === 'tr' && styles.langBtnTextActive]}>TR</Text>
                <Text style={[styles.langBtnText, selectedLanguage === 'tr' && styles.langBtnTextActive]}>Türkçe</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setSelectedLanguage('en');
                  saveSettingsToStorage('en', musicVolume, narratorVolume, playbackSpeed);
                }}
                style={[styles.langBtn, selectedLanguage === 'en' && styles.langBtnActive]}
              >
                <Text style={[styles.langCode, selectedLanguage === 'en' && styles.langBtnTextActive]}>EN</Text>
                <Text style={[styles.langBtnText, selectedLanguage === 'en' && styles.langBtnTextActive]}>English</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Müzik Sesi */}
          <View style={styles.settingsSection}>
            <View style={styles.settingsTitleRow}>
              <View style={{ flex: 1 }}>
                <BtnLabel
                  icon="music"
                  text={isEn ? 'Lullaby Music Volume' : 'Arka Plan Ninni Müziği'}
                  color="#FDE68A"
                  size={13.5}
                />
              </View>
              <Text style={styles.volumeValueText}>{Math.round((musicVolume / 0.5) * 100)}%</Text>
            </View>

            <VolumeSlider
              value={musicVolume}
              min={0}
              max={0.5}
              leftIcon="volume-off"
              rightIcon="music-note"
              onChange={(v) => setMusicVolume(v)}
              onComplete={(v) => saveSettingsToStorage(selectedLanguage, v, narratorVolume, playbackSpeed)}
              onDragStart={() => setSliderDragging(true)}
              onDragEnd={() => setSliderDragging(false)}
            />
          </View>

          {/* Masalcı Sesi */}
          <View style={styles.settingsSection}>
            <View style={styles.settingsTitleRow}>
              <View style={{ flex: 1 }}>
                <BtnLabel
                  icon="microphone"
                  text={isEn ? 'Narrator Voice Volume' : 'Masalcı Ses Düzeyi'}
                  color="#FDE68A"
                  size={13.5}
                />
              </View>
              <Text style={styles.volumeValueText}>{Math.round(narratorVolume * 100)}%</Text>
            </View>

            <VolumeSlider
              value={narratorVolume}
              min={0}
              max={1}
              leftIcon="volume-low"
              rightIcon="volume-high"
              color="#10B981"
              onChange={(v) => setNarratorVolume(v)}
              onComplete={(v) => saveSettingsToStorage(selectedLanguage, musicVolume, v, playbackSpeed)}
              onDragStart={() => setSliderDragging(true)}
              onDragEnd={() => setSliderDragging(false)}
            />
          </View>

          {/* Hız */}
          <View style={styles.settingsSection}>
            <BtnLabel icon="timer-outline" text={isEn ? 'Narration Speed' : 'Masal Okuma Hızı'} color="#FDE68A" size={13.5} />
            <View style={styles.settingsRow}>
              {[
                { speed: 0.8, icon: 'weather-night', label: isEn ? 'Calm (0.8x)' : 'Sakin (0.8x)' },
                { speed: 1.0, icon: 'creation', label: 'Normal (1.0x)' },
                { speed: 1.2, icon: 'flash', label: isEn ? 'Lively (1.2x)' : 'Canlı (1.2x)' },
              ].map((item) => {
                const isSelected = playbackSpeed === item.speed;
                return (
                  <TouchableOpacity
                    key={item.speed}
                    onPress={() => {
                      setPlaybackSpeed(item.speed);
                      saveSettingsToStorage(selectedLanguage, musicVolume, narratorVolume, item.speed);
                    }}
                    style={[styles.speedBtn, isSelected && styles.speedBtnActive]}
                  >
                    <BtnLabel icon={item.icon} text={item.label} color={isSelected ? '#1E1B4B' : '#C7D2FE'} size={11} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Önbellek */}
          <View style={[styles.settingsSection, { borderColor: '#EF4444' }]}>
            <BtnLabel icon="broom" text={isEn ? 'Storage & Memory' : 'Hafıza & Önbellek'} color="#F87171" size={13.5} />
            <Text style={{ color: '#C7D2FE', fontSize: 11.5, marginTop: 6, marginBottom: 12 }}>
              {isEn
                ? 'Clears all recorded books and temporary audio cache from the device.'
                : 'Cihazdaki kayıtlı masalları ve geçici ses dosyalarını sıfırlar.'}
            </Text>
            <TouchableOpacity onPress={clearAllCache} style={styles.clearCacheBtn}>
              <BtnLabel icon="delete" text={isEn ? 'Reset All Data' : 'Tüm Verileri Sıfırla'} size={12} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ModalShell>

      {/* ------------------------- Kitaplık Modalı ------------------------ */}
      <ModalShell visible={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} maxW={modalMaxW}>
        <ModalTopBar
          onClose={() => setIsLibraryOpen(false)}
          closeText={isEn ? 'Close' : 'Kapat'}
          title={isEn ? 'My Library' : 'Masal Kitaplığım'}
        />

        {savedBooks.length === 0 ? (
          <View style={styles.emptyLibraryBox}>
            <Text style={{ fontSize: 60 }}>🏰</Text>
            <Text style={styles.emptyLibraryHead}>
              {isEn ? 'Your Shelf is Empty' : 'Kitaplığın Henüz Boş'}
            </Text>
            <Text style={styles.emptyLibrarySub}>
              {isEn
                ? 'Every tale you finish will be placed here automatically!'
                : 'Çizip tamamladığın her sihirli masal otomatik olarak bu büyülü rafa yerleşecek!'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={savedBooks}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 35, paddingTop: 10 }}
            renderItem={({ item }) => {
              const bookThumbUri = sanitizeImageUri(item.coverImage);
              return (
                <View style={styles.savedBookShelfItem}>
                  {bookThumbUri ? (
                    <Image source={{ uri: bookThumbUri }} style={styles.savedBookThumb} />
                  ) : (
                    <View style={styles.savedBookPlaceholder}>
                      <MaterialCommunityIcons name="palette" size={28} color="#B45309" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.savedBookItemTitle}>{item.title}</Text>
                    <Text style={styles.savedBookItemMeta}>
                      🌟 {item.characterName} • {item.history?.length || 3} {isEn ? 'Pages' : 'Sayfa'} • {item.date}
                    </Text>
                    <View style={styles.savedBookActions}>
                      <TouchableOpacity onPress={() => openBookFromLibrary(item)} style={styles.openSavedBookBtn}>
                        <BtnLabel icon="book-open-variant" text={isEn ? 'Read' : 'Kitabı Oku'} size={10.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteBookFromLibrary(item.id)} style={styles.deleteSavedBookBtn}>
                        <MaterialCommunityIcons name="delete" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </ModalShell>

      {/* ------------------- Hazır Şablon Seçici Modalı ------------------- */}
      <ModalShell visible={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} maxW={modalMaxW}>
        <ModalTopBar
          onClose={() => setIsTemplateModalOpen(false)}
          closeText={isEn ? 'Close' : 'Kapat'}
          title={isEn ? 'Pick a Template' : 'Şablon Seç'}
        />

        <Text style={styles.templateModalSub}>
          {isEn ? 'Connect the dots to draw!' : 'Noktaları birleştirerek çiz!'}
        </Text>

        {/* Kategoriler artık kaydırmalı değil: hepsi görünür, sığmazsa alt satıra geçer */}
        <View style={styles.categoryChipRow}>
          {TEMPLATE_CATEGORIES.map((cat) => {
            const isActive = templateCategoryFilter === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setTemplateCategoryFilter(cat.id)}
                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
              >
                <BtnLabel
                  icon={cat.icon}
                  text={isEn ? cat.labelEn : cat.label}
                  color={isActive ? '#FFF' : '#C7D2FE'}
                  size={12}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.templateGrid, { gap: tplGap }]}
          showsVerticalScrollIndicator={false}
        >
          {TEMPLATES.filter((t) => templateCategoryFilter === 'all' || t.category === templateCategoryFilter).map((tpl) => (
            <TouchableOpacity
              key={tpl.id}
              onPress={() => openTemplateDrawing(tpl)}
              style={[styles.templateCard, { width: tplCardW, height: tplCardW }]}
            >
              <Text style={styles.templateCardEmoji}>{tpl.emoji}</Text>
              <Text style={styles.templateCardName} numberOfLines={1}>
                {isEn ? tpl.nameEn : tpl.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ModalShell>

      {/* ---------------------- Çizim Tuvali Modalı ----------------------- */}
      <ModalShell visible={isDrawModalOpen} onClose={() => setIsDrawModalOpen(false)} maxW={modalMaxW} centerItems>
        {/* Üst çubuk: Vazgeç | Başlık (esner) | Kaydet — birbirine girmez */}
        <View style={styles.canvasTopBar}>
          <TouchableOpacity onPress={() => setIsDrawModalOpen(false)} style={styles.canvasCancelBtn}>
            <BtnLabel icon="close" text={isEn ? 'Cancel' : 'Vazgeç'} color="#F87171" size={14} />
          </TouchableOpacity>

          <View style={styles.canvasTitleWrap}>
            <Text style={styles.canvasTitleText} numberOfLines={1}>
              {activeTemplate
                ? `${activeTemplate.emoji} ${isEn ? activeTemplate.nameEn : activeTemplate.name}`
                : (isEn ? 'Magic Canvas' : 'Sihirli Tuval')}
            </Text>
            <View style={styles.activeBrushPreviewBadge}>
              <View
                style={{
                  backgroundColor: activeTool === 'eraser' ? '#FFFFFF' : currentColor,
                  width: Math.min(currentToolConfig.width, 16),
                  height: Math.min(currentToolConfig.width, 16),
                  borderRadius: Math.min(currentToolConfig.width, 16) / 2,
                }}
              />
            </View>
          </View>

          <TouchableOpacity onPress={saveDoodleAndClose} style={styles.canvasDoneBtn}>
            <BtnLabel icon="check" text={isEn ? 'Save Cover' : 'Kapağı Yap'} size={13} />
          </TouchableOpacity>
        </View>

        {/* Araçlar */}
        <View style={styles.toolTypeBar}>
          <TouchableOpacity
            onPress={() => setActiveTool('pen')}
            style={[styles.toolTypeBtn, activeTool === 'pen' && styles.toolTypeBtnActive]}
          >
            <MaterialCommunityIcons name="pencil" size={22} color="#FFF" />
            <Text style={[styles.toolTypeLabel, activeTool === 'pen' && styles.toolTypeLabelActive]}>
              {isEn ? 'Pen' : 'Kalem'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTool('crayon')}
            style={[styles.toolTypeBtn, activeTool === 'crayon' && styles.toolTypeBtnActive]}
          >
            <MaterialCommunityIcons name="brush" size={22} color="#FFF" />
            <Text style={[styles.toolTypeLabel, activeTool === 'crayon' && styles.toolTypeLabelActive]}>
              {isEn ? 'Crayon' : 'Pastel'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTool('magic')}
            style={[styles.toolTypeBtn, activeTool === 'magic' && styles.toolTypeBtnActive]}
          >
            <MaterialCommunityIcons name="auto-fix" size={22} color="#FFF" />
            <Text style={[styles.toolTypeLabel, activeTool === 'magic' && styles.toolTypeLabelActive]}>
              {isEn ? 'Glow' : 'Büyülü'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTool('eraser')}
            style={[styles.toolTypeBtn, styles.eraserTypeBtn, activeTool === 'eraser' && styles.eraserTypeBtnActive]}
          >
            <MaterialCommunityIcons name="eraser" size={22} color={activeTool === 'eraser' ? '#1E1B4B' : '#FFF'} />
            <Text style={[styles.toolTypeLabel, activeTool === 'eraser' && { color: '#1E1B4B' }]}>
              {isEn ? 'Eraser' : 'Silgi'}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTemplate && (
          <View style={styles.templateHintBanner}>
            <BtnLabel
              icon="brush"
              text={isEn ? 'Trace over the dots to draw the shape!' : 'Noktaların üzerinden geçerek şekli çiz!'}
              color="#DDD6FE"
              size={11.5}
              weight="800"
            />
          </View>
        )}

        {/* Tuval */}
        <View style={[styles.canvasBox, { width: canvasSize, height: canvasSize }]}>
          <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.85, result: 'base64' }}>
            <View
              style={[styles.canvasSvgArea, { width: canvasSize, height: canvasSize }]}
              {...panResponder.panHandlers}
            >
              <Svg height={canvasSize} width={canvasSize}>
                {/* Kılavuz noktalar: kayıt sırasında (captureMode) çizilmez */}
                {activeTemplate && !captureMode &&
                  getScaledTemplateDots(activeTemplate, canvasSize, canvasSize).map((stroke, si) => (
                    <React.Fragment key={`tpl-${si}`}>
                      <Path
                        d={strokeToPathD(stroke)}
                        stroke="#CBD5E1"
                        strokeWidth={2}
                        strokeDasharray="5,6"
                        strokeLinecap="round"
                        fill="none"
                      />
                      {stroke.dots.map((pt, pi) => (
                        <Circle
                          key={`tpl-${si}-${pi}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={5}
                          fill="#FFFFFF"
                          stroke="#94A3B8"
                          strokeWidth={2}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                {paths.map((p, i) => (
                  <Path
                    key={i}
                    d={p.d}
                    stroke={p.color}
                    strokeWidth={p.width}
                    strokeOpacity={p.opacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke={currentToolConfig.color}
                    strokeWidth={currentToolConfig.width}
                    strokeOpacity={currentToolConfig.opacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ) : null}
              </Svg>
            </View>
          </ViewShot>
        </View>

        {/* Boyut Ayarı */}
        <View style={styles.sizeAdjusterRow}>
          <View style={styles.sizeLabelWrap}>
            <MaterialCommunityIcons
              name={activeTool === 'eraser' ? 'eraser' : 'ruler'}
              size={16}
              color="#FDE68A"
            />
            <Text style={styles.sizeAdjusterText} numberOfLines={1}>
              {activeTool === 'eraser'
                ? (isEn ? 'Eraser' : 'Silgi')
                : (isEn ? 'Size' : 'Kalınlık')}
            </Text>
          </View>

          <View style={styles.brushPickers}>
            {[1, 2, 3, 4].map((level) => {
              const isSelected = activeTool === 'eraser' ? eraserSizeLevel === level : brushSizeLevel === level;
              const dotSize = 4 + level * 4;
              return (
                <TouchableOpacity
                  key={level}
                  onPress={() => {
                    if (activeTool === 'eraser') {
                      setEraserSizeLevel(level);
                    } else {
                      setBrushSizeLevel(level);
                    }
                  }}
                  style={[styles.brushBtn, isSelected && styles.brushBtnActive]}
                >
                  <View
                    style={{
                      width: dotSize,
                      height: dotSize,
                      borderRadius: dotSize / 2,
                      backgroundColor: isSelected ? '#F59E0B' : '#E2E8F0',
                    }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.quickActions}>
            <TouchableOpacity onPress={undoCanvas} style={styles.canvasUtilBtn}>
              <BtnLabel icon="undo" text={isEn ? 'Undo' : 'Geri'} size={11} weight="800" />
            </TouchableOpacity>
            <TouchableOpacity onPress={clearCanvas} style={[styles.canvasUtilBtn, { backgroundColor: '#FEE2E2' }]}>
              <MaterialCommunityIcons name="delete" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Palet */}
        {activeTool !== 'eraser' ? (
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.paletteScroll}
          >
            {EXPANDED_PALETTE.map((p) => {
              const isSelected = currentColor === p.color;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setCurrentColor(p.color)}
                  style={[styles.colorBall, { backgroundColor: p.color }, isSelected && styles.colorBallActive]}
                >
                  {isSelected && <MaterialCommunityIcons name="check" size={18} color="#FFF" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.eraserTipNotice}>
            <BtnLabel
              icon="lightbulb-on-outline"
              text={isEn ? 'Drag your finger to erase any lines' : 'Parmağınla dilediğin çizgiyi silebilirsin'}
              color="#FDE68A"
              size={11.5}
              weight="800"
            />
          </View>
        )}
      </ModalShell>
    </>
  );
}

const styles = StyleSheet.create({
  /* Ortak */
  btnLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  contentWrap: {
    width: '100%',
    alignItems: 'center',
  },
  roomContainer: {
    flexGrow: 1,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 40,
    paddingHorizontal: 12,
  },

  /* Modal kabuğu */
  modalOuter: {
    flex: 1,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 55 : 35,
  },
  modalInner: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 16,
  },
  modalTopBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalSideSlot: {
    width: 92,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  modalBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
  },

  /* Üst panel */
  roomHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  headerLeft: {
    flex: 1,
    alignItems: 'flex-start',
    marginRight: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  newDoodleBtn: {
    backgroundColor: '#EC4899',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F472B6',
  },
  treeHouseBadge: {
    maxWidth: '100%',
    backgroundColor: 'rgba(254, 243, 199, 0.15)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  treeHouseBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FDE68A',
  },
  magicLibraryBtn: {
    backgroundColor: '#312E81',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#818CF8',
  },
  settingsHeaderBtn: {
    backgroundColor: '#F59E0B',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  roomTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(245, 158, 11, 0.4)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  roomSubtitle: {
    fontSize: 12.5,
    color: '#C7D2FE',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 16,
    textAlign: 'center',
  },

  /* Animasyon (intro) sahnesi */
  introWrapper: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  introHeadline: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FDE68A',
    textAlign: 'center',
    marginBottom: 12,
  },
  introStage: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 4,
    borderColor: '#F59E0B',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    position: 'relative',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  introSub: {
    fontSize: 12.5,
    color: '#C7D2FE',
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },

  /* Kapak */
  bookCoverWrapper: {
    backgroundColor: '#B45309',
    borderRadius: 24,
    paddingLeft: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  bookSpine3D: {
    position: 'absolute',
    left: 4,
    top: 15,
    bottom: 15,
    width: 6,
    backgroundColor: '#D97706',
    borderRadius: 3,
  },
  bookCoverFace: {
    flex: 1,
    backgroundColor: '#78350F',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#F59E0B',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    position: 'relative',
    justifyContent: 'space-between',
  },
  bookCoverHeader: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  goldCorner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: '#F59E0B',
  },
  cTopLeft: { top: 6, left: 6, borderTopWidth: 3, borderLeftWidth: 3 },
  cTopRight: { top: 6, right: 6, borderTopWidth: 3, borderRightWidth: 3 },
  cBottomLeft: { bottom: 6, left: 6, borderBottomWidth: 3, borderLeftWidth: 3 },
  cBottomRight: { bottom: 6, right: 6, borderBottomWidth: 3, borderRightWidth: 3 },
  ovalFrame: {
    backgroundColor: '#FFFDF9',
    borderWidth: 4,
    borderColor: '#F59E0B',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  coverDrawingImage: {
    width: '100%',
    height: '100%',
  },
  emptyDrawingPrompt: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  emptyDrawingTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#78350F',
    marginTop: 4,
  },
  emptyDrawingSub: {
    fontSize: 10.5,
    color: '#A16207',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  bookCoverRibbon: {
    color: '#FEF3C7',
    fontSize: 10,
    fontWeight: '800',
  },

  /* Butonlar */
  fluffyBtnWrap: {
    position: 'relative',
    width: '100%',
  },
  fluffyUnderShadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: -4,
    borderRadius: 18,
  },
  fluffyFrontBase: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  actionRowThree: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  actionBtnWrapper: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  actionBtnContent: {
    paddingVertical: 12,
    width: '100%',
  },
  startStoryWrapper: {
    width: '100%',
    marginBottom: 20,
  },
  startStoryBtn: {
    paddingVertical: 15,
  },

  /* Açık kitap */
  storybookContainer: {
    width: '100%',
    position: 'relative',
    marginTop: 6,
  },
  bookSpineLeft: {
    position: 'absolute',
    left: -4,
    top: 10,
    bottom: -2,
    width: 8,
    backgroundColor: '#D97706',
    borderRadius: 4,
    zIndex: 1,
  },
  openStoryCard: {
    width: '100%',
    backgroundColor: '#FFFDF9',
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#78350F',
    padding: 14,
    borderLeftWidth: 6,
    borderLeftColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  sparkleOverlay: {
    position: 'absolute',
    top: -15,
    right: 15,
    zIndex: 99,
  },
  sparkleIcon: {
    fontSize: 26,
  },
  // Rozet satırı: sığmayanlar alt satıra iner, taşma/çakışma olmaz
  pageHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  floatingDoodleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 3,
    paddingRight: 10,
    borderWidth: 2,
    borderColor: '#F59E0B',
    gap: 6,
    maxWidth: '100%',
  },
  floatingDoodleImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  floatingDoodleText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
    flexShrink: 1,
  },
  characterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#10B981',
    maxWidth: '100%',
  },
  characterPillEmoji: {
    fontSize: 11,
    marginRight: 4,
  },
  characterPillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#047857',
    flexShrink: 1,
  },
  pageCountPill: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  pageCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
  },
  chosenRoadBanner: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  chosenRoadText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
  },
  storyPageTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E1B4B',
    marginBottom: 10,
    lineHeight: 25,
  },
  // Sabit yükseklik yerine oran: ekran büyüyünce sahne de orantılı büyür
  cinematicSceneBox: {
    width: '100%',
    aspectRatio: 480 / 260,
    borderRadius: 20,
    borderWidth: 3.5,
    borderColor: '#F59E0B',
    overflow: 'hidden',
    backgroundColor: '#312E81',
    marginBottom: 12,
    position: 'relative',
  },
  cinematicImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cinematicLoadingCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30, 27, 75, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cinematicLoadingText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FDE68A',
  },
  parchmentTextBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  parchmentSentence: {
    fontSize: 15,
    lineHeight: 24,
    color: '#334155',
    fontWeight: '600',
  },
  parchmentSentenceActive: {
    backgroundColor: '#FEF08A',
    color: '#713F12',
    fontWeight: '900',
    borderRadius: 6,
  },
  playbackControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  playFluffyBtn: {
    paddingVertical: 12,
  },
  stopFluffyBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  narratorSectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    marginBottom: 6,
  },
  narratorScroll: {
    gap: 8,
    paddingBottom: 10,
  },
  narratorBubble: {
    width: 84,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  narratorAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  narratorNameText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1E1B4B',
  },
  narratorNameActive: {
    color: '#D97706',
  },
  pathChoicesCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 2.5,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  pathChoicesTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E1B4B',
    textAlign: 'center',
  },
  pathChoicesSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  choicesTwoCol: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  // Sabit yükseklik yerine minHeight + oranlı görsel
  choiceCardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    minHeight: 185,
    justifyContent: 'space-between',
    gap: 6,
  },
  choiceImgFrame: {
    width: '100%',
    aspectRatio: 1.5,
    maxHeight: 170,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceThumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  choiceLoadingCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceFallbackEmoji: {
    fontSize: 32,
  },
  choiceLabelWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
  },
  choiceLabelText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#1E1B4B',
    textAlign: 'center',
    lineHeight: 15,
  },
  choiceSelectBadge: {
    backgroundColor: '#EA580C',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignSelf: 'center',
  },
  choicesLoadingWrap: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  choicesLoadingText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F59E0B',
  },
  savedReadingNavArea: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginTop: 6,
  },
  savedNavHeader: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E1B4B',
    marginBottom: 8,
  },
  savedNavBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  savedNavBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
  },
  savedNavBtnNext: {
    backgroundColor: '#10B981',
  },
  savedNavBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  exitLibraryBtn: {
    marginTop: 10,
    paddingVertical: 4,
  },
  celebrationEndBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6EE7B7',
    marginTop: 8,
  },
  celebrationTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#065F46',
  },
  celebrationSub: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },

  /* Ayarlar */
  settingsSection: {
    backgroundColor: '#312E81',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#4338CA',
    marginBottom: 14,
  },
  settingsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  volumeValueText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F59E0B',
  },
  settingsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  langBtn: {
    flex: 1,
    backgroundColor: '#1E1B4B',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
    gap: 2,
  },
  langBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#F59E0B',
  },
  langCode: {
    fontSize: 22,
    fontWeight: '900',
    color: '#C7D2FE',
  },
  langBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#C7D2FE',
  },
  langBtnTextActive: {
    color: '#FFF',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderIcon: {
    width: 24,
    textAlign: 'center',
  },
  sliderHitArea: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  sliderTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1E1B4B',
    borderWidth: 1.5,
    borderColor: '#4338CA',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 12,
    borderRadius: 6,
  },
  sliderThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  sliderThumbDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  speedBtn: {
    flex: 1,
    backgroundColor: '#1E1B4B',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#6366F1',
  },
  speedBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#FDE68A',
  },
  clearCacheBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },

  /* Kitaplık */
  emptyLibraryBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 25,
    gap: 8,
  },
  emptyLibraryHead: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FDE68A',
  },
  emptyLibrarySub: {
    fontSize: 12.5,
    color: '#C7D2FE',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 18,
  },
  savedBookShelfItem: {
    flexDirection: 'row',
    backgroundColor: '#312E81',
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#818CF8',
    alignItems: 'center',
    gap: 10,
  },
  savedBookThumb: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  savedBookPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedBookItemTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFF',
  },
  savedBookItemMeta: {
    fontSize: 10.5,
    color: '#C7D2FE',
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 6,
  },
  savedBookActions: {
    flexDirection: 'row',
    gap: 6,
  },
  openSavedBookBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  deleteSavedBookBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: 'center',
  },

  /* Şablon seçici */
  templateModalSub: {
    fontSize: 12,
    color: '#C7D2FE',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  categoryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  categoryChip: {
    backgroundColor: '#312E81',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#4338CA',
  },
  categoryChipActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#C4B5FD',
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 30,
  },
  templateCard: {
    backgroundColor: '#312E81',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  templateCardEmoji: {
    fontSize: 30,
  },
  templateCardName: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#E0E7FF',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  templateHintBanner: {
    width: '100%',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8B5CF6',
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginBottom: 8,
  },

  /* Tuval */
  canvasTopBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  canvasCancelBtn: {
    paddingVertical: 6,
    paddingRight: 4,
    flexShrink: 0,
  },
  canvasTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  canvasTitleText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFF',
    flexShrink: 1,
  },
  activeBrushPreviewBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#312E81',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasDoneBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#34D399',
    flexShrink: 0,
  },
  toolTypeBar: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  toolTypeBtn: {
    flex: 1,
    backgroundColor: '#312E81',
    borderRadius: 14,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4338CA',
  },
  toolTypeBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#F59E0B',
    transform: [{ scale: 1.04 }],
  },
  eraserTypeBtn: {
    borderColor: '#64748B',
  },
  eraserTypeBtnActive: {
    backgroundColor: '#E2E8F0',
    borderColor: '#EF4444',
  },
  toolTypeLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#C7D2FE',
    marginTop: 2,
  },
  toolTypeLabelActive: {
    color: '#FFF',
  },
  canvasBox: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F59E0B',
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  canvasSvgArea: {
    backgroundColor: '#FFFFFF',
  },
  sizeAdjusterRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 8,
    backgroundColor: '#312E81',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#4338CA',
    marginBottom: 10,
  },
  sizeLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sizeAdjusterText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FDE68A',
  },
  brushPickers: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  brushBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E1B4B',
    borderWidth: 1.5,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brushBtnActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#4F46E5',
    transform: [{ scale: 1.15 }],
  },
  quickActions: {
    flexDirection: 'row',
    gap: 6,
  },
  canvasUtilBtn: {
    backgroundColor: '#1E1B4B',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6366F1',
    justifyContent: 'center',
  },
  paletteScroll: {
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  colorBall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  colorBallActive: {
    borderWidth: 3,
    borderColor: '#FFF',
    transform: [{ scale: 1.18 }],
  },
  eraserTipNotice: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
});
