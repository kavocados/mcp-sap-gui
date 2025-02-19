#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { SapController } from './sap_controller.js';

// Configure logging
const logger = {
  info: (...args) => console.error('[INFO]', ...args),
  debug: (...args) => console.error('[DEBUG]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warning: (...args) => console.error('[WARN]', ...args)
};

class SapGuiServer {
  constructor() {
    logger.info("Initializing SAP GUI Server...");
    this.sap = null; // Initialize lazily
    this.server = new Server(
      {
        name: "mcp-sap-gui",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    logger.info("Setting up request handlers...");
    this.setupHandlers();
    logger.info("SAP GUI Server initialized");
    this.lastScreenshot = null;
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "launch_transaction",
          description: "Launch SAP transaction code",
          inputSchema: {
            type: "object",
            properties: {
              transaction: {
                type: "string",
                description: "Transaction code (e.g. VA01)"
              }
            },
            required: ["transaction"]
          }
        },
        {
          name: "sap_click",
          description: "Click at specific coordinates",
          inputSchema: {
            type: "object",
            properties: {
              x: {
                type: "integer",
                description: "X coordinate"
              },
              y: {
                type: "integer",
                description: "Y coordinate"
              }
            },
            required: ["x", "y"]
          }
        },
        {
          name: "sap_move_mouse",
          description: "Move mouse to specific coordinates",
          inputSchema: {
            type: "object",
            properties: {
              x: {
                type: "integer",
                description: "X coordinate"
              },
              y: {
                type: "integer",
                description: "Y coordinate"
              }
            },
            required: ["x", "y"]
          }
        },
        {
          name: "sap_type",
          description: "Type text at current cursor position",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Text to type"
              }
            },
            required: ["text"]
          }
        },
        {
          name: "sap_scroll",
          description: "Scroll SAP GUI screen",
          inputSchema: {
            type: "object",
            properties: {
              direction: {
                type: "string",
                enum: ["up", "down"],
                description: "Scroll direction"
              }
            },
            required: ["direction"]
          }
        },
        {
          name: "end_transaction",
          description: "End current SAP transaction",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "save_last_screenshot",
          description: "Save the last captured screenshot",
          inputSchema: {
            type: "object",
            properties: {
              filename: {
                type: "string",
                description: "Filename to save the screenshot"
              }
            },
            required: ["filename"]
          }
        },
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        logger.info(`Executing tool: ${request.params.name} with arguments:`, request.params.arguments);
        const sap = this.getSapController();

        let result;
        switch (request.params.name) {
          case "launch_transaction":
            logger.info(`Launching transaction: ${request.params.arguments.transaction}`);
            result = await sap.launchTransaction(request.params.arguments.transaction);
            break;

          case "sap_click":
            try {
              const x = parseInt(request.params.arguments.x);
              const y = parseInt(request.params.arguments.y);
              if (isNaN(x) || isNaN(y)) {
                throw new Error("Coordinates must be valid integers");
              }
              logger.info(`Clicking at position: (${x}, ${y})`);
              result = await sap.clickPosition(x, y);
            } catch (error) {
              throw new McpError(ErrorCode.InvalidParams, `Invalid coordinates: ${error.message}`);
            }
            break;

          case "sap_move_mouse":
            logger.info(`Moving mouse to: (${request.params.arguments.x}, ${request.params.arguments.y})`);
            result = await sap.moveMouse(request.params.arguments.x, request.params.arguments.y);
            break;

          case "sap_type":
            logger.info(`Typing text: ${request.params.arguments.text}`);
            result = await sap.typeText(request.params.arguments.text);
            break;

          case "sap_scroll":
            logger.info(`Scrolling screen: ${request.params.arguments.direction}`);
            result = await sap.scrollScreen(request.params.arguments.direction);
            break;

          case "end_transaction":
            logger.info("Ending transaction");
            await sap.endSession();
            result = { status: "success" };
            break;

          case "save_last_screenshot":
            if (!this.lastScreenshot) {
              return [{
                type: "text",
                text: "Error: No screenshot available"
              }];
            }
            const filename = request.params.arguments.filename;
            if (!filename) {
              return [{
                type: "text",
                text: "Error: Filename is required"
              }];
            }
            try {
              // Save screenshot
              const fs = await import('fs/promises');
              await fs.writeFile(filename, Buffer.from(this.lastScreenshot, 'base64'));
              logger.info(`Screenshot saved to ${filename}`);
              return [{
                type: "text",
                text: `Screenshot saved to ${filename}`
              }];
            } catch (error) {
              logger.error(`Error saving screenshot: ${error.message}`);
              return [{
                type: "text",
                text: `Error saving screenshot: ${error.message}`
              }];
            }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }

        // Format response
        const content = [];

        // Add status text if available
        if (result.status) {
          const statusText = `Status: ${result.status}${result.message ? `\n${result.message}` : ''}`;
          logger.info(`Tool execution result - ${statusText}`);
          content.push({
            type: "text",
            text: statusText
          });
        }

        // Add screenshot if available and store it
        if (result.screenshot) {
          logger.info("Screenshot captured in response");
          this.lastScreenshot = result.screenshot;
          content.push({
            type: "image",
            data: result.screenshot,
            mimeType: "image/png"
          });
        }

        logger.info(`Tool ${request.params.name} executed successfully`);
        return content;

      } catch (error) {
        logger.error(`Error executing ${request.params.name}: ${error.message}`, error);
        const errorMsg = `Error executing ${request.params.name}: ${error.message}`;
        return [{
          type: "text",
          text: `Error: ${errorMsg}`
        }];
      }
    });
  }

  getSapController() {
    if (!this.sap) {
      logger.info("Initializing new SAP controller instance...");
      try {
        this.sap = new SapController();
        logger.info("SAP controller initialized successfully");
      } catch (error) {
        logger.error(`Error initializing SAP controller: ${error.message}`, error);
        throw error;
      }
    } else {
      logger.debug("Using existing SAP controller instance");
    }
    return this.sap;
  }

  async start() {
    logger.info("SAP GUI MCP server starting...");
    try {
      logger.info("Initializing stdio server transport...");
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info("Server transport initialized, MCP server started successfully");
    } catch (error) {
      logger.error(`Error starting server: ${error.message}`, error);
      throw error;
    } finally {
      logger.info("Server shutting down...");
      if (this.sap) {
        try {
          await this.sap.endSession();
          logger.info("SAP session ended successfully");
        } catch (error) {
          logger.error(`Error ending SAP session: ${error.message}`, error);
        }
      }
    }
  }
}

// Start server
const server = new SapGuiServer();
server.start().catch(console.error);
