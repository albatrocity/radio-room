import { describe, expect, test, vi, beforeEach } from "vitest"
import { BasePlugin } from "./index"
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

// Mock context factory
function createMockContext(roomId: string = "test-room"): PluginContext {
  const mockStorage: PluginStorage = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    inc: vi.fn().mockResolvedValue(1),
    dec: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
  }

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
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
})

