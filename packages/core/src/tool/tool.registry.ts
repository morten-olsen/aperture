import type { Services } from '../utils/utils.service.js';

import type { Tool } from './tool.types.js';

type ToolRegisteredCallback = (tool: Tool) => void;

class ToolRegistry {
  #tools: Map<string, Tool>;
  #onRegisteredCallbacks: Set<ToolRegisteredCallback>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_services: Services) {
    this.#tools = new Map();
    this.#onRegisteredCallbacks = new Set();
  }

  public getTools = (): Tool[] => {
    return [...this.#tools.values()];
  };

  public getTool = (id: string): Tool | undefined => {
    return this.#tools.get(id);
  };

  public onToolRegistered = (cb: ToolRegisteredCallback): (() => void) => {
    this.#onRegisteredCallbacks.add(cb);
    return () => {
      this.#onRegisteredCallbacks.delete(cb);
    };
  };

  public registerTool = (tool: Tool) => {
    this.#tools.set(tool.id, tool);
    for (const cb of this.#onRegisteredCallbacks) {
      cb(tool);
    }
  };

  public registerTools = (tools: Tool[]) => {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  };
}

export type { ToolRegisteredCallback };
export { ToolRegistry };
