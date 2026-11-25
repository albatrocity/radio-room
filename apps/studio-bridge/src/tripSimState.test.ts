import { afterEach, describe, expect, it } from "vitest"
import { SAMPLE_BRANCH_MAP, SAMPLE_TRIP_MAP } from "@repo/road-trip-map"
import { TripSimRoom } from "@repo/plugin-road-trip/sim"
import type { ChatMessage } from "@repo/types/ChatMessage"
import {
  getTripSim,
  isTripSimSnapshot,
  mergeTripChat,
  resetTripSims,
  setTripSim,
} from "./tripSimState.js"
import { buildStubRoadTripComponentState } from "./stubRoadTrip.js"

const ROOM = "studio-room"
const fixture = () => buildStubRoadTripComponentState(ROOM)

function sandboxChat(content: string, at: number): ChatMessage {
  return {
    content,
    timestamp: new Date(at).toISOString(),
    user: { userId: "u1", username: "Ada" } as ChatMessage["user"],
  }
}

afterEach(() => resetTripSims())

describe("trip sim relay", () => {
  it("prefers the sim's store over the fixture and appends only new chat lines", () => {
    const sim = new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM })
    setTripSim(ROOM, sim.snapshot(), fixture)
    sim.depart()
    const events = setTripSim(ROOM, sim.snapshot(), fixture)

    expect(events.some((e) => e.type === "MESSAGE_DELETED")).toBe(false)
    expect(events[0]).toMatchObject({
      type: "PLUGIN:road-trip:TRIP_UPDATED",
      data: { tripActive: true, trip: { status: "driving" } },
    })
    const received = events.filter((e) => e.type === "MESSAGE_RECEIVED")
    expect(received).toHaveLength(sim.messages.length)
    expect(getTripSim(ROOM)?.store).toBe(events[0]!.data)
  })

  it("publishes and closes the skip poll as the sim opens and resolves it", () => {
    const sim = new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM })
    sim.depart()
    setTripSim(ROOM, sim.snapshot(), fixture)
    while (!sim.poll && sim.step());
    const opened = setTripSim(ROOM, sim.snapshot(), fixture)
    expect(opened.at(-1)).toMatchObject({
      type: "POLL_PUBLISHED",
      data: { poll: { id: sim.poll!.id } },
    })

    const pollId = sim.poll!.id
    sim.setVotes({ stop: 0, skip: 2 })
    while (sim.poll && sim.step());
    const closed = setTripSim(ROOM, sim.snapshot(), fixture)
    expect(closed[0]).toMatchObject({
      type: "POLL_CLOSED",
      data: { poll: { id: pollId, status: "closed" }, results: { totalVotes: 2 } },
    })
  })

  it("clearing the sim falls back to the fixture, closes its poll, and deletes its chat lines", () => {
    const sim = new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM })
    sim.depart()
    while (!sim.poll && sim.step());
    setTripSim(ROOM, sim.snapshot(), fixture)

    const events = setTripSim(ROOM, null, fixture)
    expect(events.slice(0, 2).map((e) => e.type)).toEqual([
      "POLL_CLOSED",
      "PLUGIN:road-trip:TRIP_UPDATED",
    ])
    expect(events[1]!.data).toEqual(fixture())
    expect(events.slice(2)).toEqual(
      sim.messages.map((m) => ({
        type: "MESSAGE_DELETED",
        data: { roomId: ROOM, timestamp: m.timestamp },
      })),
    )
    expect(getTripSim(ROOM)).toBeNull()
  })

  it("a new run replaces the old run's chat lines", () => {
    const first = new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM, clock: () => 1_000 })
    first.depart()
    setTripSim(ROOM, first.snapshot(), fixture)
    const second = new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM, clock: () => 5_000 })
    second.depart()
    const events = setTripSim(ROOM, second.snapshot(), fixture)
    expect(events.filter((e) => e.type === "MESSAGE_DELETED")).toHaveLength(first.messages.length)
    expect(events.filter((e) => e.type === "MESSAGE_RECEIVED")).toHaveLength(second.messages.length)
  })

  it("merges trip lines into sandbox chat by time", () => {
    const sim = new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM, clock: () => 2_000 })
    sim.depart()
    setTripSim(ROOM, sim.snapshot(), fixture)
    const merged = mergeTripChat(ROOM, [sandboxChat("early", 1_000), sandboxChat("late", 9_000)])
    expect(merged[0]?.content).toBe("early")
    expect(merged.at(-1)?.content).toBe("late")
    expect(merged).toHaveLength(2 + sim.messages.length)
  })

  it("relays the van's key items on the trip store (ADR 0230)", () => {
    const sim = new TripSimRoom(SAMPLE_BRANCH_MAP, { roomId: ROOM })
    sim.toggleKeyItem("trail-pass")
    setTripSim(ROOM, sim.snapshot(), fixture)
    const trip = getTripSim(ROOM)?.store.trip as {
      vanSheet?: { keyItems?: { id: string; name: string; icon: string; givenBy: string }[] }
    }
    expect(trip.vanSheet?.keyItems).toEqual([
      expect.objectContaining({
        id: "trail-pass",
        name: "Trail Pass",
        icon: "🎟️",
        givenBy: "The host",
      }),
    ])
  })

  it("validates the posted body", () => {
    expect(isTripSimSnapshot({ roomId: ROOM })).toBe(false)
    expect(isTripSimSnapshot(new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM }).snapshot())).toBe(
      true,
    )
  })

  it("emits SOUND_EFFECT_QUEUED for new narrative sounds on the same run", () => {
    const go = "https://cdn.listeningroom.club/assets/maps/sounds/go.mp3"
    const map = structuredClone(SAMPLE_TRIP_MAP)
    map.narrativeSounds = [{ trigger: "departure", url: go }]
    const sim = new TripSimRoom(map, { roomId: ROOM })
    setTripSim(ROOM, sim.snapshot(), fixture)
    sim.depart()
    const events = setTripSim(ROOM, sim.snapshot(), fixture)
    expect(events.filter((e) => e.type === "SOUND_EFFECT_QUEUED")).toEqual([
      {
        type: "SOUND_EFFECT_QUEUED",
        data: { roomId: ROOM, url: go, volume: 0.6, duck: true },
      },
    ])
  })

  it("does not replay the previous run's sounds on reset", () => {
    const go = "https://cdn.listeningroom.club/assets/maps/sounds/go.mp3"
    const map = structuredClone(SAMPLE_TRIP_MAP)
    map.narrativeSounds = [{ trigger: "departure", url: go }]
    const first = new TripSimRoom(map, { roomId: ROOM, clock: () => 1_000 })
    first.depart()
    setTripSim(ROOM, first.snapshot(), fixture)
    const second = new TripSimRoom(SAMPLE_TRIP_MAP, { roomId: ROOM, clock: () => 5_000 })
    const events = setTripSim(ROOM, second.snapshot(), fixture)
    expect(events.filter((e) => e.type === "SOUND_EFFECT_QUEUED")).toHaveLength(0)
  })
})
