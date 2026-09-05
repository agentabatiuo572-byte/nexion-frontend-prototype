// 15 fictitious AI clients per design doc §7.5.
// Used as task source / receipt signer / hub label across the prototype.
// Each client has a fixed mock 0x address (will be displayed on Proof-of-Compute
// receipts in §6.9, P0-4).

import type { TaskCategory } from "../store/types";

export interface AIClient {
  id: string;
  name: string;
  tagline: string;
  city: string;
  country: string; // ISO code for flag display
  workloads: TaskCategory[];
  // Mock EVM-style address — for Proof-of-Compute receipt display only.
  // Not real, no private key, no on-chain footprint.
  address: string;
}

export const AI_CLIENTS: AIClient[] = [
  {
    id: "mosaic",
    name: "Mosaic Studios",
    tagline: "Generative imagery for indie creators",
    city: "Berlin",
    country: "DE",
    workloads: ["IG"],
    address: "0x4f7a2c8e9b1d3f5a6c8e0b2d4f6a8c0e2b4d6f8a",
  },
  {
    id: "atrium",
    name: "Atrium AI",
    tagline: "Cinematic AI video, on demand",
    city: "Los Angeles",
    country: "US",
    workloads: ["VG"],
    address: "0x2b9f4e6a8c1d3f5b7e9a2c4d6f8b0e2a4c6d8f0b",
  },
  {
    id: "helix",
    name: "Helix Labs",
    tagline: "Open-source LLM serving",
    city: "San Francisco",
    country: "US",
    workloads: ["LL"],
    address: "0x7c2b9a4e8f3c1d6e0a5b8d2f4c7e1a3b5d7f9c1e",
  },
  {
    id: "conduit",
    name: "Conduit AI",
    tagline: "API gateway for foundation models",
    city: "Seoul",
    country: "KR",
    workloads: ["LL"],
    address: "0x1a3c5e7f9b2d4a6c8e0f2b4d6a8c0e2f4b6d8a0c",
  },
  {
    id: "northwind",
    name: "Northwind Research",
    tagline: "Open research, public weights",
    city: "Toronto",
    country: "CA",
    workloads: ["FT", "LL"],
    address: "0x9e1d7c5b3a8f6e4d2c1b0a9f8e7d6c5b4a3f2e1d",
  },
  {
    id: "tuneforge",
    name: "TuneForge",
    tagline: "Custom fine-tunes in 24 hours",
    city: "Tel Aviv",
    country: "IL",
    workloads: ["FT"],
    address: "0x6b8d0a2c4e6f8b1d3a5c7e9f2b4d6a8c0e2f4b6d",
  },
  {
    id: "vector",
    name: "Vector Foundry",
    tagline: "Embeddings infrastructure for RAG",
    city: "Singapore",
    country: "SG",
    workloads: ["EM"],
    address: "0x3f5b7d9a1c3e5f7b9d2a4c6e8f1b3d5a7c9e1f3b",
  },
  {
    id: "soundgrid",
    name: "Soundgrid",
    tagline: "Speech-to-text at scale",
    city: "Stockholm",
    country: "SE",
    workloads: ["SP"],
    address: "0x8c0e2a4f6b8d1c3e5a7f9b2d4c6e8a1f3b5d7c9e",
  },
  {
    id: "voxlane",
    name: "VoxLane",
    tagline: "Realtime voice for products",
    city: "Tokyo",
    country: "JP",
    workloads: ["SP"],
    address: "0x5d7f9b1a3c5e7f9b2d4a6c8e0f2b4d6a8c1e3f5b",
  },
  {
    id: "framecraft",
    name: "FrameCraft",
    tagline: "AI-assisted post-production for film",
    city: "Vancouver",
    country: "CA",
    workloads: ["VG", "IG"],
    address: "0x0a2c4e6f8b1d3a5c7e9f2b4d6a8c0e2f4b6d8a0c",
  },
  {
    id: "vertex",
    name: "Vertex Vision",
    tagline: "Computer vision API for retail",
    city: "Amsterdam",
    country: "NL",
    workloads: ["IG", "EM"],
    address: "0x4e6f8b0a2c4d6e8f1b3a5c7d9e2f4a6c8b0d2e4f",
  },
  {
    id: "pinnacle",
    name: "Pinnacle ML",
    tagline: "Enterprise ML model hosting",
    city: "London",
    country: "GB",
    workloads: ["LL"],
    address: "0xa1c3e5f7b9d2a4c6e8f1b3d5a7c9e1f3b5d7a9c1",
  },
  {
    id: "loom",
    name: "Loom Intelligence",
    tagline: "Document understanding agents",
    city: "Bangalore",
    country: "IN",
    workloads: ["EM", "LL"],
    address: "0xb3d5a7c9e1f3b5d7a9c1e3f5b7d9a1c3e5f7b9d2",
  },
  {
    id: "glasswing",
    name: "Glasswing AI",
    tagline: "Multimodal agents for accessibility",
    city: "Dublin",
    country: "IE",
    workloads: ["LL", "SP", "IG"],
    address: "0xc5e7f9b1d3a5c7e9f2b4d6a8c0e2f4b6d8a0c2e4",
  },
  {
    id: "cobalt",
    name: "Cobalt Compute",
    tagline: "Compute aggregation for AI startups",
    city: "Zurich",
    country: "CH",
    // Cobalt is the meta-aggregator client — accepts any workload (§7.5)
    workloads: ["IG", "VG", "LL", "FT", "EM", "SP"],
    address: "0xd7a9c1e3f5b7d9a1c3e5f7b9d2a4c6e8f1b3d5a7",
  },
  // ───── v3.2 mobile AI clients ─────
  {
    id: "pocket-studios",
    name: "Pocket Studios",
    tagline: "On-device AI for mobile-first apps",
    city: "Berlin",
    country: "DE",
    workloads: ["IG"],
    address: "0xe9f1b3d5a7c9e1f3b5d7a9c1e3f5b7d9a2c4e6f8",
  },
  {
    id: "echo-earbuds",
    name: "Echo Earbuds",
    tagline: "Realtime translation for wireless audio",
    city: "Shenzhen",
    country: "CN",
    workloads: ["SP"],
    address: "0xf1b3d5a7c9e1f3b5d7a9c1e3f5b7d9a2c4e6f8b0",
  },
];

// Pick a client whose workloads include the given task category.
// Falls back to Cobalt (the universal aggregator) if no specialist matches.
export function pickClientFor(category: TaskCategory): AIClient {
  const candidates = AI_CLIENTS.filter((c) => c.workloads.includes(category));
  if (candidates.length === 0) {
    return AI_CLIENTS.find((c) => c.id === "cobalt")!;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getClientById(id: string): AIClient | undefined {
  return AI_CLIENTS.find((c) => c.id === id);
}
