import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { BasePlugin, TimerConfig, Timer } from "./index"
import { PluginContext, PluginAPI, PluginStorage, PluginLifecycle } from "@repo/types"

// Test plugin implementation
interface TestPluginConfig {
  enabled: boolean
  value: string
}

class TestPlugin extends BasePlugin<TestPluginConfig> {
  name = "test-plugin"
  version = "1.0.0"
  
  registerCalled = false
  cleanupCalled = false

  async register(context: PluginContext): Promise<void> {
    this.context = context
    this.registerCalled = true
  }

  protected async onCleanup(): Promise<void> {
    this.cleanupCalled = true
  }
}

// Test plugin with exposed timer methods for testing
class TimerTestPlugin extends BasePlugin {
  name = "timer-test-plugin"
  version = "1.0.0"

  async register(context: PluginContext): Promise<void> {
    this.context = context
  }

  // Expose protected timer methods for testing
  public testStartTimer<T>(id: string, config: TimerConfig<T>): void {
    this.startTimer(id, config)
  }

  public testClearTimer(id: string): boolean {
    return this.clearTimer(id)
  }

  public testClearAllTimers(): void {
    this.clearAllTimers()
  }

  public testGetTimer<T>(id: string): Timer<T> | null {
    return this.getTimer<T>(id)
  }

  public testGetAllTimers(): Timer[] {
    return this.getAllTimers()
  }

  public testResetTimer(id: string): boolean {
    return this.resetTimer(id)
  }

  public testGetTimerRemaining(id: string): number | null {
    return this.getTimerRemaining(id)
  }
}

// Mock context factory
function createMockContext(roomId: string = "test-room"): PluginContext {
  const mockStorage: PluginStorage = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    inc: vi.fn().mockResolvedValue(1),
    dec: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    mget: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn().mockResolvedValue([]),
    zadd: vi.fn().mockResolvedValue(undefined),
    zrem: vi.fn().mockResolvedValue(undefined),
    zrank: vi.fn().mockResolvedValue(null),
    zrevrank: vi.fn().mockResolvedValue(null),
    zrange: vi.fn().mockResolvedValue([]),
    zrangeWithScores: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zremrangebyscore: vi.fn().mockResolvedValue(undefined),
    zscore: vi.fn().mockResolvedValue(null),
    zincrby: vi.fn().mockResolvedValue(0),
  }

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
    updatePlaylistTrack: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn().mockResolvedValue([]),
    emit: vi.fn().mockResolvedValue(undefined),
    queueSoundEffect: vi.fn().mockResolvedValue(undefined),
    queueScreenEffect: vi.fn().mockResolvedValue(undefined),
  }

  const mockLifecycle: PluginLifecycle = {
    on: vi.fn(),
    off: vi.fn(),
  }

  return {
    roomId,
    api: mockApi,
    storage: mockStorage as any, // Cast to include cleanup
    lifecycle: mockLifecycle,
    getRoom: vi.fn().mockResolvedValue(null),
    appContext: {} as any,
  }
}

describe("BasePlugin", () => {
  let plugin: TestPlugin
  let mockContext: PluginContext

  beforeEach(() => {
    plugin = new TestPlugin()
    mockContext = createMockContext()
  })

  describe("register", () => {
    test("should store context when registered", async () => {
      await plugin.register(mockContext)

      expect(plugin.registerCalled).toBe(true)
      expect((plugin as any).context).toBe(mockContext)
    })
  })

  describe("getConfig", () => {
    test("should return null when no context", async () => {
      const config = await (plugin as any).getConfig()

      expect(config).toBeNull()
    })

    test("should fetch config from API when context exists", async () => {
      const mockConfig: TestPluginConfig = { enabled: true, value: "test" }
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)

      await plugin.register(mockContext)
      const config = await (plugin as any).getConfig()

      expect(mockContext.api.getPluginConfig).toHaveBeenCalledWith("test-room", "test-plugin")
      expect(config).toEqual(mockConfig)
    })

    test("should return typed config", async () => {
      const mockConfig: TestPluginConfig = { enabled: false, value: "hello" }
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)

      await plugin.register(mockContext)
      const config = await (plugin as any).getConfig()

      // TypeScript should infer TestPluginConfig | null
      expect(config?.enabled).toBe(false)
      expect(config?.value).toBe("hello")
    })
  })

  describe("cleanup", () => {
    test("should do nothing when no context", async () => {
      await plugin.cleanup()

      expect(plugin.cleanupCalled).toBe(false)
    })

    test("should call storage cleanup when context exists", async () => {
      const mockCleanup = vi.fn().mockResolvedValue(undefined)
      mockContext.storage = {
        ...mockContext.storage,
        cleanup: mockCleanup,
      } as any

      await plugin.register(mockContext)
      await plugin.cleanup()

      expect(mockCleanup).toHaveBeenCalled()
    })

    test("should call onCleanup hook", async () => {
      await plugin.register(mockContext)
      await plugin.cleanup()

      expect(plugin.cleanupCalled).toBe(true)
    })

    test("should set context to null after cleanup", async () => {
      await plugin.register(mockContext)
      expect((plugin as any).context).not.toBeNull()

      await plugin.cleanup()

      expect((plugin as any).context).toBeNull()
    })

    test("should handle cleanup without onCleanup hook", async () => {
      class MinimalPlugin extends BasePlugin {
        name = "minimal"
        version = "1.0.0"

        async register(context: PluginContext): Promise<void> {
          this.context = context
        }
        // No onCleanup defined
      }

      const minimal = new MinimalPlugin()
      await minimal.register(mockContext)
      
      // Should not throw
      await expect(minimal.cleanup()).resolves.not.toThrow()
    })
  })

  describe("integration", () => {
    test("should handle full lifecycle", async () => {
      // Register
      await plugin.register(mockContext)
      expect(plugin.registerCalled).toBe(true)

      // Get config
      const mockConfig: TestPluginConfig = { enabled: true, value: "test" }
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      const config = await (plugin as any).getConfig()
      expect(config).toEqual(mockConfig)

      // Cleanup
      await plugin.cleanup()
      expect(plugin.cleanupCalled).toBe(true)
      expect((plugin as any).context).toBeNull()

      // Config should return null after cleanup
      const configAfterCleanup = await (plugin as any).getConfig()
      expect(configAfterCleanup).toBeNull()
    })
  })

  describe("type safety", () => {
    test("should enforce abstract members", () => {
      // This test verifies that TypeScript enforces the abstract members
      // If this compiles, it means the type constraints are working
      
      class ValidPlugin extends BasePlugin<{ enabled: boolean }> {
        name = "valid"
        version = "1.0.0"
        
        async register(context: PluginContext): Promise<void> {
          this.context = context
        }
      }

      const valid = new ValidPlugin()
      expect(valid.name).toBe("valid")
      expect(valid.version).toBe("1.0.0")
    })

    test("should provide typed config access", async () => {
      interface CustomConfig {
        enabled: boolean
        customField: number
      }

      class TypedPlugin extends BasePlugin<CustomConfig> {
        name = "typed"
        version = "1.0.0"

        async register(context: PluginContext): Promise<void> {
          this.context = context
        }

        async testTypedConfig() {
          const config = await this.getConfig()
          // TypeScript should know config is CustomConfig | null
          return config?.customField
        }
      }

      const typed = new TypedPlugin()
      const mockConfig: CustomConfig = { enabled: true, customField: 42 }
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)

      await typed.register(mockContext)
      const result = await typed.testTypedConfig()

      expect(result).toBe(42)
    })
  })

  describe("timer API", () => {
    let timerPlugin: TimerTestPlugin

    beforeEach(async () => {
      vi.useFakeTimers()
      timerPlugin = new TimerTestPlugin()
      await timerPlugin.register(mockContext)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    describe("startTimer", () => {
      test("should create a timer with the given ID", () => {
        const callback = vi.fn()
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback,
        })

        const timer = timerPlugin.testGetTimer("test-timer")
        expect(timer).not.toBeNull()
        expect(timer?.id).toBe("test-timer")
        expect(timer?.duration).toBe(1000)
      })

      test("should execute callback after duration", async () => {
        const callback = vi.fn()
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback,
        })

        expect(callback).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1000)

        expect(callback).toHaveBeenCalledTimes(1)
      })

      test("should remove timer after callback executes", async () => {
        const callback = vi.fn()
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback,
        })

        expect(timerPlugin.testGetTimer("test-timer")).not.toBeNull()

        await vi.advanceTimersByTimeAsync(1000)

        expect(timerPlugin.testGetTimer("test-timer")).toBeNull()
      })

      test("should replace existing timer with same ID", async () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback: callback1,
        })

        timerPlugin.testStartTimer("test-timer", {
          duration: 2000,
          callback: callback2,
        })

        // Advance past first timer's duration
        await vi.advanceTimersByTimeAsync(1000)
        expect(callback1).not.toHaveBeenCalled()

        // Advance to second timer's duration
        await vi.advanceTimersByTimeAsync(1000)
        expect(callback2).toHaveBeenCalledTimes(1)
      })

      test("should store optional data with timer", () => {
        interface TimerData {
          trackId: string
          userId: string
        }

        timerPlugin.testStartTimer<TimerData>("test-timer", {
          duration: 1000,
          callback: vi.fn(),
          data: { trackId: "track-1", userId: "user-1" },
        })

        const timer = timerPlugin.testGetTimer<TimerData>("test-timer")
        expect(timer?.data?.trackId).toBe("track-1")
        expect(timer?.data?.userId).toBe("user-1")
      })

      test("should handle async callbacks", async () => {
        const results: number[] = []
        const callback = async () => {
          await Promise.resolve()
          results.push(1)
        }

        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback,
        })

        await vi.advanceTimersByTimeAsync(1000)

        expect(results).toEqual([1])
      })

      test("should catch and log callback errors without crashing", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const callback = () => {
          throw new Error("Test error")
        }

        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback,
        })

        await vi.advanceTimersByTimeAsync(1000)

        expect(consoleErrorSpy).toHaveBeenCalled()
        // Timer should still be cleaned up
        expect(timerPlugin.testGetTimer("test-timer")).toBeNull()

        consoleErrorSpy.mockRestore()
      })

      test("should record startTime when timer is created", () => {
        const now = Date.now()
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback: vi.fn(),
        })

        const timer = timerPlugin.testGetTimer("test-timer")
        expect(timer?.startTime).toBe(now)
      })
    })

    describe("clearTimer", () => {
      test("should return true when timer exists and is cleared", () => {
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback: vi.fn(),
        })

        const result = timerPlugin.testClearTimer("test-timer")

        expect(result).toBe(true)
        expect(timerPlugin.testGetTimer("test-timer")).toBeNull()
      })

      test("should return false when timer does not exist", () => {
        const result = timerPlugin.testClearTimer("nonexistent")

        expect(result).toBe(false)
      })

      test("should prevent callback from executing", async () => {
        const callback = vi.fn()
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback,
        })

        timerPlugin.testClearTimer("test-timer")
        await vi.advanceTimersByTimeAsync(1000)

        expect(callback).not.toHaveBeenCalled()
      })
    })

    describe("clearAllTimers", () => {
      test("should clear all active timers", () => {
        timerPlugin.testStartTimer("timer-1", { duration: 1000, callback: vi.fn() })
        timerPlugin.testStartTimer("timer-2", { duration: 2000, callback: vi.fn() })
        timerPlugin.testStartTimer("timer-3", { duration: 3000, callback: vi.fn() })

        expect(timerPlugin.testGetAllTimers()).toHaveLength(3)

        timerPlugin.testClearAllTimers()

        expect(timerPlugin.testGetAllTimers()).toHaveLength(0)
      })

      test("should prevent all callbacks from executing", async () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        timerPlugin.testStartTimer("timer-1", { duration: 1000, callback: callback1 })
        timerPlugin.testStartTimer("timer-2", { duration: 2000, callback: callback2 })

        timerPlugin.testClearAllTimers()
        await vi.advanceTimersByTimeAsync(3000)

        expect(callback1).not.toHaveBeenCalled()
        expect(callback2).not.toHaveBeenCalled()
      })

      test("should handle empty timer map", () => {
        // Should not throw
        expect(() => timerPlugin.testClearAllTimers()).not.toThrow()
      })
    })

    describe("getTimer", () => {
      test("should return timer info when timer exists", () => {
        timerPlugin.testStartTimer("test-timer", {
          duration: 5000,
          callback: vi.fn(),
          data: { foo: "bar" },
        })

        const timer = timerPlugin.testGetTimer("test-timer")

        expect(timer).not.toBeNull()
        expect(timer?.id).toBe("test-timer")
        expect(timer?.duration).toBe(5000)
        expect(timer?.data).toEqual({ foo: "bar" })
        expect(timer?.startTime).toBeDefined()
      })

      test("should return null when timer does not exist", () => {
        const timer = timerPlugin.testGetTimer("nonexistent")

        expect(timer).toBeNull()
      })

      test("should not expose internal timeout handle", () => {
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback: vi.fn(),
        })

        const timer = timerPlugin.testGetTimer("test-timer")

        // Timer should not have timeout or callback properties
        expect(timer).not.toHaveProperty("timeout")
        expect(timer).not.toHaveProperty("callback")
      })
    })

    describe("getAllTimers", () => {
      test("should return empty array when no timers", () => {
        const timers = timerPlugin.testGetAllTimers()

        expect(timers).toEqual([])
      })

      test("should return all active timers", () => {
        timerPlugin.testStartTimer("timer-1", { duration: 1000, callback: vi.fn() })
        timerPlugin.testStartTimer("timer-2", { duration: 2000, callback: vi.fn() })

        const timers = timerPlugin.testGetAllTimers()

        expect(timers).toHaveLength(2)
        expect(timers.map((t) => t.id).sort()).toEqual(["timer-1", "timer-2"])
      })

      test("should not include expired timers", async () => {
        timerPlugin.testStartTimer("timer-1", { duration: 1000, callback: vi.fn() })
        timerPlugin.testStartTimer("timer-2", { duration: 2000, callback: vi.fn() })

        await vi.advanceTimersByTimeAsync(1000)

        const timers = timerPlugin.testGetAllTimers()

        expect(timers).toHaveLength(1)
        expect(timers[0].id).toBe("timer-2")
      })
    })

    describe("resetTimer", () => {
      test("should return true and restart timer when it exists", async () => {
        const callback = vi.fn()
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback,
        })

        // Advance halfway
        await vi.advanceTimersByTimeAsync(500)
        expect(callback).not.toHaveBeenCalled()

        // Reset the timer
        const result = timerPlugin.testResetTimer("test-timer")
        expect(result).toBe(true)

        // Advance another 500ms - should not trigger since timer was reset
        await vi.advanceTimersByTimeAsync(500)
        expect(callback).not.toHaveBeenCalled()

        // Advance another 500ms - now it should trigger (1000ms from reset)
        await vi.advanceTimersByTimeAsync(500)
        expect(callback).toHaveBeenCalledTimes(1)
      })

      test("should return false when timer does not exist", () => {
        const result = timerPlugin.testResetTimer("nonexistent")

        expect(result).toBe(false)
      })

      test("should update startTime when reset", async () => {
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback: vi.fn(),
        })

        const originalStartTime = timerPlugin.testGetTimer("test-timer")?.startTime

        // Advance time and reset
        await vi.advanceTimersByTimeAsync(500)
        timerPlugin.testResetTimer("test-timer")

        const newStartTime = timerPlugin.testGetTimer("test-timer")?.startTime

        expect(newStartTime).toBeGreaterThan(originalStartTime!)
      })

      test("should preserve timer data after reset", () => {
        interface TimerData {
          trackId: string
        }

        timerPlugin.testStartTimer<TimerData>("test-timer", {
          duration: 1000,
          callback: vi.fn(),
          data: { trackId: "track-1" },
        })

        timerPlugin.testResetTimer("test-timer")

        const timer = timerPlugin.testGetTimer<TimerData>("test-timer")
        expect(timer?.data?.trackId).toBe("track-1")
      })
    })

    describe("getTimerRemaining", () => {
      test("should return remaining time for active timer", async () => {
        timerPlugin.testStartTimer("test-timer", {
          duration: 1000,
          callback: vi.fn(),
        })

        // Initially should be ~1000ms
        expect(timerPlugin.testGetTimerRemaining("test-timer")).toBe(1000)

        // After 300ms, should be ~700ms
        await vi.advanceTimersByTimeAsync(300)
        expect(timerPlugin.testGetTimerRemaining("test-timer")).toBe(700)

        // After 700 more ms, should be 0
        await vi.advanceTimersByTimeAsync(700)
        // Timer has expired and been cleaned up
        expect(timerPlugin.testGetTimerRemaining("test-timer")).toBeNull()
      })

      test("should return null for nonexistent timer", () => {
        const remaining = timerPlugin.testGetTimerRemaining("nonexistent")

        expect(remaining).toBeNull()
      })

      test("should never return negative value", async () => {
        timerPlugin.testStartTimer("test-timer", {
          duration: 100,
          callback: vi.fn(),
        })

        // Don't advance the timer, just check that remaining is calculated correctly
        const remaining = timerPlugin.testGetTimerRemaining("test-timer")
        expect(remaining).toBeGreaterThanOrEqual(0)
      })
    })

    describe("cleanup integration", () => {
      test("should clear all timers when cleanup is called", async () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        timerPlugin.testStartTimer("timer-1", { duration: 1000, callback: callback1 })
        timerPlugin.testStartTimer("timer-2", { duration: 2000, callback: callback2 })

        expect(timerPlugin.testGetAllTimers()).toHaveLength(2)

        await timerPlugin.cleanup()

        expect(timerPlugin.testGetAllTimers()).toHaveLength(0)

        // Callbacks should not execute after cleanup
        await vi.advanceTimersByTimeAsync(3000)
        expect(callback1).not.toHaveBeenCalled()
        expect(callback2).not.toHaveBeenCalled()
      })
    })

    describe("multiple timers", () => {
      test("should handle multiple independent timers", async () => {
        const results: string[] = []

        timerPlugin.testStartTimer("timer-1", {
          duration: 1000,
          callback: () => { results.push("timer-1") },
        })
        timerPlugin.testStartTimer("timer-2", {
          duration: 500,
          callback: () => { results.push("timer-2") },
        })
        timerPlugin.testStartTimer("timer-3", {
          duration: 1500,
          callback: () => { results.push("timer-3") },
        })

        await vi.advanceTimersByTimeAsync(500)
        expect(results).toEqual(["timer-2"])

        await vi.advanceTimersByTimeAsync(500)
        expect(results).toEqual(["timer-2", "timer-1"])

        await vi.advanceTimersByTimeAsync(500)
        expect(results).toEqual(["timer-2", "timer-1", "timer-3"])
      })

      test("should allow clearing individual timers without affecting others", async () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        timerPlugin.testStartTimer("timer-1", { duration: 1000, callback: callback1 })
        timerPlugin.testStartTimer("timer-2", { duration: 1000, callback: callback2 })

        timerPlugin.testClearTimer("timer-1")

        await vi.advanceTimersByTimeAsync(1000)

        expect(callback1).not.toHaveBeenCalled()
        expect(callback2).toHaveBeenCalledTimes(1)
      })
    })
  })
})

