// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealerLogger } from "../../../src/core/utils/HealerLogger";
import { CryptoUtils } from "../../../src/core/utils/CryptoUtils";
import { TFile, TFolder } from "obsidian";

vi.mock("obsidian", () => ({
  TFile: class MockTFile {
    path: string = "";
    stat: any = { size: 0 };
  },
  TFolder: class MockTFolder {
    path: string = "";
  },
  Plugin: class MockPlugin {
    app: any;
    constructor() {
      this.app = {};
    }
  },
  normalizePath: (p: string) => p,
}));

describe("Utils Hardening", () => {
  describe("HealerLogger (Ultra-Hardening Audit)", () => {
    let plugin: any;
    let settings: any;

    beforeEach(() => {
      settings = {
        logLevel: "debug",
        enableFileLogging: true,
        logFilePath: "logs",
        logBufferSize: 1000,
      };

      plugin = {
        app: {
          vault: {
            getAbstractFileByPath: vi.fn(),
            createFolder: vi.fn(),
            create: vi.fn(),
            read: vi.fn(),
            modify: vi.fn(),
            rename: vi.fn(),
            process: vi.fn(
              async (file: TFile, fn: (data: string) => string) => {
                const current = await plugin.app.vault.read(file);
                const updated = fn(current);
                return updated;
              },
            ),
            adapter: {
              append: vi.fn(),
            },
          },
        },
        saveSettings: vi.fn(),
      };
    });

    it("ULTRA-1: masks Bearer and JWT in raw strings", () => {
      const logger = new HealerLogger("Test", plugin as any, settings);

      // @ts-ignore
      const output = (logger as any).formatLogLine({
        timestamp: "2026-04-17",
        level: "info",
        module: "Test",
        message:
          "Auth: Bearer secret-token-123. JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoyMDI2fQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      });

      expect(output).toContain("Bearer ***");
      expect(output).toContain("***JWT***");
      expect(output).not.toContain("secret-token-123");
      expect(output).not.toContain("eyJhbGci");
    });

    it("ULTRA-2: neutralizes control characters (TAB, NULL, etc.)", () => {
      const logger = new HealerLogger("Test", plugin as any, settings);

      // @ts-ignore
      const output = (logger as any).formatLogLine({
        timestamp: "2026-04-17",
        level: "info",
        module: "Test",
        message: "Control\tChars\0End",
      });

      expect(output).toContain("Control\\tChars\\u0000End");
      expect(output).not.toContain("\t");
    });

    it("ULTRA-3: handles log folder path collision gracefully", async () => {
      const logger = new HealerLogger("Test", plugin as any, settings);

      // Returning a mock TFile instead of a TFolder for the folder path
      const mockFile = new TFile();
      plugin.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);

      // @ts-ignore - trigger writeToFile
      await (logger as any).writeToFile({
        timestamp: "2026-04-17",
        level: "info",
        module: "Test",
        message: "wont write",
      });

      // Should NOT try to create the log file if folder is a file collision
      expect(plugin.app.vault.create).not.toHaveBeenCalled();
    });

    it("ULTRA-4: respects max log size and performs rotation", async () => {
      const logger = new HealerLogger("Test", plugin as any, settings);
      const mockFile = new TFile();
      mockFile.path = "logs/healer-today.log";
      mockFile.stat.size = 5 * 1024 * 1024; // 5MB > 2MB Cap

      const mockFolder = new TFolder();
      plugin.app.vault.getAbstractFileByPath.mockReturnValueOnce(mockFolder); // folder call
      plugin.app.vault.getAbstractFileByPath.mockReturnValueOnce(mockFile); // file call

      plugin.app.vault.create.mockResolvedValue(new TFile()); // New file after rotate

      // @ts-ignore
      await (logger as any).writeToFile({
        timestamp: "2026-04-17",
        level: "info",
        module: "Test",
        message: "trigger rotate",
      });

      expect(plugin.app.vault.rename).toHaveBeenCalled();
      expect(plugin.app.vault.create).toHaveBeenCalled();
    });

    it("ULTRA-5: prioritizes append over process for O(1) performance", async () => {
      const logger = new HealerLogger("Test", plugin as any, settings);
      const mockFile = new TFile();
      mockFile.path = "logs/healer-today.log";

      plugin.app.vault.getAbstractFileByPath.mockReturnValueOnce(new TFolder());
      plugin.app.vault.getAbstractFileByPath.mockReturnValueOnce(mockFile);

      // Mock Vault.append exists (Native API)
      plugin.app.vault.append = vi.fn();

      // @ts-ignore
      await (logger as any).writeToFile({
        timestamp: "2026-04-17",
        level: "info",
        module: "Test",
        message: "fast append",
      });

      expect(plugin.app.vault.append).toHaveBeenCalled();
      expect(plugin.app.vault.process).not.toHaveBeenCalled();
    });

    it("ULTRA-6: respects logBufferSize (no hardcoded 1000)", () => {
      const smallSettings = {
        ...settings,
        enableFileLogging: false,
        logBufferSize: 3,
      };
      const logger = new HealerLogger("Test", plugin as any, smallSettings);
      logger.info("m1");
      logger.info("m2");
      logger.info("m3");
      logger.info("m4");
      logger.info("m5");

      expect(logger.getStats().total).toBe(3);
      const out = logger.exportLogs();
      expect(out).toContain("m3");
      expect(out).toContain("m4");
      expect(out).toContain("m5");
      expect(out).not.toContain("m1");
      expect(out).not.toContain("m2");
    });

    it("ULTRA-7: clearBuffer leaves buffer empty", () => {
      const logger = new HealerLogger("Test", plugin as any, {
        ...settings,
        enableFileLogging: false, // avoids async I/O in this sync test
        logBufferSize: 1000,
      });

      logger.info("a");
      logger.info("b");
      expect(logger.getStats().total).toBe(2);

      logger.clearBuffer();
      expect(logger.getStats().total).toBe(0);

      // exportLogs must be empty if buffer is empty
      expect(logger.exportLogs()).toBe("");
    });
  });

  describe("CryptoUtils (Existing Hardening)", () => {
    const master = "master-key";
    const salt = "vault-salt";

    it("encrypts and decrypts large payloads", async () => {
      const largeData = "A".repeat(100 * 1024);
      const encrypted = await CryptoUtils.encrypt(largeData, master, salt);
      const decrypted = await CryptoUtils.decrypt(encrypted, master, salt);
      expect(decrypted).toBe(largeData);
    });
  });
});
