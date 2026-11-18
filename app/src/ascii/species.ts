// Adapted from https://github.com/stackedlol/ascii-sharks (MIT License, Copyright (c) 2026 drewdi).

export interface Species {
  name: string;
  cruise: number;
  maxSpeed: number;
  minSpeed: number;
  weight: number;
  schoolSize: [number, number];
  spacing: [number, number];
  align: number;
  cohesion: number;
  jitter: number;
  mill: number;
  verticalDrag: number;
}

export const SPECIES: Species[] = [
  {
    name: "sardine",
    cruise: 36,
    maxSpeed: 64,
    minSpeed: 18,
    weight: 3,
    schoolSize: [18, 28],
    spacing: [1.8, 1.1],
    align: 1.6,
    cohesion: 1.6,
    jitter: 40,
    mill: 70,
    verticalDrag: 0.5,
  },
  {
    name: "anchovy",
    cruise: 46,
    maxSpeed: 78,
    minSpeed: 22,
    weight: 3,
    schoolSize: [20, 32],
    spacing: [1.5, 1],
    align: 3.2,
    cohesion: 0.45,
    jitter: 30,
    mill: 0,
    verticalDrag: 1.4,
  },
  {
    name: "silverside",
    cruise: 40,
    maxSpeed: 70,
    minSpeed: 20,
    weight: 3,
    schoolSize: [12, 20],
    spacing: [2, 1.1],
    align: 2.4,
    cohesion: 1.1,
    jitter: 35,
    mill: 0,
    verticalDrag: 1.6,
  },
  {
    name: "mackerel",
    cruise: 32,
    maxSpeed: 60,
    minSpeed: 16,
    weight: 2,
    schoolSize: [5, 9],
    spacing: [2.6, 1.3],
    align: 2,
    cohesion: 0.9,
    jitter: 25,
    mill: 0,
    verticalDrag: 2,
  },
  {
    name: "goby",
    cruise: 26,
    maxSpeed: 56,
    minSpeed: 10,
    weight: 1,
    schoolSize: [8, 12],
    spacing: [1.4, 1.1],
    align: 0.35,
    cohesion: 1.4,
    jitter: 110,
    mill: 0,
    verticalDrag: 0.3,
  },
];

const TOTAL_WEIGHT = SPECIES.reduce((sum, s) => sum + s.weight, 0);

export function pickSpecies() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < SPECIES.length; i++) {
    r -= SPECIES[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}
