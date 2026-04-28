import { vi } from "vitest";
import type * as Obsidian from "obsidian";
import * as obsidianMock from "./tests/obsidian";

vi.mock("obsidian", () => obsidianMock as unknown as typeof Obsidian);
